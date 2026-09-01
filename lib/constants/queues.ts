/**
 * Canonical list of every BullMQ queue the main app defines — see
 * Quizbuzz-new/backend/src/queues/index.ts (source of truth). Kept here so
 * the Job Timeline "Queue" filter can offer a dropdown instead of a
 * free-text box a user has to guess the exact name for (see
 * claude/job-timeline-audit-log-fixes-audit-and-plan.md, Issue 2).
 *
 * `instrumented: false` queues never call the checkpoint-recording helper
 * (withCheckpoint/recordJobBoundary) yet, so selecting them will correctly
 * show "No jobs recorded" until a worker adds that instrumentation — see the
 * same doc, Issue 3. They're still listed so the dropdown is honest about
 * what exists in the system.
 */
export interface QueueOption {
  value: string;
  label: string;
  instrumented: boolean;
}

export const KNOWN_QUEUES: QueueOption[] = [
  { value: 'submission-queue', label: 'submission-queue', instrumented: true },
  { value: 'evaluation-queue', label: 'evaluation-queue', instrumented: true },
  { value: 'certificate-queue', label: 'certificate-queue', instrumented: true },
  { value: 'message-queue', label: 'message-queue', instrumented: true },
  { value: 'leaderboard-queue', label: 'leaderboard-queue', instrumented: true },
  { value: 'quiz-timer-queue', label: 'quiz-timer-queue', instrumented: true },
  { value: 'capture-metadata-queue', label: 'capture-metadata-queue', instrumented: true },
  { value: 'export-queue', label: 'export-queue', instrumented: true },
  { value: 'route-transfer-queue', label: 'route-transfer-queue (not instrumented)', instrumented: false },
  { value: 'analytics-queue', label: 'analytics-queue', instrumented: true },
  // Org-agnostic periodic sweeps — ScheduledJob.organizationId is a required
  // FK, and these process every org in one run, so they can never get a
  // summary row without a schema change. Listed for transparency; picking
  // one will show "No jobs recorded" by design, not by bug.
  { value: 'payment-cleanup-queue', label: 'payment-cleanup-queue (sweep — no per-org rows)', instrumented: false },
  { value: 'contest-reconciliation-queue', label: 'contest-reconciliation-queue (sweep — no per-org rows)', instrumented: false },
  { value: 'audit-retention-queue', label: 'audit-retention-queue (sweep — no per-org rows)', instrumented: false },
  { value: 'progress-snapshot-queue', label: 'progress-snapshot-queue (sweep — no per-org rows)', instrumented: false },
  { value: 'checkpoint-drain-queue', label: 'checkpoint-drain-queue (internal — not instrumented)', instrumented: false },
];
