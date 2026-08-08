import { OpsMessageTemplate } from '@prisma/client';

export interface RenderedWhatsApp {
  /** Must match a pre-approved template name on the WhatsApp Business API account. */
  campaignName: string;
  templateParams: string[];
}

type WhatsAppTemplateBuilder = (params: Record<string, any>) => RenderedWhatsApp;

/**
 * WhatsApp template catalog — implemented in full even though the send
 * pipeline does not expose WHATSAPP as a selectable channel yet (see
 * MessagingService.enqueueMessage and messagingConfig.whatsapp.enabled).
 * Keeping this fleshed out means enabling WhatsApp later is a config flip,
 * not a coding project.
 */
const WHATSAPP_TEMPLATES: Record<OpsMessageTemplate, WhatsAppTemplateBuilder> = {
  BILLING_PAYMENT_SUCCESS: (p) => ({
    campaignName: 'ops_billing_payment_success',
    templateParams: [p.adminName, p.planName, String(p.amount)],
  }),
  BILLING_PAYMENT_FAILED: (p) => ({
    campaignName: 'ops_billing_payment_failed',
    templateParams: [p.adminName, p.planName, String(p.amount)],
  }),
  BILLING_RECEIPT: (p) => ({
    campaignName: 'ops_billing_receipt',
    templateParams: [p.adminName, p.planName, String(p.amount)],
  }),
  SUBSCRIPTION_RENEWAL_REMINDER: (p) => ({
    campaignName: 'ops_subscription_renewal_reminder',
    templateParams: [p.adminName, p.planName, String(p.daysRemaining)],
  }),
  SUBSCRIPTION_EXPIRED: (p) => ({
    campaignName: 'ops_subscription_expired',
    templateParams: [p.adminName, p.planName],
  }),
  SUBSCRIPTION_LIMIT_INCREASED: (p) => ({
    campaignName: 'ops_subscription_limit_increased',
    templateParams: [p.adminName, p.fieldLabel, String(p.newValue ?? '')],
  }),
  SUBSCRIPTION_LIMIT_DECREASED: (p) => ({
    campaignName: 'ops_subscription_limit_decreased',
    templateParams: [p.adminName, p.fieldLabel],
  }),
  SUBSCRIPTION_CANCELLED: (p) => ({
    campaignName: 'ops_subscription_cancelled',
    templateParams: [p.adminName, p.planName],
  }),
  SUBSCRIPTION_PLAN_CHANGED: (p) => ({
    campaignName: 'ops_subscription_plan_changed',
    templateParams: [p.adminName, p.fromPlan, p.toPlan],
  }),
  PAYOUT_ACCOUNT_LINKED: (p) => ({
    campaignName: 'ops_payout_account_linked',
    templateParams: [p.adminName],
  }),
  PAYOUT_ACCOUNT_STATUS_CHANGED: (p) => ({
    campaignName: 'ops_payout_account_status_changed',
    templateParams: [p.adminName, p.status],
  }),
  ORG_SUSPENDED: (p) => ({
    campaignName: 'ops_org_suspended',
    templateParams: [p.adminName, p.reason || 'not specified'],
  }),
  ORG_REACTIVATED: (p) => ({
    campaignName: 'ops_org_reactivated',
    templateParams: [p.adminName],
  }),
  CUSTOM: (p) => ({
    campaignName: 'ops_custom_broadcast',
    templateParams: [p.adminName, p.body || ''],
  }),
  // Not actually sent over WhatsApp today — platform-admin OTP goes out via
  // EmailProvider directly (see platform-auth.service.ts), bypassing this
  // channel-agnostic template pipeline entirely, because OTP delivery needs
  // to be synchronous and OpsMessageLog requires an organizationId that a
  // platform-admin login doesn't have. This entry exists only so the
  // Record<OpsMessageTemplate, ...> map stays exhaustive and the build
  // compiles; it becomes real the moment WhatsApp OTP delivery is wired up.
  PLATFORM_ADMIN_OTP: (p) => ({
    campaignName: 'ops_platform_admin_otp',
    templateParams: [p.firstName || '', String(p.otpCode || ''), String(p.expiryMinutes || '')],
  }),
};

export function getWhatsAppTemplate(template: OpsMessageTemplate, params: Record<string, any>): RenderedWhatsApp {
  const builder = WHATSAPP_TEMPLATES[template];
  if (!builder) throw new Error(`WhatsApp template not implemented: ${template}`);
  return builder(params ?? {});
}
