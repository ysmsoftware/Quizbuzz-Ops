'use client';

import React, { useState } from 'react';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useToast } from '@/components/ui/Toast';
import { Organization, SubscriptionPlan, SubscriptionOverride } from '@/lib/types';
import { 
  Layers, 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Calendar, 
  Users, 
  Trophy, 
  HelpCircle, 
  Check, 
  X, 
  Clock, 
  ShieldCheck, 
  UserPlus, 
  ArrowRight,
  ShieldAlert,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface OrganizationSubscriptionTabProps {
  organization: Organization;
  onPlanChanged?: () => void;
}

export default function OrganizationSubscriptionTab({ organization, onPlanChanged }: OrganizationSubscriptionTabProps) {
  const { plans } = usePlans();
  const { toast } = useToast();
  const {
    subscription,
    isSubLoading,
    history,
    usage,
    isUsageLoading,
    changePlan,
    isChangingPlan,
    addOverride,
    isAddingOverride,
    removeOverride,
    isRemovingOverride
  } = useSubscription(organization.id);

  // Modal states
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [isAddOverrideOpen, setIsAddOverrideOpen] = useState(false);

  // Add override form state
  const [overrideField, setOverrideField] = useState<keyof SubscriptionPlan['limits']>('maxContestsPerCycle');
  const [overrideValue, setOverrideValue] = useState<string>('50');
  const [isOverrideUnlimited, setIsOverrideUnlimited] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideExpires, setOverrideExpires] = useState<string>('');
  const [overrideAdmin, setOverrideAdmin] = useState<string>('Super Admin');

  // Remove override state
  const [removingOverrideId, setRemovingOverrideId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState<string>('');

  if (isSubLoading || !subscription) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-2">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-xs text-muted-foreground">Loading subscription dossiers...</p>
      </div>
    );
  }

  // Find organization's active plan
  const currentPlan = plans.find(p => p.id === subscription.planId);

  // Helper to determine active limit (including overrides)
  const getEffectiveLimit = (fieldName: keyof SubscriptionPlan['limits']) => {
    // Check if an override is active
    const activeOverride = subscription.overrides.find(o => o.field === fieldName);
    if (activeOverride) {
      return {
        value: activeOverride.value,
        isOverridden: true,
        originalValue: currentPlan ? currentPlan.limits[fieldName] : null,
        overrideReason: activeOverride.reason,
        createdBy: activeOverride.createdByAdminName
      };
    }

    return {
      value: currentPlan ? currentPlan.limits[fieldName] : null,
      isOverridden: false,
      originalValue: currentPlan ? currentPlan.limits[fieldName] : null,
    };
  };

  // Human-readable limit names
  const limitLabels: Record<string, string> = {
    maxContestsPerCycle: 'Max Quizzes per Period',
    maxParticipantsPerContest: 'Max Participants per Contest',
    maxQuestionsPerContest: 'Max Questions per Contest',
    maxOrgMembers: 'Max Team Members',
  };

  const limitIcons: Record<string, any> = {
    maxContestsPerCycle: Trophy,
    maxParticipantsPerContest: Users,
    maxQuestionsPerContest: HelpCircle,
    maxOrgMembers: Layers,
  };

  // Perform plan change
  const handleChangePlanSubmit = async () => {
    if (!selectedPlanId) return;
    const nextPlan = plans.find(p => p.id === selectedPlanId);
    if (!nextPlan) return;

    try {
      await changePlan({ planId: selectedPlanId, adminName: 'Super Admin' });
      toast('Plan Switched', `Migrated ${organization.name} to the "${nextPlan.name}" plan successfully.`, 'success');
      setIsChangePlanOpen(false);
      if (onPlanChanged) onPlanChanged();
    } catch (e: any) {
      toast('Error', e.message || 'Failed to switch subscription plan', 'error');
    }
  };

  // Add override submit
  const handleAddOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      toast('Validation Error', 'A custom override reason is required for audit logs.', 'error');
      return;
    }

    const value = isOverrideUnlimited ? null : parseInt(overrideValue, 10);
    if (!isOverrideUnlimited && (isNaN(value as number) || (value as number) <= 0)) {
      toast('Validation Error', 'Limit value must be a positive integer.', 'error');
      return;
    }

    try {
      await addOverride({
        field: overrideField,
        value,
        reason: overrideReason,
        expiresAt: overrideExpires ? new Date(overrideExpires).toISOString() : null,
        createdByAdminName: overrideAdmin || 'Super Admin'
      });

      toast('Override Applied', `Custom limit applied to "${limitLabels[overrideField]}" immediately.`, 'success');
      setIsAddOverrideOpen(false);
      // Reset form
      setOverrideReason('');
      setOverrideValue('50');
      setIsOverrideUnlimited(false);
      setOverrideExpires('');
    } catch (e: any) {
      toast('Error', e.message || 'Failed to apply override', 'error');
    }
  };

  // Remove override
  const handleRemoveOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removingOverrideId) return;
    if (!removeReason.trim()) {
      toast('Validation Error', 'A cancellation reason is required for audit logs.', 'error');
      return;
    }

    try {
      await removeOverride({
        overrideId: removingOverrideId,
        reason: removeReason,
        adminName: 'Super Admin'
      });

      toast('Override Revoked', 'The custom limit override has been deleted.', 'success');
      setRemovingOverrideId(null);
      setRemoveReason('');
    } catch (e: any) {
      toast('Error', e.message || 'Failed to revoke override', 'error');
    }
  };

  return (
    <div className="space-y-6 font-sans select-text pointer-events-auto">

      {/* Grid: Plan card + Quota Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Current Plan Information */}
        <div className="p-6 bg-card border border-border/50 rounded-xl flex flex-col justify-between space-y-6 shadow-xs">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Active Subscription
                </span>
                <h3 className="text-xl font-extrabold text-foreground font-sans tracking-tight">
                  {currentPlan ? currentPlan.name : subscription.planId.replace('plan_', '').toUpperCase()}
                </h3>
                <span className="text-xs text-muted-foreground font-mono">
                  Slug: {currentPlan?.slug || 'custom'}
                </span>
              </div>

              {/* Status Badge */}
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                subscription.status === 'active' 
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                  : subscription.status === 'past_due'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}>
                {subscription.status.replace('_', ' ')}
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed h-12 overflow-hidden line-clamp-3">
              {currentPlan?.description || 'No direct description available for this tier.'}
            </p>

            {/* Price Detail */}
            <div className="pt-2 border-t border-border/30 text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renewal Cost</span>
                <span className="font-bold text-foreground">
                  ₹{currentPlan ? currentPlan.price.toLocaleString('en-IN') : '0'} / {currentPlan?.billingCycle === 'annual' ? 'year' : 'month'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing Period Start</span>
                <span className="text-foreground font-medium font-mono text-[11px]">
                  {format(new Date(subscription.currentPeriodStart), 'dd MMM yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing Period End</span>
                <span className="text-foreground font-medium font-mono text-[11px]">
                  {format(new Date(subscription.currentPeriodEnd), 'dd MMM yyyy')}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedPlanId(subscription.planId);
              setIsChangePlanOpen(true);
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            Switch Plan / Renew
          </button>
        </div>

        {/* Real-time Quotas and Progress Bars */}
        <div className="lg:col-span-2 p-6 bg-card border border-border/50 rounded-xl space-y-5 shadow-xs">
          <div className="flex justify-between items-center border-b border-border/30 pb-2.5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Quotas & Limit Tracking
              </h4>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Real-time consumption computed against subscription limits.
              </p>
            </div>
            <button
              onClick={() => setIsAddOverrideOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold border border-primary/20 hover:bg-primary/5 text-primary rounded-md transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Apply Custom Override
            </button>
          </div>

          {isUsageLoading ? (
            <div className="py-6 flex flex-col items-center justify-center text-xs text-muted-foreground">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent animate-spin rounded-full mb-1" />
              Recalculating live quotas...
            </div>
          ) : !usage ? (
            <div className="p-4 text-xs text-center text-muted-foreground border border-dashed rounded-lg bg-muted/20">
              No usage snapshots available for this billing period.
            </div>
          ) : (
            <div className="space-y-4 font-sans">
              
              {[
                {
                  key: 'maxContestsPerCycle',
                  label: limitLabels.maxContestsPerCycle,
                  used: usage.contestsUsedThisCycle,
                  icon: Trophy,
                  barColor: 'bg-primary'
                },
                {
                  key: 'maxParticipantsPerContest',
                  label: limitLabels.maxParticipantsPerContest,
                  used: usage.participantsUsedThisCycle,
                  icon: Users,
                  barColor: 'bg-indigo-500'
                },
                {
                  key: 'maxOrgMembers',
                  label: limitLabels.maxOrgMembers,
                  used: usage.memberCountUsed,
                  icon: Layers,
                  barColor: 'bg-sky-500'
                }
              ].map((quota) => {
                const effective = getEffectiveLimit(quota.key as keyof SubscriptionPlan['limits']);
                const limitVal = effective.value;
                const isUnlimited = limitVal === null;
                const percent = isUnlimited ? 0 : Math.min(Math.round((quota.used / limitVal) * 100), 100);

                return (
                  <div key={quota.key} className="space-y-2 p-3.5 border border-border/20 rounded-lg bg-muted/10">
                    <div className="flex justify-between items-start text-xs">
                      <div className="flex items-center gap-2">
                        <quota.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <span className="font-semibold text-foreground block">{quota.label}</span>
                          {effective.isOverridden && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 font-bold text-[8px] uppercase tracking-wider border border-amber-500/20">
                              <span className="h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                              Custom Admin Override
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-foreground">
                          {quota.used.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="font-semibold text-muted-foreground">
                          {isUnlimited ? '∞' : limitVal.toLocaleString()}
                        </span>

                        {effective.isOverridden && effective.originalValue !== null && (
                          <span className="block text-[9px] text-muted-foreground">
                            (Original: {effective.originalValue})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quota Bar */}
                    {!isUnlimited ? (
                      <div className="space-y-1">
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${quota.barColor} rounded-full transition-all duration-500`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                          <span>{percent}% Consumed</span>
                          {percent >= 90 && (
                            <span className="text-rose-500 font-bold flex items-center gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Exhausting Quota
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-600 font-medium">
                        Unlimited resource allocation unlocked.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Feature Flags Section */}
      <div className="p-6 bg-card border border-border/50 rounded-xl space-y-4 shadow-xs">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Administrative Feature Gating Checklist
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Current functional modules unlocked for this organization based on tier structure.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {[
            { key: 'proctoring', label: 'AI Proctoring Lockbox', desc: 'Secure browser and video monitors.' },
            { key: 'customCertificateBranding', label: 'Certificate Custom Branding', desc: 'SaaS client logo templates.' },
            { key: 'prioritySupport', label: 'Priority SLA Help Ticket', desc: 'Guaranteed support turnaround.' },
            { key: 'analyticsExport', label: 'Deep Data Export Reports', desc: 'Full CSV downloads of test logs.' },
            { key: 'customDomain', label: 'White-label Custom Domain', desc: 'Map client subdomain endpoints.' }
          ].map((feat) => {
            const isEnabled = currentPlan?.features[feat.key as keyof typeof currentPlan.features] || false;
            return (
              <div 
                key={feat.key} 
                className={`p-3.5 border rounded-lg flex flex-col justify-between space-y-2 text-xs transition-colors ${
                  isEnabled 
                    ? 'border-emerald-500/15 bg-emerald-500/5' 
                    : 'border-border/30 bg-muted/15'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${isEnabled ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {feat.label}
                  </span>
                  {isEnabled ? (
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                  ) : (
                    <X className="h-4.5 w-4.5 text-muted-foreground/30 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {feat.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overrides Table Section */}
      <div className="p-6 bg-card border border-border/50 rounded-xl space-y-4 shadow-xs">
        <div className="flex justify-between items-center">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              SaaS Limits Custom Overrides History
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Exceptions and quota adjustments authorized for this tenant manually.
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-secondary/80 border border-border/50 text-foreground">
            {subscription.overrides.length} Overrides Active
          </span>
        </div>

        <div className="border border-border/30 rounded-lg overflow-hidden bg-card text-xs">
          {subscription.overrides.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground italic">
              No manual exceptions or limits overrides currently assigned to this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/30 bg-secondary/15 text-muted-foreground font-semibold">
                    <th className="py-2.5 px-4">Limited Field Name</th>
                    <th className="py-2.5 px-4 text-center">Overridden Value</th>
                    <th className="py-2.5 px-4">Authorization Reason / Remarks</th>
                    <th className="py-2.5 px-4">Expires On</th>
                    <th className="py-2.5 px-4">Authorized By</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/25">
                  {subscription.overrides.map((override) => (
                    <tr key={override.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {limitLabels[override.field]}
                        <span className="block font-mono text-[9px] text-muted-foreground uppercase">{override.field}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-foreground">
                        {override.value === null ? '∞ (Unlimited)' : override.value.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground max-w-xs leading-normal">
                        {override.reason}
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-muted-foreground">
                        {override.expiresAt ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            {format(new Date(override.expiresAt), 'dd MMM yyyy, HH:mm')}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Permanent (Never)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground/80 font-medium">
                        {override.createdByAdminName}
                        <span className="block text-[9px] text-muted-foreground font-mono">{format(new Date(override.createdAt), 'dd MMM yyyy')}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setRemovingOverrideId(override.id);
                            setRemoveReason('');
                          }}
                          className="p-1.5 rounded hover:bg-red-500/5 text-red-500 transition-colors cursor-pointer"
                          title="Revoke Override"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Audit: Subscription Change Logs and Billing History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Plan Change logs */}
        <div className="p-6 bg-card border border-border/50 rounded-xl space-y-4 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tenant Subscription Migration Logs
          </h4>
          
          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground italic border border-dashed rounded-lg bg-muted/15">
                No historic subscription shifts recorded for this organization.
              </div>
            ) : (
              history.map((event) => {
                const fPlan = plans.find(p => p.id === event.fromPlanId);
                const tPlan = plans.find(p => p.id === event.toPlanId);
                return (
                  <div key={event.id} className="p-3 border border-border/25 rounded-lg bg-muted/10 flex items-start gap-3">
                    <div className="p-1.5 rounded-full bg-primary/10 text-primary mt-0.5">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 space-y-1 text-xs">
                      <div className="flex justify-between font-medium">
                        <span className="text-foreground">
                          {fPlan?.name || event.fromPlanId.replace('plan_', '').toUpperCase()}
                          {' '}→{' '}
                          <span className="font-bold text-primary">
                            {tPlan?.name || event.toPlanId.replace('plan_', '').toUpperCase()}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {format(new Date(event.date), 'dd MMM yyyy')}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Migrated by <strong>{event.adminName}</strong>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Renewal invoices receipts */}
        <div className="p-6 bg-card border border-border/50 rounded-xl space-y-4 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Subscription Payments & Renewal Billing receipts
          </h4>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {/* We can gather recent billing items specific to subscriptions */}
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground italic border border-dashed rounded-lg bg-muted/15">
                No subscription transactions logged yet.
              </div>
            ) : (
              <div className="divide-y divide-border/20 text-xs">
                {[
                  { id: 'inv_1', date: '2026-06-15T00:00:00Z', amount: currentPlan?.price || 2999, type: 'Recurring Subscription', status: 'PAID' },
                  { id: 'inv_2', date: '2026-05-15T00:00:00Z', amount: currentPlan?.price || 2999, type: 'Recurring Subscription', status: 'PAID' },
                ].map((inv) => (
                  <div key={inv.id} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-foreground block">{inv.type}</span>
                      <span className="text-[10px] text-muted-foreground block font-mono">Receipt: {inv.id.toUpperCase()}_{format(new Date(inv.date), 'MMyy')} • {format(new Date(inv.date), 'dd MMM yyyy')}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <span className="font-bold text-foreground font-mono">₹{inv.amount.toLocaleString('en-IN')}</span>
                      <span className="block px-1.5 py-0.2 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-500 uppercase tracking-wider text-center border border-emerald-500/20">
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: CHANGE PLAN */}
      <AnimatePresence>
        {isChangePlanOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChangePlanOpen(false)}
              className="fixed inset-0 bg-background/85 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2.5 pb-2 border-b border-border/40">
                <CreditCard className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Migrate Subscription Tier</h3>
              </div>
              
              <p className="text-xs text-muted-foreground leading-normal">
                Select a target pricing tier for <strong>{organization.name}</strong>. This action will immediately adjust quotas, active feature permissions, and billing cycles.
              </p>

              {/* Tier Selection Grid */}
              <div className="grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto p-1 text-xs">
                {plans.map((plan) => {
                  const isCurrent = plan.id === subscription.planId;
                  const isSelected = plan.id === selectedPlanId;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => !isCurrent && setSelectedPlanId(plan.id)}
                      className={`p-3.5 border rounded-xl flex flex-col justify-between space-y-2 cursor-pointer transition-all ${
                        isCurrent 
                          ? 'border-primary bg-primary/5 opacity-70 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary ring-1 ring-primary bg-primary/5'
                          : 'border-border/60 hover:border-border hover:bg-secondary/15'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-foreground block">{plan.name}</span>
                        {isCurrent && (
                          <span className="text-[8px] font-extrabold uppercase bg-primary text-primary-foreground px-1 py-0.2 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      
                      <div className="text-xs font-extrabold text-foreground font-mono">
                        {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
                        <span className="text-[9px] font-normal text-muted-foreground">/{plan.billingCycle === 'annual' ? 'yr' : 'mo'}</span>
                      </div>

                      <div className="text-[9px] text-muted-foreground line-clamp-1 truncate">
                        {plan.limits.maxContestsPerCycle === null ? '∞' : plan.limits.maxContestsPerCycle} Quizzes • {plan.limits.maxParticipantsPerContest === null ? '∞' : plan.limits.maxParticipantsPerContest.toLocaleString()} Parts
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Warning Alert */}
              <div className="bg-amber-500/10 border border-amber-500/15 rounded-lg p-3 text-[11px] text-amber-700 flex gap-2 leading-relaxed">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Quota Shift Notice:</strong> Shifting to a tier with lower quotas than currently consumed may cause lockouts or prevent the organization from creating new contests until their consumption falls below the new limit.
                </p>
              </div>

              <div className="flex justify-end gap-3.5 pt-2.5 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setIsChangePlanOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleChangePlanSubmit}
                  disabled={isChangingPlan || selectedPlanId === subscription.planId}
                  className="px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors shadow-xs cursor-pointer"
                >
                  {isChangingPlan ? 'Migrating...' : 'Confirm Migration'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ADD OVERRIDE */}
      <AnimatePresence>
        {isAddOverrideOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddOverrideOpen(false)}
              className="fixed inset-0 bg-background/85 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-border/40 mb-4">
                <Plus className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Apply Custom Exception Override</h3>
              </div>

              <form onSubmit={handleAddOverrideSubmit} className="space-y-4 text-xs font-sans">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Select Resource Quota</label>
                    <select
                      value={overrideField}
                      onChange={(e) => setOverrideField(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs cursor-pointer"
                    >
                      {Object.keys(limitLabels).map(f => (
                        <option key={f} value={f}>{limitLabels[f]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Custom Limit</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          id="ov-unlimited-chk"
                          checked={isOverrideUnlimited}
                          onChange={(e) => setIsOverrideUnlimited(e.target.checked)}
                          className="rounded text-primary border-border focus:ring-primary h-3 w-3"
                        />
                        <label htmlFor="ov-unlimited-chk" className="text-[9px] font-semibold text-muted-foreground select-none">Unlimited</label>
                      </div>
                    </div>
                    {!isOverrideUnlimited ? (
                      <input
                        type="number"
                        value={overrideValue}
                        onChange={(e) => setOverrideValue(e.target.value)}
                        placeholder="e.g. 100"
                        className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs font-mono"
                      />
                    ) : (
                      <div className="w-full px-2.5 py-1.5 bg-muted/30 border border-border/40 text-emerald-600 font-semibold rounded-md text-xs">
                        Unlimited (∞) Allocation
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Expiration Date (Optional)</label>
                    <input
                      type="date"
                      value={overrideExpires}
                      onChange={(e) => setOverrideExpires(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs font-mono cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Authorized Admin</label>
                    <input
                      type="text"
                      value={overrideAdmin}
                      onChange={(e) => setOverrideAdmin(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Override Authorization Justification</label>
                  <textarea
                    required
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Provide details for billing audits (e.g. Granted temporary 100 quizzes limit override for IIT TechFest until August)..."
                    className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs resize-none leading-relaxed"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddOverrideOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingOverride}
                    className="px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors shadow-xs cursor-pointer"
                  >
                    {isAddingOverride ? 'Applying...' : 'Apply Exception'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: REVOKE OVERRIDE CONFIRMATION */}
      <AnimatePresence>
        {removingOverrideId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRemovingOverrideId(null)}
              className="fixed inset-0 bg-background/85 backdrop-blur-xs cursor-pointer"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-border/40 mb-3 text-red-500">
                <Trash2 className="h-5 w-5 shrink-0" />
                <h3 className="text-base font-bold text-foreground">Confirm Exception Revocation</h3>
              </div>
              
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                You are about to cancel this custom exception. The organization will immediately fall back to the standard limits defined by their active subscription plan.
              </p>

              <form onSubmit={handleRemoveOverrideSubmit} className="space-y-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-red-500 block">Revocation Audit Justification</label>
                  <input
                    type="text"
                    required
                    value={removeReason}
                    onChange={(e) => setRemoveReason(e.target.value)}
                    placeholder="e.g. Campaign finished, or upgraded to Growth package"
                    className="w-full px-2.5 py-1.5 bg-background border border-border/60 rounded-md focus:border-primary focus:outline-hidden text-xs"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setRemovingOverrideId(null)}
                    className="px-3.5 py-1.5 text-xs font-semibold border border-border/60 hover:bg-secondary/45 rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRemovingOverride}
                    className="px-4 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors shadow-xs cursor-pointer"
                  >
                    {isRemovingOverride ? 'Revoking...' : 'Revoke Override'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
