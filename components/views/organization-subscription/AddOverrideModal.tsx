'use client';

import React, { useState } from 'react';
import { SubscriptionPlan, SubscriptionOverride } from '@/lib/types';
import { ShieldAlert, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AddOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (override: Omit<SubscriptionOverride, 'id' | 'createdAt'>) => Promise<void>;
  isSubmitting: boolean;
}

const limitLabels: Record<string, string> = {
  maxContestsPerCycle: 'Max Quizzes per Period',
  maxParticipantsPerContest: 'Max Participants per Quiz',
  maxQuestionsPerContest: 'Max Questions per Quiz',
  maxOrgMembers: 'Max Team Members',
};

export default function AddOverrideModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: AddOverrideModalProps) {
  const [field, setField] = useState<keyof SubscriptionPlan['limits']>('maxContestsPerCycle');
  const [value, setValue] = useState('25');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const numericVal = isUnlimited ? null : parseInt(value, 10);
    await onSubmit({
      field,
      value: numericVal,
      reason,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      createdByAdminName: 'Super Admin',
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-amber-500/40 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-amber-500/20 bg-amber-500/10 text-amber-600">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="text-base font-bold">Grant Custom Limit Override</h2>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-foreground mb-1">Target Quota Field</label>
              <select
                value={field}
                onChange={(e) => setField(e.target.value as any)}
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-amber-500"
              >
                {Object.entries(limitLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-semibold text-foreground">New Override Limit</label>
                <label className="flex items-center space-x-1.5 cursor-pointer text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isUnlimited}
                    onChange={(e) => setIsUnlimited(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input text-amber-500"
                  />
                  <span>Unlimited Quota</span>
                </label>
              </div>

              {!isUnlimited && (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-amber-500"
                />
              )}
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1">Reason for Authorization (Required)</label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Special institutional hackathon authorization"
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1">Expiration Date (Optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-amber-500"
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
                disabled={isSubmitting || !reason.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-amber-500 text-white shadow-xs hover:bg-amber-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Applying...' : 'Apply Custom Override'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
