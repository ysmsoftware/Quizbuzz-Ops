'use client';

import { AlertTriangle } from 'lucide-react';
import { useTypeChangePreview } from '@/lib/hooks/useOrganizations';
import { INSTITUTION_FLAGS } from '@/lib/constants/institution';
import { orgTypeLabel, type OrgProfileType } from '@/lib/constants/org-profile-types';

const flagLabel = (key: string) => INSTITUTION_FLAGS.find((f) => f.key === key)?.label ?? key.replace(/_/g, ' ');
const list = (keys: string[]) => keys.map(flagLabel).join(', ');

/** Shown in the edit modal once a different type is picked: what the switch gains, loses and leaves behind. */
export default function TypeChangeNotice({ orgId, to }: { orgId: string; to: OrgProfileType }) {
  const { data, isLoading, isError } = useTypeChangePreview(orgId, to);
  if (isLoading) return <p className="text-[10px] text-muted-foreground">Checking what this changes…</p>;
  if (isError || !data) return <p className="text-[10px] text-rose-500">Couldn&apos;t check what this changes. Saving still works.</p>;

  const lines = [
    data.flagsGained.length > 0 && `Turns on (unless overridden): ${list(data.flagsGained)}.`,
    data.flagsLost.length > 0 && `No longer on by default: ${list(data.flagsLost)}.`,
    data.flagsDenied.length > 0 && `Turned off for companies, even with an override: ${list(data.flagsDenied)}.`,
    data.openPublicContests > 0 && `${data.openPublicContests} open public contest(s) stay listed. Only new ones are blocked.`,
    data.openPaidContests > 0 && `${data.openPaidContests} open paid contest(s) keep their fees. Only new ones are blocked.`,
    data.liveAssignedContests > 0 && `${data.liveAssignedContests} live assigned contest(s) lose portal sign-in for their people.`,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
        <AlertTriangle className="h-3.5 w-3.5" /> {orgTypeLabel(data.from)} → {orgTypeLabel(data.to)}
      </p>
      {lines.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Only labels change. Running contests are never stopped.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-muted-foreground">
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}
