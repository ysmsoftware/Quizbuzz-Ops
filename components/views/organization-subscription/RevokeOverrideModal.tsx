'use client';

import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RevokeOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  isSubmitting: boolean;
}

export default function RevokeOverrideModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}: RevokeOverrideModalProps) {
  const [reason, setReason] = useState('Special event concluded early');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    await onConfirm(reason);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-destructive/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-destructive/20 bg-destructive/10 text-destructive">
            <div className="flex items-center space-x-2">
              <Trash2 className="h-5 w-5" />
              <h2 className="text-base font-bold">Revoke Custom Limit Override</h2>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              Are you sure you want to revoke this limit override? The organization will immediately revert to standard plan defaults.
            </p>

            <div>
              <label className="block font-semibold text-foreground mb-1">Revocation Reason (Required for Audit)</label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Special event concluded early"
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-destructive"
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
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Revoking...' : 'Revoke Override'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
