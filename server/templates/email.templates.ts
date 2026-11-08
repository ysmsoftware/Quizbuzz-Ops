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
    subject: `Your QuizBuzz receipt${p.receiptNumber ? ` ${p.receiptNumber}` : ''}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p style="font-size:20px;font-weight:700;margin:16px 0 4px;">₹${escape(Number(p.amount).toFixed(2))}</p>
      <p style="color:#666;margin:0 0 16px;">Paid${p.paidAt ? ` on ${escape(p.paidAt)}` : ''} for ${escape(p.planName)}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        ${p.creditApplied && Number(p.creditApplied) > 0 ? `
        <tr><td style="padding:4px 0;">Plan price</td><td style="text-align:right;">₹${escape((Number(p.baseAmount) + Number(p.creditApplied)).toFixed(2))}</td></tr>
        <tr><td style="padding:4px 0;">Credit for unused time</td><td style="text-align:right;">−₹${escape(Number(p.creditApplied).toFixed(2))}</td></tr>
        ` : ''}
        <tr><td style="padding:4px 0;">Total excluding tax</td><td style="text-align:right;">₹${escape(Number(p.baseAmount).toFixed(2))}</td></tr>
        ${Number(p.gatewayFeeAmount) > 0 ? `<tr><td style="padding:4px 0;">Payment gateway fee</td><td style="text-align:right;">₹${escape(Number(p.gatewayFeeAmount).toFixed(2))}</td></tr>` : ''}
        <tr><td style="padding:4px 0;">${Number(p.gatewayFeeAmount) > 0 ? 'GST on gateway fee' : 'GST'}</td><td style="text-align:right;">₹${escape(Number(p.gstAmount).toFixed(2))}</td></tr>
        ${Number(p.tdsAmount) > 0 ? `<tr><td style="padding:4px 0;">TDS deducted by you</td><td style="text-align:right;">−₹${escape(Number(p.tdsAmount).toFixed(2))}</td></tr>` : ''}
        <tr style="border-top:1px solid #eee;font-weight:700;"><td style="padding:8px 0 0;">Amount paid</td><td style="text-align:right;padding:8px 0 0;">₹${escape(Number(p.amount).toFixed(2))}</td></tr>
      </table>
      ${p.invoiceNumber ? `<p style="color:#666;font-size:12px;margin:0;">Invoice number: ${escape(p.invoiceNumber)}</p>` : ''}
      ${p.receiptNumber ? `<p style="color:#666;font-size:12px;margin:0;">Receipt number: ${escape(p.receiptNumber)}</p>` : ''}
      <p style="color:#666;font-size:12px;margin:0 0 16px;">Payment reference: ${escape(p.razorpayPaymentId || p.paymentId || '—')}</p>
      <p>Your invoice and receipt are attached. You can also download them from your billing page.</p>
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
  INVOICE_ISSUED: (p) => ({
    subject: `Invoice ${p.invoiceNumber} from QuizBuzz: please pay by ${p.dueDate}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Here's your invoice <strong>${escape(p.invoiceNumber)}</strong> for ${escape(p.description)}.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:4px 0;">Amount</td><td style="text-align:right;">₹${escape(Number(p.subtotal).toFixed(2))}</td></tr>
        <tr><td style="padding:4px 0;">GST</td><td style="text-align:right;">₹${escape(Number(p.gstAmount).toFixed(2))}</td></tr>
        <tr style="border-top:1px solid #eee;font-weight:700;"><td style="padding:8px 0 0;">Total due by ${escape(p.dueDate)}</td><td style="text-align:right;padding:8px 0 0;">₹${escape(Number(p.total).toFixed(2))}</td></tr>
      </table>
      ${p.payLink ? `<p><a href="${escape(p.payLink)}">Pay online</a></p>` : ''}
      ${p.bank?.number ? `<p>Pay by bank transfer to ${escape(p.bank.account)}, ${escape(p.bank.name)}, account ${escape(p.bank.number)}, IFSC ${escape(p.bank.ifsc)}${p.bank.upi ? `, or UPI ${escape(p.bank.upi)}` : ''}. Please quote ${escape(p.invoiceNumber)} as the reference, and send us the transaction number.</p>` : ''}
    `),
  }),
  INVOICE_REMINDER: (p) => ({
    subject: Number(p.daysLeft) < 0 ? `Invoice ${p.invoiceNumber} is overdue` : `Invoice ${p.invoiceNumber} is due on ${p.dueDate}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>₹${escape(Number(p.balance).toFixed(2))} is ${Number(p.daysLeft) < 0 ? 'overdue' : 'due'} on invoice <strong>${escape(p.invoiceNumber)}</strong> for ${escape(p.description)}. The due date ${Number(p.daysLeft) < 0 ? 'was' : 'is'} ${escape(p.dueDate)}.</p>
      ${p.payLink ? `<p><a href="${escape(p.payLink)}">Pay online</a></p>` : ''}
      <p>If you've already paid, please reply with the transaction number so we can record it.</p>
    `),
  }),
  CONTRACT_ENDING: (p) => ({
    subject: `Your QuizBuzz contract ends on ${p.contractEnd}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> contract ends on ${escape(p.contractEnd)}, in ${escape(p.daysLeft)} days. Please talk to your QuizBuzz contact to renew it.</p>
    `),
  }),
  CREDIT_NOTE_ISSUED: (p) => ({
    subject: `Credit note ${p.creditNoteNumber} for invoice ${p.invoiceNumber}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>We've issued credit note <strong>${escape(p.creditNoteNumber)}</strong> for ₹${escape(Number(p.amount).toFixed(2))} against invoice ${escape(p.invoiceNumber)}.</p>
      <p>Reason: ${escape(p.reason)}</p>
      ${p.refundLine ? `<p>${escape(p.refundLine)}</p>` : ''}
      <p>The credit note is attached and is also on your Billing page.</p>
    `),
  }),
  SUBSCRIPTION_CHANGE_SCHEDULED: (p) => ({
    subject: `Your plan changes to ${p.toPlan} on ${p.on}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>You stay on <strong>${escape(p.fromPlan)}</strong> until ${escape(p.on)}. From then your plan is <strong>${escape(p.toPlan)}</strong>, billed ${escape(p.cycle)} at a time.</p>
      ${p.needsNewMandate ? '<p>Your automatic payment is set for your current plan. To renew automatically at the new price, turn on automatic renewal again from your Billing page.</p>' : ''}
      <p>Changed your mind? You can keep your current plan from the Billing page until then.</p>
    `),
  }),
  SUBSCRIPTION_PAST_DUE: (p) => ({
    subject: `Renew your ${p.planName} plan by ${p.restrictAt}`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> plan's paid period ended on ${escape(p.currentPeriodEnd)}. Everything keeps working until ${escape(p.restrictAt)}.</p>
      <p>Renew from your billing page to avoid any interruption.</p>
    `),
  }),
  SUBSCRIPTION_RESTRICTED: (p) => ({
    subject: `Your ${p.planName} plan is restricted`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> plan hasn't been renewed, so you can't create or publish anything new right now. Contests already scheduled or running aren't affected, and results and certificates still work.</p>
      <p>Renew from your billing page to continue straight away. If you don't renew by ${escape(p.downgradeAt)}, your organization moves to Free plan limits. Your data is kept.</p>
    `),
  }),
  SUBSCRIPTION_EXPIRED: (p) => ({
    subject: `Your ${p.planName} subscription has expired`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>Your <strong>${escape(p.planName)}</strong> subscription ended on ${escape(p.currentPeriodEnd)}, so your organization is now on Free plan limits. All your data is kept.</p>
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
      <p>Until the suspension is lifted, your team can't sign in or use the dashboard (they will see a &quot;suspended&quot; message), and public registration and joining for your contests are paused.</p>
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
  ORG_CREATED: (p) => ({
    subject: `Your organization ${escape(p.organizationName)} is ready on QuizBuzz`,
    html: wrap(`
      <p>Hi ${escape(p.adminName)},</p>
      <p>The organization <strong>${escape(p.organizationName)}</strong> has been created for you on QuizBuzz.</p>
      ${
        p.newAccount
          ? `<p>An account was created for <strong>${escape(p.ownerEmail)}</strong> with no password yet. Open <a href="${escape(p.forgotPasswordUrl)}">the password reset page</a>, enter this email address and set your own password, then sign in.</p>`
          : `<p>Sign in with your existing account at <a href="${escape(p.loginUrl)}">${escape(p.loginUrl)}</a> and switch to the new organization from the organization menu.</p>`
      }
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
