'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, X, Check, Building2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SubscriptionPlan } from '@/lib/types';

interface PlanEditImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  plan: SubscriptionPlan | null;
  fetchImpact: (planId: string) => Promise<{ organizationCount: number; organizations: Array<{ id: string; name?: string }> }>;
  isSubmitting: boolean;
}

export default function PlanEditImpactModal({
  isOpen,
  onClose,
  onConfirm,
  plan,
  fetchImpact,
  isSubmitting,
}: PlanEditImpactModalProps) {
  const [impactData, setImpactData] = useState<{ organizationCount: number; organizations: Array<{ id: string; name?: string }> } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && plan) {
      setIsLoading(true);
      fetchImpact(plan.id)
        .then((res) => setImpactData(res))
        .catch(() => setImpactData(null))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, plan, fetchImpact]);

  if (!isOpen || !plan) return null;

  const count = impactData?.organizationCount ?? 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-amber-500/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-5 bg-amber-500/10 border-b border-amber-500/20 flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 rounded-full text-amber-500">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-amber-500">Propagate Plan Updates</h3>
              <p className="text-xs text-muted-foreground">Impact analysis on active subscribers</p>
            </div>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {isLoading ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-2">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                <p className="text-muted-foreground">Evaluating tenant impact...</p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-muted/40 rounded-lg border border-border/40 flex items-center space-x-3">
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <span className="font-bold text-foreground text-sm">{count} Active Organizations</span>
                    <p className="text-muted-foreground">will have their limits cache updated immediately.</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/5 rounded-md border border-amber-500/20 text-muted-foreground leading-relaxed">
                  Modifying limits or pricing for <strong className="text-foreground">"{plan.name}"</strong> will immediately sync limit caches (<code className="text-primary font-mono text-[11px]">planLimitsCache</code>) across all subscribed tenant organizations.
                </div>
              </>
            )}

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border/40">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isSubmitting || isLoading}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-amber-500 text-white shadow-xs hover:bg-amber-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Syncing...' : 'Confirm & Apply Updates'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
