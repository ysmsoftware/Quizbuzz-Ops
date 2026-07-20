'use client';

import React from 'react';
import { EyeOff, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SubscriptionPlan } from '@/lib/types';

interface PlanDeactivateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  plan: SubscriptionPlan | null;
  isSubmitting: boolean;
}

export default function PlanDeactivateModal({
  isOpen,
  onClose,
  onConfirm,
  plan,
  isSubmitting,
}: PlanDeactivateModalProps) {
  if (!isOpen || !plan) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-destructive/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-5 bg-destructive/10 border-b border-destructive/20 flex items-center space-x-3">
            <div className="p-2 bg-destructive/20 rounded-full text-destructive">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-destructive">Deactivate Plan Tier</h3>
              <p className="text-xs text-muted-foreground">Soft-deactivate plan from public catalog</p>
            </div>
          </div>

          <div className="p-6 space-y-4 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              Are you sure you want to deactivate <strong className="text-foreground">"{plan.name}"</strong>?
            </p>

            <div className="p-3 bg-muted/40 rounded-md border border-border/40 text-muted-foreground">
              Existing subscriber organizations will maintain their current quota limits, but no new tenant organization will be able to select this tier.
            </div>

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
                disabled={isSubmitting}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Deactivating...' : 'Deactivate Plan'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
