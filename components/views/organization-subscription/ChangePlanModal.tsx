'use client';

import React, { useState } from 'react';
import { SubscriptionPlan } from '@/lib/types';
import { Layers, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChangePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (selectedPlanId: string, reason: string) => Promise<void>;
  plans: SubscriptionPlan[];
  currentPlanId: string;
  isSubmitting: boolean;
}

export default function ChangePlanModal({
  isOpen,
  onClose,
  onSubmit,
  plans,
  currentPlanId,
  isSubmitting,
}: ChangePlanModalProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId);
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId || selectedPlanId === currentPlanId) return;
    await onSubmit(selectedPlanId, reason);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
            <div className="flex items-center space-x-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">Change Organization Subscription Plan</h2>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <div className="space-y-2">
              <label className="block font-semibold text-foreground">Select Target Tier</label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {plans.filter(p => p.isActive).map((p) => {
                  const isCurrent = p.id === currentPlanId;
                  const isSelected = p.id === selectedPlanId;

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isCurrent && setSelectedPlanId(p.id)}
                      className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                        isCurrent
                          ? 'border-muted bg-muted/30 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-foreground">{p.name}</span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.description}</p>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-foreground">
                          {p.price === 0 ? 'Free' : `₹${p.price.toLocaleString('en-IN')}`}
                        </span>
                        {isSelected && !isCurrent && <Check className="h-4 w-4 text-primary ml-auto mt-1 font-bold" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1">Reason / Notes for Audit Log</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Approved tier upgrade request following team expansion"
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary"
              />
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
                type="submit"
                disabled={isSubmitting || !selectedPlanId || selectedPlanId === currentPlanId}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Migrating...' : 'Confirm Plan Switch'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
