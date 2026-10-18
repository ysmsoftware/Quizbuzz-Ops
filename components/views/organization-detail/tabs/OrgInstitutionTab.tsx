'use client';

import React from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, GraduationCap, Layers, Users, ClipboardList, BookOpenCheck, Timer } from 'lucide-react';
import { useOrgInstitution } from '@/lib/hooks/useOrganizations';
import { formatNumber } from '@/lib/format';
import StatusBadge from '@/components/ui/StatusBadge';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">{label}</span>
      <span className="text-xl font-bold font-mono text-foreground block leading-tight">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground block">{sub}</span>}
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/40 rounded-xl p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm text-foreground pb-2 border-b border-border/30 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {children}
    </div>
  );
}

/** A row of "label n" pills, hiding zeros so the line only says what is actually in use. */
function Counts({ items }: { items: Array<[string, number]> }) {
  const used = items.filter(([, n]) => n > 0);
  if (used.length === 0) return <span className="text-[11px] text-muted-foreground">none yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {used.map(([label, n]) => (
        <span key={label} className="inline-flex items-center gap-1 rounded border border-border/50 bg-secondary/30 px-2 py-0.5 text-[11px] text-foreground">
          {label} <b className="font-mono">{formatNumber(n)}</b>
        </span>
      ))}
    </div>
  );
}

/** Read-only view of how this organization uses institution mode (all numbers from the main app's DB). */
export default function OrgInstitutionTab({ orgId }: { orgId: string }) {
  const { data, isLoading, isError, error, refetch } = useOrgInstitution(orgId);

  if (isLoading) return <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading institution usage...</div>;
  if (isError || !data) {
    return (
      <div className="p-12 text-center text-xs space-y-2">
        <AlertTriangle className="h-6 w-6 text-destructive/70 mx-auto" />
        <p className="font-semibold text-foreground">Couldn&apos;t load institution usage</p>
        <p className="text-muted-foreground">{(error as Error | null)?.message}</p>
        <button onClick={() => refetch()} className="px-3 py-1.5 font-semibold rounded-md border border-border/50 bg-card hover:bg-secondary cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  const { learners, groups, contests, assigned, gradebook } = data;
  const ungrouped = Math.max(learners.activeLearners - groups.learnersInGroups, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-sans">
      <Card icon={Users} title="Learners & portal">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Active learners" value={formatNumber(learners.activeLearners)} />
          <Stat label="Alumni" value={formatNumber(learners.alumni)} />
          <Stat label="Portal access" value={formatNumber(learners.portalEnabled)} sub="can log in" />
          <Stat label="All contacts" value={formatNumber(learners.contacts)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Last portal login: {learners.lastPortalLogin ? format(parseISO(learners.lastPortalLogin), 'dd MMM yyyy, hh:mm a') : 'never'}
        </p>
      </Card>

      <Card icon={Layers} title="Groups">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Groups" value={formatNumber(groups.total)} />
          <Stat label="Levels deep" value={groups.levels || '—'} />
          <Stat label="In a group" value={formatNumber(groups.learnersInGroups)} sub={ungrouped > 0 ? `${formatNumber(ungrouped)} not in any group` : 'all grouped'} />
        </div>
      </Card>

      <Card icon={Timer} title="Contests by format">
        <div className="space-y-3">
          <Stat label="Contests" value={formatNumber(contests.total)} sub={contests.liveWindow > 0 ? `${contests.liveWindow} window contest(s) live now` : undefined} />
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Timing</span><Counts items={[['Scheduled', contests.byTimingMode.SCHEDULED], ['Window', contests.byTimingMode.WINDOW]]} /></div>
            <div className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Audience</span><Counts items={[['Public', contests.byAudience.PUBLIC], ['Private link', contests.byAudience.PRIVATE_LINK], ['Assigned', contests.byAudience.ASSIGNED]]} /></div>
            <div className="flex items-center gap-2"><span className="w-20 text-muted-foreground">Questions</span><Counts items={[['All', contests.byQuestionSelection.ALL], ['Sets', contests.byQuestionSelection.SETS], ['Pool', contests.byQuestionSelection.POOL]]} /></div>
          </div>
        </div>
      </Card>

      <Card icon={ClipboardList} title="Assigned tests (learner participation)">
        <Stat label="Assigned participants" value={formatNumber(assigned.total)} />
        {assigned.total > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(assigned.byStatus).map(([status, n]) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <StatusBadge kind="participant" value={status} />
                <b className="font-mono text-[11px]">{formatNumber(n)}</b>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card icon={BookOpenCheck} title="Gradebook">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Categories" value={formatNumber(gradebook.categories)} />
          <Stat label="Terms" value={formatNumber(gradebook.terms)} />
          <Stat label="Tests included" value={formatNumber(gradebook.contestsIncluded)} />
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground w-20">Marksheets</span>
          <Counts items={Object.entries(gradebook.marksheets.byStatus).map(([s, n]) => [s.toLowerCase(), n] as [string, number])} />
        </div>
      </Card>

      <div className="lg:col-span-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <GraduationCap className="h-3.5 w-3.5" /> Read-only. Counts come straight from the main app&apos;s database; use the Features tab to grant or revoke access.
      </div>
    </div>
  );
}
