'use client';

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GiveAiCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => Promise<void>;
  isSubmitting: boolean;
  /** The org's current AI credit pool, for the "Current → New" preview. */
  balance: number;
}

/** One-time bonus AI credits: added to the org's pool, they stay until used (no monthly cap applies). */
export default function GiveAiCreditsModal({ isOpen, onClose, onSubmit, isSubmitting, balance }: GiveAiCreditsModalProps) {
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const n = parseInt(amount, 10);
  const valid = Number.isInteger(n) && n >= 1 && reason.trim().length >= 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (valid) await onSubmit(n, reason.trim());
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-pink-500/40 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-pink-500/20 bg-pink-500/10 text-pink-600">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5" />
              <h2 className="text-base font-bold">Give Bonus AI Credits</h2>
            </div>
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            <p className="text-muted-foreground">
              Added to the organization&apos;s AI credit balance straight away. Bonus credits don&apos;t expire; they stay until used.
            </p>

            <div className="space-y-1">
              <label className="block font-semibold text-foreground">Credits to add</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-pink-500"
              />
              <p className="text-[11px] text-muted-foreground pt-1">
                Balance: <span className="font-semibold text-foreground">{balance}</span>
                {' → '}
                <span className="font-semibold text-pink-600">{balance + (Number.isInteger(n) && n > 0 ? n : 0)}</span>
              </p>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1">Reason (Required)</label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sign-up bonus, Diwali promotion"
                className="w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-pink-500"
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
                disabled={isSubmitting || !valid}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-pink-500 text-white shadow-xs hover:bg-pink-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Adding...' : `Add ${Number.isInteger(n) && n > 0 ? n : ''} Credits`}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
