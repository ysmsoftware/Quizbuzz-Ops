'use client';

import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { SubscriptionPlan } from '@/lib/types';
import { formatInr } from '@/lib/format';
import type { CreateOrganizationInput } from '@/lib/api/organizations';

interface OrgCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  isCreating: boolean;
  onSubmit: (input: CreateOrganizationInput) => void | Promise<void>;
}

const slugFromName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50);

const inputClass =
  'w-full px-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground';
const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-muted-foreground block';

/** Onboard a tenant from Ops: creates the organization and its owner account, then emails the owner. */
export default function OrgCreateModal({ isOpen, onClose, plans, isCreating, onSubmit }: OrgCreateModalProps) {
  const starterId = useMemo(() => plans.find((p) => p.slug === 'starter')?.id ?? '', [plans]);
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', ownerEmail: '', planId: '' });
  const [slugTouched, setSlugTouched] = useState(false);

  if (!isOpen) return null;

  const planId = form.planId || starterId;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border/50 shadow-2xl rounded-xl p-6 w-full max-w-md space-y-4 font-sans"
      >
        <div className="flex justify-between items-center pb-2 border-b border-border/40">
          <div className="space-y-0.5">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-primary" /> Onboard New Organization
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Creates the organization and its owner, then emails the owner. A new owner sets a password with
              &ldquo;Forgot password&rdquo; on the main site.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSubmit({ ...form, planId });
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className={labelClass}>Organization Name</label>
            <input
              type="text"
              required
              minLength={2}
              placeholder="e.g. Bangalore Trivia Society"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value, slug: slugTouched ? prev.slug : slugFromName(e.target.value) }))
              }
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className={labelClass}>URL slug</label>
            <input
              type="text"
              required
              placeholder="e.g. bangalore-trivia"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Lowercase letters, numbers and single hyphens"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }));
              }}
              className={`${inputClass} font-mono`}
            />
            <p className="text-[10px] text-muted-foreground">Part of the organization&apos;s public URLs. It cannot be changed later.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass}>Owner Name</label>
              <input
                type="text"
                required
                minLength={2}
                placeholder="Rahul Hegde"
                value={form.ownerName}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Owner Email</label>
              <input
                type="email"
                required
                placeholder="rahul@domain.com"
                value={form.ownerEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerEmail: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Subscription plan</label>
            <select value={planId} onChange={(e) => setForm((prev) => ({ ...prev, planId: e.target.value }))} className={inputClass}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatInr(p.priceINR)}/mo)
                </option>
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
              disabled={isCreating}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-60"
            >
              {isCreating ? 'Creating…' : 'Create organization'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
