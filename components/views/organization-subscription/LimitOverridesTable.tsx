'use client';

import React from 'react';
import { SubscriptionOverride } from '@/lib/types';
import { Plus, Trash2, ShieldAlert, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface LimitOverridesTableProps {
  overrides: SubscriptionOverride[];
  onAddOverrideClick: () => void;
  onRevokeOverrideClick: (overrideId: string) => void;
}

const limitLabels: Record<string, string> = {
  maxContestsPerCycle: 'Max Quizzes per Period',
  maxParticipantsPerContest: 'Max Participants per Quiz',
  maxQuestionsPerContest: 'Max Questions per Quiz',
  maxOrgMembers: 'Max Team Members',
};

export default function LimitOverridesTable({
  overrides,
  onAddOverrideClick,
  onRevokeOverrideClick,
}: LimitOverridesTableProps) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          <h3 className="font-bold text-sm text-foreground">Custom Limit Overrides</h3>
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
            {overrides.length} Active
          </span>
        </div>

        <button
          type="button"
          onClick={onAddOverrideClick}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 text-white shadow-xs hover:bg-amber-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Custom Override</span>
        </button>
      </div>

      {overrides.length === 0 ? (
        <div className="py-8 text-center border border-dashed rounded-lg bg-muted/20 text-xs text-muted-foreground">
          No custom limit overrides currently active for this organization.
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/40 text-muted-foreground font-semibold border-b">
              <tr>
                <th className="py-2.5 px-3">Limit Field</th>
                <th className="py-2.5 px-3">Adjustment</th>
                <th className="py-2.5 px-3">Authorization Reason</th>
                <th className="py-2.5 px-3">Expires At</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {overrides.map((ov) => (
                <tr key={ov.id} className="hover:bg-muted/20">
                  <td className="py-2.5 px-3 font-semibold text-foreground">
                    {limitLabels[ov.field] || ov.field}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-amber-600">
                    {ov.value === null || ov.value === undefined
                      ? 'Unlimited'
                      : ov.mode === 'ADDITIVE'
                        ? `+${ov.value}`
                        : `= ${ov.value}`}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">{ov.reason}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">
                    {ov.expiresAt ? (
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(ov.expiresAt), 'MMM d, yyyy HH:mm')}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic">Never (Permanent)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onRevokeOverrideClick(ov.id)}
                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="Revoke Override"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
