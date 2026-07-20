'use client';

import React from 'react';
import { UserCheck, Info } from 'lucide-react';
import { motion } from 'motion/react';

interface OrgImpersonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgName: string;
  orgSlug: string;
  adminEmail?: string;
  onConfirm: () => void;
}

export default function OrgImpersonateModal({
  isOpen,
  onClose,
  orgName,
  orgSlug,
  adminEmail,
  onConfirm,
}: OrgImpersonateModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-amber-500/30 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-border/40 text-amber-600">
          <UserCheck className="h-5 w-5 shrink-0" />
          <h3 className="font-bold text-sm">Tenant Administrative Impersonation</h3>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            You are initiating staff impersonation for <span className="font-bold text-foreground">{orgName}</span> (<span className="font-mono">{orgSlug}</span>).
          </p>
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-700 text-[11px] leading-relaxed font-medium flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>An immutable security audit entry will be logged under your operator identity ({adminEmail}).</span>
          </div>
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
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-bold rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-sm cursor-pointer"
          >
            Confirm & Enter Impersonation
          </button>
        </div>
      </motion.div>
    </div>
  );
}
