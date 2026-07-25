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
  SUBSCRIPTION_PAST_DUE: (p) => ({
    campaignName: 'ops_subscription_past_due',
    templateParams: [p.adminName, p.planName],
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
};

export function getWhatsAppTemplate(template: OpsMessageTemplate, params: Record<string, any>): RenderedWhatsApp {
  const builder = WHATSAPP_TEMPLATES[template];
  if (!builder) throw new Error(`WhatsApp template not implemented: ${template}`);
  return builder(params ?? {});
}
