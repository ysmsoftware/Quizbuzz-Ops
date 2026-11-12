'use client';

import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { motion } from 'motion/react';

interface OrgReactivateModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  isActivating: boolean;
  onConfirm: () => void;
}

export default function OrgReactivateModal({ isOpen, onClose, orgName, isActivating, onConfirm }: OrgReactivateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex justify-between items-center pb-2 border-b border-border/40">
          <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4" /> Reactivate Tenant
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Reactivating <span className="font-bold text-foreground">{orgName}</span>. Its team can sign in again, public registration
          resumes, and the owner is emailed.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isActivating}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isActivating ? 'Activating...' : 'Confirm Reactivation'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
