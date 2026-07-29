'use client';

import React, { useState } from 'react';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { usePlans } from '@/lib/hooks/usePlans';
import { useToast } from '@/components/ui/Toast';
import { Organization, SubscriptionOverride } from '@/lib/types';
import { OrgPayment } from '@/lib/api/organizations';
import CurrentPlanCard from './organization-subscription/CurrentPlanCard';
import QuotaUsageGrid from './organization-subscription/QuotaUsageGrid';
import LimitOverridesTable from './organization-subscription/LimitOverridesTable';
import PlanChangeHistoryTable from './organization-subscription/PlanChangeHistoryTable';
import ChangePlanModal from './organization-subscription/ChangePlanModal';
import AddOverrideModal from './organization-subscription/AddOverrideModal';
import RevokeOverrideModal from './organization-subscription/RevokeOverrideModal';
import { Layers, AlertTriangle, Plus } from 'lucide-react';

interface OrganizationSubscriptionTabProps {
  organization: Organization;
  onPlanChanged?: () => void;
  payments?: OrgPayment[];
}

export default function OrganizationSubscriptionTab({
  organization,
  onPlanChanged,
  payments,
}: OrganizationSubscriptionTabProps) {
  const subscriptionPayments = (payments || []).filter((p) => p.source === 'subscription');
  const { plans } = usePlans();
  const { toast } = useToast();
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
  } = useSubscription(organization.id);

  // Modals
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [isAddOverrideOpen, setIsAddOverrideOpen] = useState(false);
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
          onSubmit={async (selectedPlanId) => {
            try {
              await assignInitialPlan(selectedPlanId);
              const nextPlan = plans.find((p) => p.id === selectedPlanId);
              toast('Plan Assigned', `Assigned "${nextPlan?.name || selectedPlanId}" plan to ${organization.name}.`, 'success');
              setIsChangePlanOpen(false);
              if (onPlanChanged) onPlanChanged();
            } catch (err: any) {
              toast('Assignment Failed', err.message || 'Failed to assign plan.', 'error');
            }
          }}
          plans={plans}
          currentPlanId=""
          isSubmitting={isAssigningInitialPlan}
        />
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === subscription.planId || p.slug === subscription.planId);

  // Change Plan submit
  const handleChangePlanSubmit = async (selectedPlanId: string, reason: string) => {
    try {
      await changePlan({ planId: selectedPlanId, adminName: 'Super Admin' });
      const nextPlan = plans.find((p) => p.id === selectedPlanId);
      toast('Plan Migrated', `Migrated ${organization.name} to "${nextPlan?.name || selectedPlanId}" plan.`, 'success');
      setIsChangePlanOpen(false);
      if (onPlanChanged) onPlanChanged();
    } catch (err: any) {
      toast('Migration Failed', err.message || 'Failed to change plan.', 'error');
    }
  };

  // Add override submit
  const handleAddOverrideSubmit = async (override: Omit<SubscriptionOverride, 'id' | 'createdAt'>) => {
    try {
      await addOverride(override);
      toast('Override Granted', 'Custom limit override applied to organization immediately.', 'success');
      setIsAddOverrideOpen(false);
    } catch (err: any) {
      toast('Override Failed', err.message || 'Failed to apply override.', 'error');
    }
  };

  // Revoke override submit
  const handleRevokeOverrideSubmit = async (reason: string) => {
    if (!revokingOverrideId) return;
    try {
      await removeOverride({
        overrideId: revokingOverrideId,
        reason,
        adminName: 'Super Admin',
      });
      toast('Override Revoked', 'Custom limit override removed.', 'success');
      setRevokingOverrideId(null);
    } catch (err: any) {
      toast('Revocation Failed', err.message || 'Failed to revoke override.', 'error');
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
          payments={subscriptionPayments}
        />

        <QuotaUsageGrid
          subscription={subscription}
          currentPlan={currentPlan}
          usage={usage}
        />
      </div>

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
      />

      <AddOverrideModal
        isOpen={isAddOverrideOpen}
        onClose={() => setIsAddOverrideOpen(false)}
        onSubmit={handleAddOverrideSubmit}
        isSubmitting={isAddingOverride}
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
