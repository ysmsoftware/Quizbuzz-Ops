import { formatInr } from '@/lib/format';

interface DescribableEntry {
  action: string;
  targetType: string;
  targetLabel: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * One-line, human description of an ops audit-log entry. The single place that knows how to
 * word each action the server writes (see writeAuditLogEntry call sites under server/);
 * the Overview feed and the Audit Log table both use it. Unknown actions fall back to a
 * generic line, so a new action is never blank — it just reads less nicely until added here.
 */
export function describeAuditEntry(log: DescribableEntry): string {
  // Metadata is free-form JSON written by many call sites; read it loosely.
  const m = (log.metadata ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = log.targetLabel;
  switch (log.action) {
    case 'org.created':
      return `Created organization "${t}" for ${m.ownerEmail ?? 'a new owner'}`;
    case 'org.updated':
      return `Updated profile details for organization "${t}"`;
    case 'org.suspended':
      return `Suspended organization "${t}" due to: ${m.reason || 'No reason provided'}`;
    case 'org.reactivated':
      return `Reactivated organization "${t}"`;
    case 'org.deleted':
      return `Deleted organization "${t}" (soft delete): ${m.reason || 'No reason provided'}`;
    case 'org.restored':
      return `Restored organization "${t}"${m.restoredTo ? ` (now ${String(m.restoredTo).toLowerCase()})` : ''}`;
    case 'org.note_added':
      return `Added operational support note to organization "${t}"`;
    case 'org.message_sent':
      return `Sent a message to organization "${t}"`;
    case 'org.message_retried':
      return `Retried a message to organization "${t}"`;
    case 'org.payout_account_linked':
      return `Linked Razorpay account ${m.razorpayLinkedAccountId || ''} for organization "${t}"`;
    case 'org.payout_account_status_changed':
      return `Changed payout account status for "${t}" from ${m.from || 'N/A'} to ${m.to || 'N/A'}${m.reason ? `: ${m.reason}` : ''}`;
    case 'org.payout_transfer_retry_requested':
      return `Requested a payout transfer retry for "${t}"`;
    case 'plan.created':
      return `Created new subscription plan "${t}"`;
    case 'plan.updated':
      return `Updated features or limits for plan "${t}"`;
    case 'plan.deactivated':
      return `Deactivated subscription plan "${t}"`;
    case 'subscription.created':
      return `Assigned plan "${t}" to ${m.organizationId ?? 'an organization'}`;
    case 'subscription.plan_changed':
      return `Changed subscription plan for "${t}" from ${m.fromPlanId || m.oldPlanId || 'N/A'} to ${m.toPlanId || m.newPlanId || 'N/A'}`;
    case 'subscription.expired':
      return `Subscription "${t}" expired`;
    case 'subscription.renewal_reminder_resent':
      return `Re-sent the renewal reminder for "${t}"`;
    case 'subscription.cache_sync_failed':
      return `Could not sync plan limits to the main app for "${t}"`;
    case 'override.added':
      return `Added subscription override for "${t}" (${m.field}: ${m.value})`;
    case 'override.removed':
      return `Removed subscription override for "${t}" (${m.field})`;
    case 'override.expired':
      return `Subscription override for "${t}" expired automatically`;
    case 'feature_flag.toggled':
      return `Turned feature flag "${t}" ${m.to ? 'ON' : 'OFF'} globally`;
    case 'feature_flag.org_override.set':
      return `${m.isEnabled ? 'Granted' : 'Disabled'} feature "${t}" for organization ${m.organizationId ?? ''}${m.expiresAt ? ` until ${String(m.expiresAt).slice(0, 10)}` : ''}${m.reason ? ` — ${m.reason}` : ''}`;
    case 'feature_flag.sync_repaired':
      return `Re-synced feature flag "${t}" to the main app${m.leftoverGrants?.count ? ` (${m.leftoverGrants.count} main-only grant(s): ${m.leftoverGrants.handling})` : ''}`;
    case 'feature_flag.org_override.removed':
      return `Removed the "${t}" override for organization ${m.organizationId ?? ''}`;
    case 'payment.refunded':
      return `Issued refund of ${formatInr(Number(m.amount) || 0)} for participant ${m.participantName || ''} on contest "${t}"`;
    case 'booking.created':
      return `Created contest booking "${t}"`;
    case 'booking.status_changed':
      return `Updated booking status for "${t}"`;
    case 'pricing_config.updated':
      return 'Updated contest booking pricing configuration';
    case 'admin.logged_in':
      return 'Administrator signed in';
    case 'admin.logged_out':
      return 'Administrator signed out';
    case 'admin.otp_generated':
      return 'Sign-in verification code issued';
    case 'ambassador_type.created':
    case 'ambassador_type.updated':
    case 'ambassador_type.deleted':
      return `${capitalize(log.action.split('.')[1])} ambassador type "${t}"`;
    case 'college.created':
    case 'college.updated':
    case 'college.deleted':
    case 'department.created':
    case 'department.updated':
      return `${capitalize(log.action.split('.')[1])} ${log.action.split('.')[0]} "${t}"`;
    case 'app_settings.logo_updated':
      return 'Updated the application logo';
    case 'app_settings.logo_removed':
      return 'Removed the application logo';
    default:
      return `Executed action "${log.action}" on ${log.targetType} "${t}"`;
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "org.payout_account_linked" → "ORG: PAYOUT ACCOUNT LINKED" */
export function formatActionName(action: string): string {
  return action.replace('.', ': ').replace(/[._]/g, ' ').toUpperCase();
}
