'use client';

import React from 'react';
import { OrganizationSubscription, UsageSnapshot } from '@/lib/types';
import { Trophy, Users, HelpCircle, Layers, ShieldAlert } from 'lucide-react';

interface QuotaUsageGridProps {
  /** Only `effectiveLimits` is read — already computed server-side (see effective-limits.ts), never re-derived here. */
  subscription: OrganizationSubscription;
  usage: UsageSnapshot | null;
}

export default function QuotaUsageGrid({ subscription, usage }: QuotaUsageGridProps) {
  const { effectiveLimits } = subscription;

  const quotas = [
    {
      key: 'maxContestsPerCycle' as const,
      label: 'Quizzes per Period',
      icon: Trophy,
      color: 'text-amber-500',
      used: usage?.contestsUsedThisCycle ?? 0,
      limitInfo: effectiveLimits.maxContestsPerCycle,
    },
    {
      key: 'maxParticipantsPerContest' as const,
      label: 'Max Participants per Quiz',
      icon: Users,
      color: 'text-blue-500',
      // This is a per-contest ceiling, not an org-wide total — showing the
      // org's single fullest contest is what actually indicates how close
      // they are to hitting it.
      used: usage?.maxParticipantsInAContest ?? 0,
      limitInfo: effectiveLimits.maxParticipantsPerContest,
    },
    {
      key: 'maxQuestionsPerContest' as const,
      label: 'Max Questions per Quiz',
      icon: HelpCircle,
      color: 'text-indigo-500',
      used: usage?.maxQuestionsInAContest ?? 0,
      limitInfo: effectiveLimits.maxQuestionsPerContest,
    },
    {
      key: 'maxOrgMembers' as const,
      label: 'Team Members',
      icon: Layers,
      color: 'text-purple-500',
      used: usage?.memberCountUsed ?? 1,
      limitInfo: effectiveLimits.maxOrgMembers,
    },
  ];

  return (
    <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {quotas.map((quota) => {
        const Icon = quota.icon;
        const maxVal = quota.limitInfo.value;
        const isUnlimited = maxVal === null || maxVal === undefined;
        const percent = isUnlimited ? 0 : Math.min(100, Math.round(((quota.used || 0) / maxVal) * 100));

        return (
          <div
            key={quota.key}
            className={`p-5 bg-card border rounded-xl space-y-4 shadow-xs relative overflow-hidden transition-all ${
              quota.limitInfo.overridden ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-lg bg-muted/50 ${quota.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-foreground">{quota.label}</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {quota.limitInfo.overridden ? (
                      <span className="text-amber-600 font-medium">Overridden (Plan default: {quota.limitInfo.planValue ?? '∞'})</span>
                    ) : (
                      'Standard tier limit'
                    )}
                  </p>
                </div>
              </div>

              {quota.limitInfo.overridden && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-600 border border-amber-500/30 flex items-center space-x-1">
                  <ShieldAlert className="h-3 w-3" />
                  <span>Override Active</span>
                </span>
              )}
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Used / Quota</span>
                <span className="font-bold text-foreground">
                  {quota.used} / {isUnlimited ? 'Unlimited' : maxVal}
                </span>
              </div>

              {!isUnlimited && (
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      percent > 90 ? 'bg-destructive' : percent > 75 ? 'bg-amber-500' : 'bg-primary'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
