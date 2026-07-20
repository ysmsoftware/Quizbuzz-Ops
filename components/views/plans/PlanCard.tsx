'use client';

import React from 'react';
import { SubscriptionPlan } from '@/lib/types';
import { 
  Edit3, EyeOff, Check, X, Users, Trophy, HelpCircle, 
  ShieldCheck, Download, Globe, Lock, Layers, Building2 
} from 'lucide-react';
import { motion } from 'motion/react';

interface PlanCardProps {
  plan: SubscriptionPlan;
  onEdit: (plan: SubscriptionPlan) => void;
  onDeactivate: (plan: SubscriptionPlan) => void;
  orgCount?: number;
}

export default function PlanCard({ plan, onEdit, onDeactivate, orgCount = 0 }: PlanCardProps) {
  const isFree = plan.price === 0;
  const activeCount = plan.organizationCount ?? orgCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`relative flex flex-col justify-between bg-card border rounded-xl p-5 shadow-xs transition-all duration-200 ${
        !plan.isActive ? 'opacity-60 border-dashed border-muted-foreground/30 bg-muted/20' : 'border-border/60 hover:border-primary/40 hover:shadow-md'
      }`}
    >
      <div>
        {/* Header Badges & Actions */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-base text-foreground tracking-tight">{plan.name}</h3>
              {!plan.isActive ? (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-destructive/10 text-destructive rounded-full border border-destructive/20">
                  Inactive
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 rounded-full border border-emerald-500/20">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-muted-foreground">slug: {plan.slug}</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => onEdit(plan)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Edit Plan"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            {plan.isActive && (
              <button
                type="button"
                onClick={() => onDeactivate(plan)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                title="Deactivate Plan"
              >
                <EyeOff className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[32px]">
          {plan.description}
        </p>

        {/* Pricing */}
        <div className="mt-4 pb-4 border-b border-border/40 flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-extrabold tracking-tight text-foreground">
              {isFree ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
            </span>
            {!isFree && (
              <span className="text-xs text-muted-foreground font-medium ml-1">
                / {plan.billingCycle === 'annual' ? 'year' : 'month'}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground">{activeCount}</span>
            <span>orgs</span>
          </div>
        </div>

        {/* Limits Grid */}
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Plan Quotas</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted/40 border border-border/30">
              <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-muted-foreground">Quizzes:</span>
              <span className="font-semibold ml-auto">{plan.limits.maxContestsPerCycle ?? 'Unlimited'}</span>
            </div>
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted/40 border border-border/30">
              <Users className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-muted-foreground">Players:</span>
              <span className="font-semibold ml-auto">{plan.limits.maxParticipantsPerContest ?? 'Unlimited'}</span>
            </div>
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted/40 border border-border/30">
              <HelpCircle className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="text-muted-foreground">Questions:</span>
              <span className="font-semibold ml-auto">{plan.limits.maxQuestionsPerContest ?? 'Unlimited'}</span>
            </div>
            <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted/40 border border-border/30">
              <Layers className="h-3.5 w-3.5 text-purple-500 shrink-0" />
              <span className="text-muted-foreground">Members:</span>
              <span className="font-semibold ml-auto">{plan.limits.maxOrgMembers ?? 'Unlimited'}</span>
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Features Included</p>
          <ul className="space-y-1 text-xs">
            <FeatureItem icon={ShieldCheck} label="AI Proctoring" enabled={plan.features.proctoring} />
            <FeatureItem icon={Lock} label="Custom Branding" enabled={plan.features.customCertificateBranding} />
            <FeatureItem icon={Download} label="Analytics Export" enabled={plan.features.analyticsExport} />
            <FeatureItem icon={Globe} label="Custom Domain" enabled={plan.features.customDomain} />
            <FeatureItem icon={ShieldCheck} label="Priority Support" enabled={plan.features.prioritySupport} />
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

function FeatureItem({ icon: Icon, label, enabled }: { icon: any; label: string; enabled: boolean }) {
  return (
    <li className="flex items-center justify-between py-0.5">
      <span className="flex items-center space-x-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span>{label}</span>
      </span>
      {enabled ? (
        <Check className="h-3.5 w-3.5 text-emerald-500 font-bold" />
      ) : (
        <X className="h-3.5 w-3.5 text-muted-foreground/30" />
      )}
    </li>
  );
}
