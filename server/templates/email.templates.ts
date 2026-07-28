import { OpsMessageTemplate } from '@prisma/client';

export interface RenderedEmail {
  subject: string;
  html: string;
}

type EmailTemplateBuilder = (params: Record<string, any>) => RenderedEmail;

/**
 * One builder per template. Adding a new template means adding one entry
 * here — nothing in the queue, worker, or provider layer changes. This is
 * the Open/Closed side of the messaging system: open for new templates,
 * closed for modification of the send pipeline itself.
 */
const EMAIL_TEMPLATES: Record<OpsMessageTemplate, EmailTemplateBuilder> = {
  BILLING_PAYMENT_SUCCESS: (p) => ({
    subject: `Payment received — ${p.planName}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>We've received your payment of ₹${escape(p.amount)} for the <strong>${escape(p.planName)}</strong> plan.</p>
      <p>Thank you for staying with QuizBuzz.</p>
    `),
  }),
  BILLING_PAYMENT_FAILED: (p) => ({
    subject: `Payment failed — ${p.planName}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your payment of ₹${escape(p.amount)} for the <strong>${escape(p.planName)}</strong> plan did not go through.</p>
      ${p.reason ? `<p>Reason: ${escape(p.reason)}</p>` : ''}
      <p>Please retry from your billing page to avoid any interruption to your subscription.</p>
    `),
  }),
  SUBSCRIPTION_PAST_DUE: (p) => ({
    subject: `Action needed: your ${p.planName} subscription is past due`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your subscription payment is past due. Please update billing to avoid service interruption.</p>
    `),
  }),
  SUBSCRIPTION_CANCELLED: (p) => ({
    subject: `Your subscription has been cancelled`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your ${escape(p.planName)} subscription has been cancelled${p.effectiveDate ? ` effective ${escape(p.effectiveDate)}` : ''}.</p>
    `),
  }),
  SUBSCRIPTION_PLAN_CHANGED: (p) => ({
    subject: `Your plan has changed`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your subscription has moved from <strong>${escape(p.fromPlan)}</strong> to <strong>${escape(p.toPlan)}</strong>.</p>
    `),
  }),
  PAYOUT_ACCOUNT_LINKED: (p) => ({
    subject: `Your payout account is now active`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your organization's Razorpay payout account has been linked and is now active. Contest fee payouts will begin processing automatically.</p>
    `),
  }),
  PAYOUT_ACCOUNT_STATUS_CHANGED: (p) => ({
    subject: `Payout account status update`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your payout account status changed to <strong>${escape(p.status)}</strong>.</p>
      ${p.reason ? `<p>Reason: ${escape(p.reason)}</p>` : ''}
    `),
  }),
  ORG_SUSPENDED: (p) => ({
    subject: `Your organization has been suspended`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your organization has been suspended. Reason: ${escape(p.reason || 'not specified')}.</p>
      <p>Contact support if you believe this is a mistake.</p>
    `),
  }),
  ORG_REACTIVATED: (p) => ({
    subject: `Your organization has been reactivated`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your organization has been reactivated and all features are available again.</p>
    `),
  }),
  CUSTOM: (p) => ({
    subject: p.subject || 'Notification from QuizBuzz',
    html: wrap(`<p>${escape(p.body || '')}</p>`),
  }),
  PLATFORM_ADMIN_OTP: (p) => ({
    subject: `${escape(p.otpCode)} is your QuizBuzz Ops verification code`,
    html: wrap(`
      <p>Hi ${escape(p.firstName || 'there')},</p>
      <p>Your verification code to sign in to QuizBuzz Ops is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${escape(p.otpCode)}</p>
      <p>This code expires in ${escape(p.expiryMinutes)} minute${p.expiryMinutes === 1 ? '' : 's'}. If you did not request this, you can safely ignore this email — nobody can access your account without it.</p>
    `),
  }),
};

export function getEmailTemplate(template: OpsMessageTemplate, params: Record<string, any>): RenderedEmail {
  const builder = EMAIL_TEMPLATES[template];
  if (!builder) throw new Error(`Email template not implemented: ${template}`);
  return builder(params ?? {});
}

function wrap(inner: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;">${inner}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" /><p style="color:#999;font-size:12px;">QuizBuzz Platform Ops</p></div>`;
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
