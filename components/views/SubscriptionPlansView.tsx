'use client';

import React, { useState, useMemo } from 'react';
import { usePlans } from '@/lib/hooks/usePlans';
import { useToast } from '@/components/ui/Toast';
import { SubscriptionPlan } from '@/lib/types';
import SubscriptionPlansHeader from './plans/SubscriptionPlansHeader';
import PlanCard from './plans/PlanCard';
import PlanFormModal, { PlanFormValues } from './plans/PlanFormModal';
import PlanEditImpactModal from './plans/PlanEditImpactModal';
import PlanDeactivateModal from './plans/PlanDeactivateModal';
import { Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

const ITEMS_PER_PAGE = 6;

export default function SubscriptionPlansView() {
  const [showInactive, setShowInactive] = useState(true);
  const { plans, isLoading, createPlan, updatePlan, deactivatePlan, fetchImpact, isCreating, isUpdating, isDeactivating } = usePlans(showInactive);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isEditImpactOpen, setIsEditImpactOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<PlanFormValues | null>(null);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [deactivatingPlanTarget, setDeactivatingPlanTarget] = useState<SubscriptionPlan | null>(null);

  // Filter & Search
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      const matchesSearch =
        plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [plans, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredPlans.length / ITEMS_PER_PAGE) || 1;
  const paginatedPlans = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPlans.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPlans, currentPage]);

  // Handlers
  const handleOpenCreate = () => {
    setEditingPlan(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setIsFormOpen(true);
  };

  const handleFormSubmit = (data: PlanFormValues) => {
    if (editingPlan) {
      setPendingFormData(data);
      setIsEditImpactOpen(true);
    } else {
      commitCreate(data);
    }
  };

  const commitCreate = async (data: PlanFormValues) => {
    try {
      await createPlan(data as any);
      toast('Plan Created', `Subscription plan "${data.name}" was created successfully.`, 'success');
      setIsFormOpen(false);
    } catch (err: any) {
      toast('Creation Failed', err.message || 'Failed to create plan.', 'error');
    }
  };

  const commitUpdate = async () => {
    if (!editingPlan || !pendingFormData) return;
    try {
      await updatePlan({ planId: editingPlan.id, updates: pendingFormData as any });
      toast('Plan Updated', `Plan "${pendingFormData.name}" updated and limits cache synced.`, 'success');
      setIsEditImpactOpen(false);
      setIsFormOpen(false);
      setEditingPlan(null);
      setPendingFormData(null);
    } catch (err: any) {
      toast('Update Failed', err.message || 'Failed to update plan.', 'error');
    }
  };

  const handleOpenDeactivate = (plan: SubscriptionPlan) => {
    setDeactivatingPlanTarget(plan);
    setIsDeactivateOpen(true);
  };

  const commitDeactivate = async () => {
    if (!deactivatingPlanTarget) return;
    try {
      await deactivatePlan(deactivatingPlanTarget.id);
      toast('Plan Deactivated', `Plan "${deactivatingPlanTarget.name}" is now soft-deactivated.`, 'success');
      setIsDeactivateOpen(false);
      setDeactivatingPlanTarget(null);
    } catch (err: any) {
      toast('Deactivation Failed', err.message || 'Failed to deactivate plan.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center space-y-3">
        <div className="h-7 w-7 border-2 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-xs text-muted-foreground font-medium">Loading subscription plans...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans select-text pointer-events-auto">
      {/* Header */}
      <SubscriptionPlansHeader
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        showInactive={showInactive}
        onToggleShowInactive={(val) => {
          setShowInactive(val);
          setCurrentPage(1);
        }}
        onOpenCreateModal={handleOpenCreate}
        totalPlans={filteredPlans.length}
      />

      {/* Grid of Plans */}
      {paginatedPlans.length === 0 ? (
        <div className="py-16 text-center border border-dashed rounded-xl bg-card/40 space-y-2">
          <Layers className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-semibold text-foreground">No subscription plans found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your search filters or create a new plan tier.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {paginatedPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={handleOpenEdit}
                onDeactivate={handleOpenDeactivate}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border/40 text-xs">
          <p className="text-muted-foreground">
            Page <span className="font-semibold text-foreground">{currentPage}</span> of{' '}
            <span className="font-semibold text-foreground">{totalPages}</span> ({filteredPlans.length} plans)
          </p>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <PlanFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        editingPlan={editingPlan}
        isSubmitting={isCreating || isUpdating}
      />

      <PlanEditImpactModal
        isOpen={isEditImpactOpen}
        onClose={() => setIsEditImpactOpen(false)}
        onConfirm={commitUpdate}
        plan={editingPlan}
        fetchImpact={fetchImpact}
        isSubmitting={isUpdating}
      />

      <PlanDeactivateModal
        isOpen={isDeactivateOpen}
        onClose={() => setIsDeactivateOpen(false)}
        onConfirm={commitDeactivate}
        plan={deactivatingPlanTarget}
        isSubmitting={isDeactivating}
      />
    </div>
  );
}
