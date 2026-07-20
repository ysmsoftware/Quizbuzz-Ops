'use client';

import React from 'react';
import { Edit3, X } from 'lucide-react';
import { motion } from 'motion/react';
import { SubscriptionPlan } from '@/lib/types';

interface OrgEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editFields: {
    name: string;
    website: string;
    logoUrl: string;
    planId: string;
  };
  setEditFields: React.Dispatch<
    React.SetStateAction<{
      name: string;
      website: string;
      logoUrl: string;
      planId: string;
    }>
  >;
  plans: SubscriptionPlan[];
  isUpdating: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function OrgEditModal({
  isOpen,
  onClose,
  editFields,
  setEditFields,
  plans,
  isUpdating,
  onSubmit,
}: OrgEditModalProps) {
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
            <Edit3 className="h-4 w-4 text-primary" /> Modify Tenant Details
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Display Name</label>
            <input
              type="text"
              required
              value={editFields.name}
              onChange={(e) => setEditFields(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Website Domain URL</label>
            <input
              type="url"
              required
              value={editFields.website}
              onChange={(e) => setEditFields(prev => ({ ...prev, website: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Logo Image URL</label>
            <input
              type="url"
              required
              value={editFields.logoUrl}
              onChange={(e) => setEditFields(prev => ({ ...prev, logoUrl: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">SaaS Pricing Subscription Plan</label>
            <select
              value={editFields.planId}
              onChange={(e) => setEditFields(prev => ({ ...prev, planId: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-secondary/20 border border-border/50 rounded-lg outline-none text-foreground"
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name} (₹{p.priceINR}/mo)</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdating}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
            >
              {isUpdating ? 'Saving profile...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
