'use client';

import type { PlanChangeInput } from '@/lib/api/organizations';
import React, { useState } from 'react';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useToast } from '@/components/ui/Toast';
import { Organization, SubscriptionOverride } from '@/lib/types';
import { AccessUpdate, OrgPayment } from '@/lib/api/organizations';
import CurrentPlanCard from './organization-subscription/CurrentPlanCard';
import AiCreditsCard from './organization-subscription/AiCreditsCard';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import QuotaUsageGrid from './organization-subscription/QuotaUsageGrid';
import LimitOverridesTable from './organization-subscription/LimitOverridesTable';
import PlanChangeHistoryTable from './organization-subscription/PlanChangeHistoryTable';
import ChangePlanModal from './organization-subscription/ChangePlanModal';
import AddOverrideModal from './organization-subscription/AddOverrideModal';
import AccessModal from './organization-subscription/AccessModal';
import RevokeOverrideModal from './organization-subscription/RevokeOverrideModal';
import { AlertTriangle, Plus } from 'lucide-react';
import { errorMessage } from '@/lib/errors';

interface OrganizationSubscriptionTabProps {
  organization: Organization;
  onPlanChanged?: () => void;
  /** Switches the org page to its Invoices tab. */
  onOpenInvoices?: () => void;
  payments?: OrgPayment[];
}

