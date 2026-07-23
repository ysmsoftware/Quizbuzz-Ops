'use client';

import { useState, useEffect, Suspense } from 'react';
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
} from 'lucide-react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [paying, setPaying] = useState(false);

  const mainAppUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || 'http://localhost:3000';

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    if (!token) {
      setError('No billing handoff token provided. Please start checkout from the main application.');
      setLoading(false);
      return;
    }

    // Verify handoff session
    fetch('/api/v1/billing-portal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setSessionData(res.data);
        } else {
          setError(res.error || 'Failed to verify checkout session.');
        }
      })
      .catch((err) => {
        console.error('Session verify error:', err);
        setError('Connection error verifying checkout session.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handlePay = async () => {
    setPaying(true);
    setError(null);

    try {
      // 1. Create Subscription Order
      const res = await fetch('/api/v1/billing-portal/subscription/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const orderRes = await res.json();

      if (!orderRes.success) {
        setError(orderRes.error || 'Failed to initialize payment order.');
        setPaying(false);
        return;
      }

      const { orderId, amount, currency, keyId, planName } = orderRes.data;
      const { session, plan } = sessionData;

      // 2. Open Razorpay Checkout widget if available
      if (typeof window !== 'undefined' && window.Razorpay && keyId && !keyId.includes('stubKey')) {
        const options = {
          key: keyId,
          amount: amount,
          currency: currency,
          name: 'QuizBuzz Subscription',
          description: `Plan: ${planName}`,
          order_id: orderId,
          prefill: {
            name: session.adminName || '',
            email: session.adminEmail || '',
          },
          theme: {
            color: '#6366f1',
          },
          handler: async function (response: any) {
            try {
              // Notify webhook of captured payment
              await fetch('/api/v1/billing-portal/razorpay/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'capture',
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                  planSlug: plan.slug,
                  adminEmail: session.adminEmail,
                  adminName: session.adminName,
                }),
              });
              window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`;
            } catch (err) {
              console.error('Webhook notification error:', err);
              window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`;
            }
          },
          modal: {
            ondismiss: async function () {
              setPaying(false);
              await fetch('/api/v1/billing-portal/razorpay/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'fail',
                  razorpayOrderId: orderId,
                  error: 'Checkout modal closed by user',
                  adminEmail: session.adminEmail,
                  adminName: session.adminName,
                }),
              });
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        // Fallback for test environment without active live Razorpay Key
        console.log('Running test mode payment completion for order:', orderId);
        setTimeout(async () => {
          await fetch('/api/v1/billing-portal/razorpay/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'capture',
              razorpayOrderId: orderId,
              razorpayPaymentId: `pay_test_${Date.now()}`,
              planSlug: plan.slug,
              adminEmail: session.adminEmail,
              adminName: session.adminName,
            }),
          });
          window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`;
        }, 1200);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err?.message || 'An unexpected error occurred processing payment.');
      setPaying(false);
    }
  };

  const handleAbandon = async () => {
    if (sessionData?.plan) {
      window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=failed`;
    } else {
      window.location.href = mainAppUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm font-medium">Verifying checkout session…</p>
        </div>
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Checkout Unavailable</h2>
            <p className="text-slate-400 text-sm mt-2">{error || 'Session could not be established.'}</p>
          </div>
          <button
            onClick={() => (window.location.href = mainAppUrl)}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors text-sm"
          >
            Return to Main Application
          </button>
        </div>
      </div>
    );
  }

  const { session, plan } = sessionData;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            QB
          </div>
          <span className="font-semibold text-lg tracking-tight">QuizBuzz Billing Portal</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>256-bit Secure Checkout</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-xl mx-auto w-full my-auto py-8">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Org Header */}
          <div className="flex items-center gap-3 pb-6 border-b border-slate-800 mb-6">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Subscribing Organization</p>
              <h2 className="text-xl font-bold text-white leading-tight">{session.organizationName}</h2>
            </div>
          </div>

          {/* Plan Details Card */}
          <div className="bg-slate-950/60 border border-indigo-500/30 rounded-2xl p-6 mb-6 relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-medium mb-2">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  Selected Tier
                </div>
                <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                <p className="text-slate-400 text-sm mt-1">{plan.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-3xl font-extrabold text-white">
                  ₹{plan.price.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400">per {plan.billingCycle?.toLowerCase() || 'month'}</div>
              </div>
            </div>

            {/* Features */}
            {plan.features && plan.features.length > 0 && (
              <div className="pt-4 border-t border-slate-800/80 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Included Features</p>
                <div className="grid grid-cols-1 gap-2">
                  {plan.features.map((feat: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          <div className="space-y-3 text-sm border-t border-slate-800 pt-5 mb-8">
            <div className="flex justify-between text-slate-400">
              <span>Subscription Subtotal</span>
              <span>₹{plan.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tax (GST)</span>
              <span>₹0.00</span>
            </div>
            <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-slate-800">
              <span>Total Amount Due Now</span>
              <span className="text-indigo-400 text-lg">₹{plan.price.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all duration-200 disabled:opacity-50 text-base cursor-pointer"
            >
              {paying ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing Order…</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  <span>Pay ₹{plan.price.toFixed(2)} via Razorpay</span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>

            <button
              onClick={handleAbandon}
              disabled={paying}
              className="w-full py-2.5 px-4 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors text-center cursor-pointer"
            >
              Cancel and Return to Main App
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center py-4 text-xs text-slate-500 border-t border-slate-900">
        <div className="flex items-center justify-center gap-1 mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Powered by QuizBuzz Operations Platform & Razorpay</span>
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
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm font-medium">Loading checkout…</p>
          </div>
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
