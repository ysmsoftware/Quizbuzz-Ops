'use client';

import React from 'react';
import { Lock, X } from 'lucide-react';
import { motion } from 'motion/react';

interface OrgSuspendModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  suspendReason: string;
  setSuspendReason: (val: string) => void;
  isSuspending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function OrgSuspendModal({
  isOpen,
  onClose,
  orgName,
  suspendReason,
  setSuspendReason,
  isSuspending,
  onSubmit,
}: OrgSuspendModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex justify-between items-center pb-2 border-b border-border/40">
          <h3 className="font-bold text-destructive text-sm flex items-center gap-1.5">
            <Lock className="h-4 w-4" /> Suspend Tenant Operations
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Applying operational freeze to <span className="font-bold text-foreground">{orgName}</span>. 
          Staff access, hosted quiz portals, and participant entries will be frozen immediately.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-destructive block">Suspension Justification / Notes</label>
            <input
              type="text"
              required
              placeholder="e.g. Terms violation, payment dispute"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-destructive focus:ring-1 focus:ring-destructive transition-all text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSuspending}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 transition-all cursor-pointer"
            >
              {isSuspending ? 'Enforcing freeze...' : 'Confirm Suspension'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