export default function OrganizationSubscriptionTab({
  organization,
  onPlanChanged,
  onOpenInvoices,
  payments,
}: OrganizationSubscriptionTabProps) {
  const subscriptionPayments = (payments || []).filter((p) => p.source === 'subscription');
  const { plans: allPlans } = usePlans();
  // Another org's private plan is never an option here.
  const plans = allPlans.filter((p) => !p.organizationId || p.organizationId === organization.id);
  const { toast } = useToast();
  const { admin: currentAdmin } = useCurrentAdmin();
  const canGrantCredits = currentAdmin?.role === 'SUPER_ADMIN';
  const {
    subscription,
    isSubLoading,
    history,
    usage,
    assignInitialPlan,
    isAssigningInitialPlan,
    changePlan,
    isChangingPlan,
    addOverride,
    isAddingOverride,
    removeOverride,
    isRemovingOverride,
    resendReminder,
    isResendingReminder,
    updateAccess,
    isUpdatingAccess,
    cancelScheduledChange,
  } = useSubscription(organization.id);

  // Modals
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [isAddOverrideOpen, setIsAddOverrideOpen] = useState(false);
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const [revokingOverrideId, setRevokingOverrideId] = useState<string | null>(null);

  if (isSubLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-2">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-xs text-muted-foreground">Loading subscription details...</p>
      </div>
    );
  }

  // Handle case where org has no subscription record yet (404 from GET endpoint)
  if (!subscription) {
    return (
      <div className="space-y-6 font-sans">
        <div className="p-8 bg-card border border-dashed rounded-xl flex flex-col items-center justify-center text-center space-y-4 shadow-xs">
          <div className="p-3 bg-amber-500/10 rounded-full text-amber-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="font-bold text-base text-foreground">No Active Subscription Plan</h3>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{organization.name}</strong> currently has no subscription plan assigned in the operational database.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsChangePlanOpen(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Assign Initial Subscription Plan</span>
          </button>
        </div>

        {/* Change / Assign Plan Modal */}
        <ChangePlanModal
          isOpen={isChangePlanOpen}
          onClose={() => setIsChangePlanOpen(false)}
          onSubmit={async ({ planId: selectedPlanId }) => {
            try {
              await assignInitialPlan(selectedPlanId);
              const nextPlan = plans.find((p) => p.id === selectedPlanId);
              toast('Plan Assigned', `Assigned "${nextPlan?.name || selectedPlanId}" plan to ${organization.name}.`, 'success');
              setIsChangePlanOpen(false);
              if (onPlanChanged) onPlanChanged();
            } catch (err) {
              toast('Assignment Failed', errorMessage(err) || 'Failed to assign plan.', 'error');
            }
          }}
          plans={plans}
          currentPlanId=""
          isSubmitting={isAssigningInitialPlan}
          onUseInvoice={() => { setIsChangePlanOpen(false); onOpenInvoices?.(); }}
        />
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === subscription.planId || p.slug === subscription.planId);

  // Change Plan submit
  const handleChangePlanSubmit = async (input: PlanChangeInput) => {
    try {
      await changePlan(input);
      const nextPlan = plans.find((p) => p.id === input.planId);
      toast(
        input.when === 'period_end' ? 'Change scheduled' : 'Plan Migrated',
        input.when === 'period_end' ? `${organization.name} moves to "${nextPlan?.name}" when the paid period ends.` : `Migrated ${organization.name} to "${nextPlan?.name || input.planId}" plan.`,
        'success',
      );
      setIsChangePlanOpen(false);
      if (onPlanChanged) onPlanChanged();
    } catch (err) {
      toast('Migration Failed', errorMessage(err) || 'Failed to change plan.', 'error');
    }
  };

  // Add override submit
  const handleAddOverrideSubmit = async (override: Omit<SubscriptionOverride, 'id' | 'createdAt'>) => {
    try {
      await addOverride(override);
      toast('Override Granted', 'Custom limit override applied to organization immediately.', 'success');
      setIsAddOverrideOpen(false);
    } catch (err) {
      toast('Override Failed', errorMessage(err) || 'Failed to apply override.', 'error');
    }
  };

  const handleAccessSubmit = async (input: AccessUpdate) => {
    try {
      await updateAccess(input);
      toast('Access Updated', `Access dates updated for ${organization.name}.`, 'success');
      setIsAccessOpen(false);
    } catch (err) {
      toast('Update Failed', errorMessage(err) || 'Could not update the access dates.', 'error');
    }
  };

  // Resend renewal reminder
  const handleResendReminder = async () => {
    try {
      const result = await resendReminder();
      if (result.sent) {
        toast('Reminder Queued', `Renewal reminder queued for ${organization.name}'s owner. Check Messaging for delivery.`, 'success');
      } else {
        toast('Nothing Sent', 'No owner contact was found for this organization — the reminder was not sent.', 'warning');
      }
      return result;
    } catch (err) {
      toast('Resend Failed', errorMessage(err) || 'Could not resend the renewal reminder.', 'error');
      throw err;
    }
  };

  // Revoke override submit
  const handleRevokeOverrideSubmit = async (reason: string) => {
    if (!revokingOverrideId) return;
    try {
      await removeOverride({
        overrideId: revokingOverrideId,
        reason,
      });
      toast('Override Revoked', 'Custom limit override removed.', 'success');
      setRevokingOverrideId(null);
    } catch (err) {
      toast('Revocation Failed', errorMessage(err) || 'Failed to revoke override.', 'error');
    }
  };

  return (
    <div className="space-y-6 font-sans select-text pointer-events-auto">
      {/* Overview Grid: Plan Card + Quota usage progress bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CurrentPlanCard
          subscription={subscription}
          currentPlan={currentPlan}
          onChangePlanClick={() => setIsChangePlanOpen(true)}
          onAdjustAccessClick={() => setIsAccessOpen(true)}
          payments={subscriptionPayments}
          onResendReminder={handleResendReminder}
          isResendingReminder={isResendingReminder}
          scheduledPlanName={subscription.scheduledChange ? plans.find((p) => p.id === subscription.scheduledChange?.planId)?.name ?? 'another plan' : null}
          onCancelScheduled={async () => {
            try {
              await cancelScheduledChange();
              toast('Change cancelled', 'They stay on their current plan.', 'success');
            } catch (err) {
              toast('Could not cancel it', errorMessage(err), 'error');
            }
          }}
        />

        <QuotaUsageGrid
          subscription={subscription}
          usage={usage}
        />
      </div>

      <AiCreditsCard organizationId={organization.id} perMonth={subscription.effectiveLimits.aiCreditsPerMonth?.value ?? null} canGrant={!!canGrantCredits} />

      {/* Active Limit Overrides Table */}
      <LimitOverridesTable
        overrides={subscription.overrides || []}
        onAddOverrideClick={() => setIsAddOverrideOpen(true)}
        onRevokeOverrideClick={(id) => setRevokingOverrideId(id)}
      />

      {/* Plan Migration History Table */}
      <PlanChangeHistoryTable
        history={history || []}
        plans={plans}
      />

      {/* Modals */}
      <ChangePlanModal
        isOpen={isChangePlanOpen}
        onClose={() => setIsChangePlanOpen(false)}
        onSubmit={handleChangePlanSubmit}
        plans={plans}
        currentPlanId={subscription.planId}
        isSubmitting={isChangingPlan}
        onUseInvoice={() => { setIsChangePlanOpen(false); onOpenInvoices?.(); }}
        periodEnd={subscription.planKind === 'FREE' ? null : subscription.currentPeriodEnd}
      />

      {isAccessOpen && (
        <AccessModal
          subscription={subscription}
          onClose={() => setIsAccessOpen(false)}
          onSubmit={handleAccessSubmit}
          isSubmitting={isUpdatingAccess}
        />
      )}

      <AddOverrideModal
        isOpen={isAddOverrideOpen}
        onClose={() => setIsAddOverrideOpen(false)}
        onSubmit={handleAddOverrideSubmit}
        isSubmitting={isAddingOverride}
        effectiveLimits={subscription.effectiveLimits}
      />

      <RevokeOverrideModal
        isOpen={!!revokingOverrideId}
        onClose={() => setRevokingOverrideId(null)}
        onConfirm={handleRevokeOverrideSubmit}
        isSubmitting={isRemovingOverride}
      />
    </div>
  );
}
