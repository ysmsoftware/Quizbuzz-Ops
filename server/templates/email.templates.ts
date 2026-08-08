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
  BILLING_RECEIPT: (p) => ({
    subject: `Your receipt — ${p.planName} (${p.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'})`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Here's your receipt for the <strong>${escape(p.planName)}</strong> plan${p.paidAt ? `, paid on ${escape(p.paidAt)}` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        ${p.creditApplied && Number(p.creditApplied) > 0 ? `
        <tr><td style="padding:4px 0;">Plan price (${escape(p.billingCycle === 'ANNUAL' ? 'annual' : 'monthly')})</td><td style="text-align:right;">₹${escape((Number(p.baseAmount) + Number(p.creditApplied)).toFixed(2))}</td></tr>
        <tr><td style="padding:4px 0;">Credit for unused time</td><td style="text-align:right;">−₹${escape(Number(p.creditApplied).toFixed(2))}</td></tr>
        ` : ''}
        <tr><td style="padding:4px 0;">Subscription</td><td style="text-align:right;">₹${escape(Number(p.baseAmount).toFixed(2))}</td></tr>
        <tr><td style="padding:4px 0;">Payment gateway fee</td><td style="text-align:right;">₹${escape(Number(p.gatewayFeeAmount).toFixed(2))}</td></tr>
        <tr><td style="padding:4px 0;">GST on gateway fee</td><td style="text-align:right;">₹${escape(Number(p.gstAmount).toFixed(2))}</td></tr>
        <tr style="border-top:1px solid #eee;font-weight:700;"><td style="padding:8px 0 0;">Total paid</td><td style="text-align:right;padding:8px 0 0;">₹${escape(Number(p.amount).toFixed(2))}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;">Payment reference: ${escape(p.razorpayPaymentId || p.paymentId || '—')}</p>
      <p>Keep this email for your records. You can request this receipt again at any time from your billing page.</p>
    `),
  }),
  SUBSCRIPTION_RENEWAL_REMINDER: (p) => ({
    subject: `Your ${p.planName} plan expires in ${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> subscription is valid through <strong>${escape(p.currentPeriodEnd)}</strong> — that's ${escape(p.daysRemaining)} day${p.daysRemaining === 1 ? '' : 's'} from now.</p>
      <p>This plan doesn't auto-renew — you'll need to return to your billing page and pay again to keep your current plan and limits active without interruption.</p>
    `),
  }),
  SUBSCRIPTION_EXPIRED: (p) => ({
    subject: `Your ${p.planName} subscription has expired`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> subscription period ended on ${escape(p.currentPeriodEnd)}.</p>
      <p>Visit your billing page to renew and restore your plan's limits.</p>
    `),
  }),
  SUBSCRIPTION_LIMIT_INCREASED: (p) => ({
    subject: `Your ${escape(p.fieldLabel)} limit has increased`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.fieldLabel)}</strong> limit has been increased${p.newValue != null ? ` to <strong>${escape(p.newValue)}</strong>` : ''} on top of your ${escape(p.planName)} plan.</p>
      ${p.reason ? `<p>Reason: ${escape(p.reason)}</p>` : ''}
      ${p.expiresAt ? `<p>This increase is temporary and reverts on ${escape(p.expiresAt)}.</p>` : ''}
    `),
  }),
  SUBSCRIPTION_LIMIT_DECREASED: (p) => ({
    subject: `Your ${escape(p.fieldLabel)} limit has changed`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>A temporary increase to your <strong>${escape(p.fieldLabel)}</strong> limit has ended${p.wasExpiry ? ' (its scheduled expiry was reached)' : ''}. Your ${escape(p.planName)} plan's normal limit now applies.</p>
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
