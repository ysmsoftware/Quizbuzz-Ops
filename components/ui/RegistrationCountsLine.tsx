import type { RegistrationCounts } from '@/lib/types';
import { formatNumber } from '@/lib/format';

/**
 * What sits behind a confirmed count: unpaid registrations support may need to look into.
 * Stays empty when there are none, unless `showTotal` asks for the full split.
 */
export default function RegistrationCountsLine({ counts, showTotal = false }: { counts?: RegistrationCounts; showTotal?: boolean }) {
  if (!counts || (!showTotal && counts.pending === 0 && counts.failed === 0)) return null;
  return (
    <span className="block text-[10px] font-normal font-sans text-muted-foreground">
      {showTotal && <>{formatNumber(counts.total)} total · </>}
      <span className={counts.pending > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}>{formatNumber(counts.pending)} pending</span>
      {' · '}
      <span className={counts.failed > 0 ? 'text-destructive' : undefined}>{formatNumber(counts.failed)} failed</span>
    </span>
  );
}
