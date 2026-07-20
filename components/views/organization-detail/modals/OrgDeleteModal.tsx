'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface OrgDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  confirmNameDelete: string;
  setConfirmNameDelete: (val: string) => void;
  isDeleting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function OrgDeleteModal({
  isOpen,
  onClose,
  orgName,
  confirmNameDelete,
  setConfirmNameDelete,
  isDeleting,
  onSubmit,
}: OrgDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-destructive/30 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-border/40 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 animate-pulse" />
          <h3 className="font-bold text-sm">Authorize Destructive Soft-Delete</h3>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          You are about to soft-delete <span className="font-bold text-foreground">{orgName}</span>. 
          This will disable their billing subscription plan and hide the tenant from standard directory lists.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Please type <span className="font-mono font-bold text-foreground">"{orgName}"</span> to confirm:
            </label>
            <input
              type="text"
              required
              placeholder={orgName}
              value={confirmNameDelete}
              onChange={(e) => setConfirmNameDelete(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
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
              disabled={isDeleting || confirmNameDelete !== orgName}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isDeleting ? 'Deleting registers...' : 'Authorize Deletion'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
