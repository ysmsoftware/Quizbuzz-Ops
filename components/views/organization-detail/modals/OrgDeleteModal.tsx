'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface OrgDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  isDeleting: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

/** Soft delete: type the org name + give a reason (kept in the audit trail). */
export default function OrgDeleteModal({ isOpen, onClose, orgName, isDeleting, onConfirm }: OrgDeleteModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const close = () => {
    setConfirmName('');
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-destructive/30 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-border/40 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h3 className="font-bold text-sm">Delete organization</h3>
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <span className="font-bold text-foreground">{orgName}</span> will be hidden from every list, its team can no longer sign in
            or act, and its public pages and contest entry go dark.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Nothing is erased — you can restore it later from the Deleted filter.</li>
            <li>The owner is <span className="font-semibold text-foreground">not</span> notified. (Use Suspend if they should be told.)</li>
          </ul>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onConfirm(reason.trim());
            close();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Reason (audit trail)</label>
            <input
              type="text"
              required
              minLength={3}
              placeholder="e.g. Requested by owner, duplicate tenant"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Type <span className="font-mono font-bold text-foreground">&quot;{orgName}&quot;</span> to confirm:
            </label>
            <input
              type="text"
              required
              placeholder={orgName}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting || confirmName !== orgName || reason.trim().length < 3}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isDeleting ? 'Deleting…' : 'Delete organization'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
