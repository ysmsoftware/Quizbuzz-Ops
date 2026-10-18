/**
 * Audit action catalogue — the one place both audit tabs get their "Operation" / "Action" dropdowns.
 *
 * `domain` is the prefix before the first dot (`org.suspended` → `org`). The lists below name
 * the actions the code writes today so every option has a nice label even before it has ever
 * occurred; `mergeActionGroups` then folds in whatever the server has actually seen
 * (`/audit-log/actions`), so a newly instrumented action shows up without a UI edit.
 */
export interface AuditActionGroup {
  domain: string;
  label: string;
  actions: string[];
}

/** Written by this app (PlatformAuditLog). */
export const OPS_AUDIT_GROUPS: AuditActionGroup[] = [
  { domain: 'admin', label: 'Admin', actions: ['admin.logged_in', 'admin.logged_out', 'admin.otp_generated'] },
  {
    domain: 'org',
    label: 'Organization',
    actions: [
      'org.created', 'org.updated', 'org.suspended', 'org.reactivated', 'org.deleted', 'org.restored',
      'org.note_added', 'org.message_sent', 'org.message_retried',
      'org.payout_account_linked', 'org.payout_account_status_changed', 'org.payout_transfer_retry_requested',
    ],
  },
  {
    domain: 'feature_flag',
    label: 'Feature Flag',
    actions: ['feature_flag.toggled', 'feature_flag.org_override.set', 'feature_flag.org_override.removed', 'feature_flag.sync_repaired'],
  },
  { domain: 'plan', label: 'Plan', actions: ['plan.created', 'plan.updated', 'plan.deactivated'] },
  {
    domain: 'subscription',
    label: 'Subscription',
    actions: ['subscription.created', 'subscription.plan_changed', 'subscription.expired', 'subscription.cache_sync_failed', 'subscription.renewal_reminder_resent'],
  },
  { domain: 'override', label: 'Override', actions: ['override.added', 'override.removed', 'override.expired'] },
  { domain: 'booking', label: 'Booking', actions: ['booking.created', 'booking.status_changed'] },
  { domain: 'pricing_config', label: 'Pricing Config', actions: ['pricing_config.updated'] },
  {
    domain: 'billing_portal',
    label: 'Billing Portal',
    actions: ['billing_portal.checkout_started', 'billing_portal.payment_attempted', 'billing_portal.payment_succeeded', 'billing_portal.payment_failed', 'billing_portal.receipt_resent'],
  },
  { domain: 'payment', label: 'Payment', actions: ['payment.refunded'] },
  { domain: 'ambassador_type', label: 'Ambassador Type', actions: ['ambassador_type.created', 'ambassador_type.updated', 'ambassador_type.deleted', 'ambassador_type.org_access.set'] },
  { domain: 'college', label: 'College', actions: ['college.created', 'college.updated', 'college.deleted', 'unlisted_college.dismissed'] },
  { domain: 'department', label: 'Department', actions: ['department.created', 'department.updated', 'unlisted_department.dismissed'] },
  { domain: 'app_settings', label: 'App Settings', actions: ['app_settings.logo_updated', 'app_settings.logo_removed'] },
  { domain: 'system', label: 'System', actions: ['system.cache_reconciled'] },
];

/** Written by the main app (audit_logs), read cross-DB. */
export const MAIN_AUDIT_GROUPS: AuditActionGroup[] = [
  { domain: 'auth', label: 'Auth', actions: ['auth.admin_login', 'auth.admin_logout', 'auth.admin_email_verified', 'auth.participant_login'] },
  { domain: 'organization', label: 'Organization', actions: ['organization.created', 'organization.member_invited', 'organization.member_role_changed', 'organization.member_removed'] },
  { domain: 'contest', label: 'Contest', actions: ['contest.created', 'contest.published', 'contest.cancelled', 'contest.results_declared'] },
  { domain: 'participant', label: 'Participant', actions: ['participant.disqualified'] },
  { domain: 'payment', label: 'Payment', actions: ['payment.captured', 'payment.duplicate_captured', 'payment.manually_verified'] },
  { domain: 'payout', label: 'Payout', actions: ['payout.route_transfer_processed'] },
  { domain: 'submission', label: 'Submission', actions: ['submission.submitted', 'submission.evaluated', 'submission.invalidated', 'submission.recovered'] },
  { domain: 'certificate', label: 'Certificate', actions: ['certificate.issue_triggered', 'certificate.generated', 'certificate.failed'] },
  { domain: 'question', label: 'Question', actions: ['question.bulk_imported'] },
  { domain: 'message', label: 'Message', actions: ['message.sent', 'message.retried', 'message.failed'] },
  {
    domain: 'gradebook',
    label: 'Gradebook',
    actions: [
      'gradebook.category_created', 'gradebook.category_updated',
      'gradebook.term_created', 'gradebook.term_updated', 'gradebook.term_deleted',
      'gradebook.settings_updated', 'gradebook.excused', 'gradebook.override_cleared', 'gradebook.marksheets_generated', 'gradebook.marksheets_declared', 'gradebook.marksheets_withdrawn',
    ],
  },
  { domain: 'system', label: 'System', actions: ['system.contest_reconciliation_fired', 'system.job_retries_exhausted'] },
];

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** "Org Suspended" style label for the Action dropdown, given the already-chosen domain. */
export function subActionLabel(domain: string, action: string): string {
  return titleCase(action.slice(domain.length + 1).replace(/\./g, ' '));
}

/** Known catalogue ∪ actions the server has really seen. Unknown domains get a generated label. */
export function mergeActionGroups(known: AuditActionGroup[], observed: string[] = []): AuditActionGroup[] {
  const groups = new Map(known.map((g) => [g.domain, { ...g, actions: [...g.actions] }]));
  for (const action of observed) {
    const dot = action.indexOf('.');
    if (dot < 1) continue;
    const domain = action.slice(0, dot);
    const group = groups.get(domain) ?? { domain, label: titleCase(domain), actions: [] };
    if (!group.actions.includes(action)) group.actions.push(action);
    groups.set(domain, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}
