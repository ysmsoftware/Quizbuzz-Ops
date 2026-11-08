'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Building2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  Lock,
  Clock,
} from 'lucide-react';
import {
  calculateSubscriptionPricing,
  calculateProratedBase,
  resolvePlanCyclePrice,
  type PlanCyclePricing,
  type CurrentSubscriptionForProration,
  availableCyclesForPlan,
  cycleLabel,
  type BillingCycleChoice,
} from '@/lib/pricing/subscriptionPricing';
import { formatInr } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    // Loaded from checkout.razorpay.com at runtime; only the surface used here is typed.
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Response of POST /api/v1/billing-portal/session. */
interface CheckoutSessionData {
  session: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string | null;
    adminId: string | null;
    adminEmail: string | null;
    adminName: string | null;
  };
  plan: PlanCyclePricing & { id: string; name: string; description: string; features: string[] };
  currentSubscription: (CurrentSubscriptionForProration & { planId: string; planName: string }) | null;
  autoDebit: { available: boolean; firstChargeAt: string | null; current: { planId: string; billingCycle: string } | null };
  /** Cycles of this plan that would be a downgrade now: they start at the period end instead of being charged. */
  change: { scheduledCycles: string[]; on: string | null; currentPlanName: string | null };
}

type PayMode = 'auto' | 'once';
const AUTO_CYCLES: string[] = ['MONTHLY', 'HALF_YEARLY'];

const RAZORPAY_BRAND_TEAL = '#0d9488';
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 36; // 90 seconds

