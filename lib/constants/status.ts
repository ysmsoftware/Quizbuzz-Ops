/**
 * Single source for every status the dashboard displays or filters on.
 *
 * Values mirror the main app's Prisma enums (Quizbuzz-new/backend/prisma/schema.prisma:
 * ParticipantStatus, ContestStatus, PaymentStatus) — if the main app adds a value, add it
 * here once and every filter dropdown, badge and chart colour picks it up.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Animate the badge (a "happening right now" state). */
  pulse?: boolean;
}

type StatusMap<K extends string> = Record<K, StatusMeta>;

export const PARTICIPANT_STATUS: StatusMap<
  'PENDING_PAYMENT' | 'ASSIGNED' | 'REGISTERED' | 'CHECKED_IN' | 'IN_WAITING' | 'IN_QUIZ' | 'SUBMITTED' | 'DISQUALIFIED' | 'ABSENT'
> = {
  PENDING_PAYMENT: { label: 'Pending payment', tone: 'warning' },
  ASSIGNED: { label: 'Assigned', tone: 'info' },
  REGISTERED: { label: 'Registered', tone: 'info' },
  CHECKED_IN: { label: 'Checked in', tone: 'info' },
  IN_WAITING: { label: 'In waiting room', tone: 'warning' },
  IN_QUIZ: { label: 'In quiz', tone: 'accent', pulse: true },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  DISQUALIFIED: { label: 'Disqualified', tone: 'danger' },
  ABSENT: { label: 'Absent', tone: 'neutral' },
};

export const CONTEST_STATUS: StatusMap<
  'DRAFT' | 'PUBLISHED' | 'REGISTRATION_CLOSED' | 'LIVE' | 'EVALUATION' | 'RESULTS_OUT' | 'COMPLETED' | 'CANCELLED'
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Published', tone: 'info' },
  REGISTRATION_CLOSED: { label: 'Reg closed', tone: 'warning' },
  LIVE: { label: 'Live now', tone: 'danger', pulse: true },
  EVALUATION: { label: 'Evaluating', tone: 'accent' },
  RESULTS_OUT: { label: 'Results out', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

/**
 * Payment status as shown to operators. `SUCCESS` is the DB value for a captured payment;
 * `PAID` is what ops' own subscription payments use; `FREE` is the synthetic value for a
 * participant with no payment row.
 */
export const PAYMENT_STATUS: StatusMap<
  'CREATED' | 'PENDING' | 'SUCCESS' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'FREE'
> = {
  CREATED: { label: 'Created', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  SUCCESS: { label: 'Paid', tone: 'success' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'info' },
  FREE: { label: 'Free', tone: 'neutral' },
};

export const ORG_STATUS: StatusMap<'ACTIVE' | 'SUSPENDED' | 'DELETED'> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  DELETED: { label: 'Deleted', tone: 'neutral' },
};

export const BOOKING_STATUS: StatusMap<'quoted' | 'paid' | 'provisioned' | 'completed' | 'cancelled'> = {
  quoted: { label: 'Quoted', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  provisioned: { label: 'Provisioned', tone: 'warning' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const JOB_STATUS: StatusMap<'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'DELAYED'> = {
  WAITING: { label: 'Waiting', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  DELAYED: { label: 'Delayed', tone: 'warning' },
};

export const PAYOUT_ACCOUNT_STATUS: StatusMap<'PENDING' | 'ACTIVE' | 'VERIFICATION_FAILED' | 'DISABLED'> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  VERIFICATION_FAILED: { label: 'Verification failed', tone: 'danger' },
  DISABLED: { label: 'Disabled', tone: 'neutral' },
};

export const TRANSFER_STATUS: StatusMap<'PENDING' | 'PROCESSED' | 'FAILED' | 'REVERSED'> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  PROCESSED: { label: 'Processed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REVERSED: { label: 'Reversed', tone: 'info' },
};

export const MESSAGE_STATUS: StatusMap<'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED'> = {
  QUEUED: { label: 'Queued', tone: 'warning' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  SENT: { label: 'Sent', tone: 'success' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

export const STATUS_KINDS = {
  participant: PARTICIPANT_STATUS,
  contest: CONTEST_STATUS,
  payment: PAYMENT_STATUS,
  org: ORG_STATUS,
  booking: BOOKING_STATUS,
  job: JOB_STATUS,
  payout: PAYOUT_ACCOUNT_STATUS,
  transfer: TRANSFER_STATUS,
  message: MESSAGE_STATUS,
} as const;

export type StatusKind = keyof typeof STATUS_KINDS;

export function statusMeta(kind: StatusKind, value: string | null | undefined): StatusMeta {
  const map = STATUS_KINDS[kind] as Record<string, StatusMeta>;
  return (value && map[value]) || { label: value ? value.replace(/_/g, ' ') : '—', tone: 'neutral' };
}

/** `[{value, label}]` for a `<select>`; pass `all` to prepend an "All …" option with value `all`. */
export function statusOptions(kind: StatusKind, all?: string): { value: string; label: string }[] {
  const entries = Object.entries(STATUS_KINDS[kind] as Record<string, StatusMeta>)
    // PAID is only an alias of SUCCESS for ops' own payments — don't offer it twice.
    .filter(([value]) => !(kind === 'payment' && value === 'PAID'))
    .map(([value, meta]) => ({ value, label: meta.label }));
  return all ? [{ value: 'all', label: all }, ...entries] : entries;
}

/** Org list filter. Values are what `GET /ops/organizations?status=` accepts. */
export const ORG_STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
] as const;
export type OrgStatusFilter = (typeof ORG_STATUS_FILTERS)[number]['value'];

/** Hex colours for charts, derived from the same tones so a donut slice matches its badge. */
export const TONE_HEX: Record<Tone, string> = {
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  neutral: '#94a3b8',
  accent: '#8b5cf6',
};