type PayState = 'idle' | 'creating_order' | 'checkout_open' | 'confirming' | 'timeout';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState<string | null>(
    token ? null : 'No billing handoff token provided. Please start checkout from the main application.'
  );
  const [sessionData, setSessionData] = useState<CheckoutSessionData | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycleChoice | null>(null);
  const asked = searchParams.get('mode');
  const [chosenMode, setMode] = useState<PayMode | null>(asked === 'once' || asked === 'auto' ? asked : null);

  const pollStopRef = useRef<(() => void) | null>(null);

  const mainAppUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || 'http://localhost:3000';
  // Organizer URLs are /org/[orgSlug]/…; bare /org opens the signed-in user's active org (keeps the query).
  const billingUrl = (query = '') => {
    const slug = sessionData?.session?.organizationSlug;
    return `${mainAppUrl}${slug ? `/org/${slug}/settings` : '/org'}?tab=billing${query}`;
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    if (!token) return;

    fetch('/api/v1/billing-portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setSessionData(res.data);
          const cycles = availableCyclesForPlan(res.data.plan);
          // The Billing page passes the cycle the org is on, so "turn on automatic renewal" lands on it.
          const asked = searchParams.get('cycle') as BillingCycleChoice | null;
          setCycle(asked && cycles.includes(asked) ? asked : cycles[0] || null);
        } else {
          setError(res.message || 'Failed to verify checkout session.');
        }
      })
      .catch((err) => {
        console.error('Session verify error:', err);
        setError('Connection error verifying checkout session.');
      })
      .finally(() => setLoading(false));

    return () => {
      if (pollStopRef.current) pollStopRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on load
  }, [token]);

  const availableCycles = useMemo(
    () => (sessionData?.plan ? availableCyclesForPlan(sessionData.plan) : []),
    [sessionData]
  );

  const canAuto = !!sessionData?.autoDebit?.available && !!cycle && AUTO_CYCLES.includes(cycle);
  // Unasked, a change of plan with paid time left defaults to paying now: automatic renewal would only switch at the period end.
  const mode: PayMode = chosenMode ?? (sessionData?.autoDebit?.firstChargeAt ? 'once' : 'auto');
  const auto = canAuto && mode === 'auto';
  // Already paying this plan automatically: going through again swaps the card, UPI or bank mandate.
  const changingMethod =
    auto && sessionData?.autoDebit.current?.planId === sessionData?.plan.id && sessionData?.autoDebit.current?.billingCycle === cycle;
  const firstChargeAt = sessionData?.autoDebit?.firstChargeAt ?? null;
  const scheduled = !auto && !!cycle && !!sessionData?.change?.scheduledCycles.includes(cycle);

  const pricing = useMemo(() => {
    if (!sessionData?.plan || !cycle) return null;
    try {
      const baseAmount = resolvePlanCyclePrice(sessionData.plan, cycle);
      // Automatic renewal charges the full price each cycle; the first charge waits for paid time to run out instead of crediting it.
      if (auto) return { ...calculateSubscriptionPricing(baseAmount), creditApplied: 0 };
      const currentSub = sessionData.currentSubscription;

      // Same-plan-same-cycle renewal while still active isn't priceable here —
      // the order route rejects it outright (already subscribed). Any other
      // combination while a subscription is active gets the same proration
      // estimate the order route will compute for real at charge time.
      const isSamePlanSameCycle =
        currentSub && currentSub.planId === sessionData.plan.id && currentSub.billingCycle === cycle;

      if (currentSub && !isSamePlanSameCycle) {
        const { proratedBase, creditApplied } = calculateProratedBase(baseAmount, currentSub);
        return { ...calculateSubscriptionPricing(proratedBase), creditApplied };
      }

      return { ...calculateSubscriptionPricing(baseAmount), creditApplied: 0 };
    } catch {
      return null;
    }
  }, [sessionData, cycle, auto]);

  const alreadySubscribedToSelected =
    !auto &&
    sessionData?.currentSubscription &&
    sessionData.currentSubscription.planId === sessionData?.plan?.id &&
    sessionData.currentSubscription.billingCycle === cycle;

  function stopPolling() {
    if (pollStopRef.current) {
      pollStopRef.current();
      pollStopRef.current = null;
    }
  }

  /** Waits for the webhook. One-time orders end PAID or FAILED; a mandate ends authorised or cancelled. */
  function pollPaymentStatus(query: string) {
    let attempts = 0;
    setPayState('confirming');

    const intervalId = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/v1/billing-portal/subscription/status?${query}`);
        const body = await res.json();
        const status = body?.data?.status;

        if (status === 'PAID' || status === 'authenticated' || status === 'active') {
          stopPolling();
          window.location.href = billingUrl('&subscription=success');
          return;
        }
        if (status === 'FAILED' || status === 'cancelled' || status === 'expired') {
          stopPolling();
          window.location.href = billingUrl('&subscription=failed');
          return;
        }
      } catch {
        // transient network error while polling — keep trying until max attempts
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPayState('timeout');
      }
    }, POLL_INTERVAL_MS);

    pollStopRef.current = () => clearInterval(intervalId);
  }

  const handlePay = async () => {
    if (!cycle) {
      setPayError('This plan has no billing cycle configured.');
      return;
    }

    setPayError(null);
    setPayState('creating_order');

    if (auto) return startAutoDebit(cycle);
    if (scheduled) return scheduleChange(cycle);

    try {
      const res = await fetch('/api/v1/billing-portal/subscription/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, billingCycle: cycle }),
      });
      const orderRes = await res.json();

      if (!orderRes.success) {
        setPayError(orderRes.message || 'Failed to initialize payment order.');
        setPayState('idle');
        return;
      }

      const { paymentId, orderId, amount, currency, keyId, planName } = orderRes.data;
      const session = sessionData?.session;
      if (!session) throw new Error('Checkout session is not loaded.');

      if (typeof window === 'undefined' || !window.Razorpay) {
        setPayError('Payment gateway failed to load. Please refresh the page and try again.');
        setPayState('idle');
        return;
      }

      const options = {
        key: keyId,
        amount,
        currency,
        name: 'QuizBuzz Subscription',
        description: `Plan: ${planName} (${cycle ? cycleLabel(cycle) : ''})`,
        order_id: orderId,
        prefill: {
          name: session.adminName || '',
          email: session.adminEmail || '',
        },
        theme: { color: RAZORPAY_BRAND_TEAL },
        handler: async function (response: RazorpaySuccessResponse) {
          try {
            await fetch('/api/v1/billing-portal/subscription/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
          } catch (err) {
            console.error('Payment verify call failed, will still poll for webhook confirmation:', err);
          }
          pollPaymentStatus(`paymentId=${paymentId}`);
        },
        modal: {
          ondismiss: function () {
            // No status-changing call — the order simply stays CREATED/PENDING
            // and the admin can retry. The webhook remains the only writer
            // of a terminal status.
            setPayState('idle');
          },
        },
      };

      setPayState('checkout_open');
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Payment error:', err);
      setPayError(errorMessage(err) || 'An unexpected error occurred processing payment.');
      setPayState('idle');
    }
  };

  /** A downgrade: nothing is charged, the plan switches when the paid period ends. */
  const scheduleChange = async (billingCycle: BillingCycleChoice) => {
    try {
      const res = await fetch('/api/v1/billing-portal/subscription/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, billingCycle }),
      });
      const body = await res.json();
      if (!body.success) {
        setPayError(body.message || 'Could not schedule the change.');
        setPayState('idle');
        return;
      }
      window.location.href = billingUrl('&subscription=scheduled');
    } catch (err) {
      setPayError(errorMessage(err) || 'An unexpected error occurred.');
      setPayState('idle');
    }
  };

  /** Razorpay's checkout with a subscription_id asks the customer to approve a UPI AutoPay, card or bank mandate. */
  const startAutoDebit = async (billingCycle: BillingCycleChoice) => {
    try {
      const res = await fetch('/api/v1/billing-portal/subscription/autodebit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, billingCycle }),
      });
      const body = await res.json();
      if (!body.success) {
        setPayError(body.message || 'Could not set up automatic payment.');
        setPayState('idle');
        return;
      }
      const session = sessionData?.session;
      if (!session || typeof window === 'undefined' || !window.Razorpay) {
        setPayError('Payment gateway failed to load. Please refresh the page and try again.');
        setPayState('idle');
        return;
      }
      const { subscriptionId, keyId, planName } = body.data;
      setPayState('checkout_open');
      new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'QuizBuzz Subscription',
        description: `${planName}, renews ${cycleLabel(billingCycle).toLowerCase()}`,
        prefill: { name: session.adminName || '', email: session.adminEmail || '' },
        theme: { color: RAZORPAY_BRAND_TEAL },
        // Only the webhook changes anything; this just starts waiting for it.
        handler: () => pollPaymentStatus(`subscriptionId=${subscriptionId}`),
        modal: { ondismiss: () => setPayState('idle') },
      }).open();
    } catch (err) {
      setPayError(errorMessage(err) || 'An unexpected error occurred.');
      setPayState('idle');
    }
  };

  const handleAbandon = () => {
    if (sessionData?.plan) {
      window.location.href = billingUrl('&subscription=failed');
    } else {
      window.location.href = mainAppUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 font-sans">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm font-medium">Verifying checkout session…</p>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 font-sans">
        <div className="max-w-md w-full bg-card border border-border/50 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Checkout Unavailable</h2>
            <p className="text-muted-foreground text-sm mt-2">{error || 'Session could not be established.'}</p>
          </div>
          <button
            onClick={() => (window.location.href = mainAppUrl)}
            className="w-full py-3 px-4 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-medium transition-colors text-sm cursor-pointer"
          >
            Return to Main Application
          </button>
        </div>
      </div>
    );
  }

  if (payState === 'confirming' || payState === 'timeout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 font-sans">
        <div className="max-w-md w-full bg-card border border-border/50 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
              payState === 'timeout'
                ? 'bg-accent/20 border border-accent/30 text-accent-foreground'
                : 'bg-primary/10 border border-primary/20 text-primary'
            }`}
          >
            {payState === 'timeout' ? <Clock className="w-7 h-7" /> : <Loader2 className="w-7 h-7 animate-spin" />}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {payState === 'timeout' ? 'Still Confirming Your Payment' : 'Confirming Your Payment…'}
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              {payState === 'timeout'
                ? "This is taking longer than usual. Your payment may still be processing — check back on the billing page in a few minutes before retrying."
                : "We're verifying your payment with Razorpay. This usually takes a few seconds."}
            </p>
          </div>
          {payState === 'timeout' && (
            <button
              onClick={() => (window.location.href = billingUrl())}
              className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-colors text-sm cursor-pointer"
            >
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const { session, plan } = sessionData;
  const paying = payState === 'creating_order' || payState === 'checkout_open';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans">
      {/* Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground shadow-lg shadow-primary/20">
            QB
          </div>
          <span className="font-semibold text-lg tracking-tight">QuizBuzz Billing Portal</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
          <Lock className="w-3.5 h-3.5 text-primary" />
          <span>256-bit Secure Checkout</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto w-full my-auto py-8">
        <div className="bg-card border border-border/50 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Org Header */}
          <div className="flex items-center gap-3 pb-6 border-b border-border/50 mb-6">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Subscribing Organization</p>
              <h2 className="text-xl font-bold text-foreground leading-tight">{session.organizationName}</h2>
            </div>
          </div>

          {/* Plan Details Card */}
          <div className="bg-background/60 border border-primary/30 rounded-2xl p-6 mb-6 relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium mb-2">
                  <Sparkles className="w-3 h-3" />
                  Selected Tier
                </div>
                <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
              </div>
            </div>

            {/* Billing cycle toggle */}
            {availableCycles.length > 1 ? (
              <div className={`grid gap-2 mb-4 ${availableCycles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {availableCycles.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCycle(c)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-semibold border transition-colors cursor-pointer ${
                      cycle === c
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border/60 hover:border-primary/40'
                    }`}
                  >
                    {cycleLabel(c)}
                  </button>
                ))}
              </div>
            ) : (
              availableCycles.length === 1 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium mb-4">
                  Billing: {cycleLabel(availableCycles[0])}
                </div>
              )
            )}

            {canAuto && (
              <div role="radiogroup" aria-label="How to pay" className="grid grid-cols-2 gap-2 mb-4">
                {([
                  ['auto', 'Renew automatically', 'UPI AutoPay, card or bank mandate'],
                  ['once', 'Pay once', 'Renew yourself each time'],
                ] as const).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`text-left py-2.5 px-3 rounded-xl border transition-colors cursor-pointer ${
                      mode === value ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/40'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="block text-[11px] text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Features */}
            {plan.features && plan.features.length > 0 && (
              <div className="pt-4 border-t border-border/50 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Included Features</p>
                <div className="grid grid-cols-1 gap-2">
                  {plan.features.map((feat: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2.5 text-sm text-foreground/90">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          {scheduled && pricing ? (
            <div className="text-xs text-muted-foreground pt-5 border-t border-border/50 mb-2 bg-muted/30 rounded-xl p-4 space-y-1">
              <p className="text-foreground font-semibold">Nothing to pay now.</p>
              <p>
                You stay on {sessionData.change.currentPlanName} until {new Date(sessionData.change.on ?? '').toLocaleDateString()}. From then you&apos;re on {plan.name},{' '}
                {formatInr(pricing.totalAmount, { fixed: 2 })} including GST each {cycle ? cycleLabel(cycle).toLowerCase() : ''} renewal.
              </p>
            </div>
          ) : alreadySubscribedToSelected ? (
            <div className="text-xs text-muted-foreground pt-5 border-t border-border/50 mb-2 bg-muted/30 rounded-xl p-4">
              You&apos;re already subscribed to this plan until{' '}
              {new Date(sessionData.currentSubscription?.currentPeriodEnd ?? '').toLocaleDateString()}. Pick a different plan
              or billing cycle above to make changes, or return to the dashboard.
            </div>
          ) : pricing ? (
            <div className="space-y-3 text-xs border-t border-border/50 pt-5 mb-2">
              {pricing.creditApplied > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{sessionData.currentSubscription?.planName || 'Current plan'} — full price ({cycleLabel(sessionData.currentSubscription?.billingCycle ?? cycle ?? '').toLowerCase()})</span>
                    <span>{formatInr(pricing.baseAmount + pricing.creditApplied, { fixed: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-success">
                    <span>Credit for unused time on current plan</span>
                    <span>−{formatInr(pricing.creditApplied, { fixed: 2 })}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Subscription ({cycle ? cycleLabel(cycle).toLowerCase() : ''}){pricing.creditApplied > 0 ? ', after credit' : ''}</span>
                <span>{formatInr(pricing.baseAmount, { fixed: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST (18%)</span>
                <span>{formatInr(pricing.gstAmount, { fixed: 2 })}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-foreground pt-3 border-t border-dashed border-border/60">
                <span>{auto && firstChargeAt ? `First charge on ${new Date(firstChargeAt).toLocaleDateString()}` : auto ? 'Charged today, then each cycle' : 'Total Amount Due Now'}</span>
                <span className="text-primary text-lg">{formatInr(pricing.totalAmount, { fixed: 2 })}</span>
              </div>
              {auto && firstChargeAt && (
                <p className="text-[11px] text-muted-foreground">Nothing is charged today: your current plan is already paid until then.</p>
              )}
              {pricing.creditApplied > 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  Estimated — the exact amount is recalculated when you click Pay.
                </p>
              )}
            </div>
          ) : (
            <div className="text-xs text-destructive pt-5 border-t border-border/50 mb-2">
              This plan has no price configured for the selected billing cycle.
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mb-6">
            {auto
              ? `Razorpay will ask you to approve automatic payments of ${pricing ? formatInr(pricing.totalAmount, { fixed: 2 }) : 'this amount'} ${cycle === 'HALF_YEARLY' ? 'every 6 months' : 'every month'}. Turn them off any time from your Billing page.`
              : scheduled
                ? 'You can keep your current plan from the Billing page until then.'
                : 'This is a one-time charge for the selected period — no auto-renewal. You’ll need to return here to renew when the period ends.'}
          </p>

          {payError && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{payError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handlePay}
              disabled={paying || !pricing || !!alreadySubscribedToSelected}
              className="w-full py-4 px-6 rounded-2xl bg-primary hover:bg-primary/90 active:bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 transition-all duration-200 disabled:opacity-50 text-base cursor-pointer"
            >
              {paying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{payState === 'checkout_open' ? 'Waiting for Razorpay…' : 'Processing Order…'}</span>
                </>
              ) : alreadySubscribedToSelected ? (
                <span>Already Subscribed to This Plan</span>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  <span>
                    {scheduled
                      ? `Switch to ${plan.name} on ${new Date(sessionData.change.on ?? '').toLocaleDateString()}`
                      : changingMethod
                      ? 'Update payment method'
                      : auto && firstChargeAt
                        ? 'Set up automatic renewal'
                        : `Pay ${pricing ? formatInr(pricing.totalAmount, { fixed: 2 }) : ''}${auto ? ' and renew automatically' : ' via Razorpay'}`}
                  </span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>

            <button
              onClick={handleAbandon}
              disabled={paying}
              className="w-full py-2.5 px-4 text-muted-foreground hover:text-foreground text-xs font-medium transition-colors text-center cursor-pointer"
            >
              Cancel and Return to Main App
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center py-4 text-xs text-muted-foreground border-t border-border/50">
        <div className="flex items-center justify-center gap-1 mb-1">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Powered by QuizBuzz Operations Platform &amp; Razorpay</span>
        </div>
        <p>© 2026 QuizBuzz. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 font-sans">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm font-medium">Loading checkout…</p>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
