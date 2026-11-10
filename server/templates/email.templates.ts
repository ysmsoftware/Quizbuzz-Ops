import { OpsMessageTemplate } from '@prisma/client';
import {
  renderEmailLayout,
  emailButton,
  otpBox,
  linkFallback,
  infoTable,
  calloutBox,
  fileChip,
  billingUrl,
  P,
  SMALL,
  COLORS,
  FONT,
} from './email-layout';

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
 *
 * The footer is fixed (see email-layout.ts). Whatever differs per email goes at the end of the body
 * in a SMALL paragraph.
 */
const EMAIL_TEMPLATES: Record<OpsMessageTemplate, EmailTemplateBuilder> = {
  BILLING_PAYMENT_SUCCESS: (p) => ({
    subject: `Payment received — ${p.planName}`,
    html: email(`Payment received for ${p.planName}`, 'Payment received', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">We've received your payment of <strong>₹${escape(p.amount)}</strong> for the <strong>${escape(p.planName)}</strong> plan. Thank you for staying with QuizBuzz.</p>
      ${emailButton('View billing', billingUrl())}
    `),
  }),
  BILLING_PAYMENT_FAILED: (p) => ({
    subject: `Payment failed — ${p.planName}`,
    html: email(`Your payment for ${p.planName} didn't go through`, "Your payment didn't go through", `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your payment of <strong>₹${escape(p.amount)}</strong> for the <strong>${escape(p.planName)}</strong> plan did not go through.</p>
      ${p.reason ? calloutBox(escape(p.reason), 'warning') : ''}
      ${emailButton('Retry payment', billingUrl())}
      <p style="${SMALL}">Retry from your billing page to avoid any interruption to your subscription.</p>
    `),
  }),
  BILLING_RECEIPT: (p) => {
    const credit = Number(p.creditApplied) > 0;
    const gatewayFee = Number(p.gatewayFeeAmount) > 0;
    return {
      subject: `Your QuizBuzz receipt${p.receiptNumber ? ` ${p.receiptNumber}` : ''}`,
      html: email(`Receipt for ₹${inr(p.amount)}`, undefined, `
        <p style="${P}">Hi ${escape(p.adminName)},</p>
        ${bigAmount(`₹${inr(p.amount)}`, `Paid${p.paidAt ? ` on ${escape(p.paidAt)}` : ''} for ${escape(p.planName)}`, p.receiptNumber ? `Receipt ${escape(p.receiptNumber)}` : undefined)}
        ${infoTable([
          ...(credit ? [
            { label: 'Plan price', value: `₹${inr(Number(p.baseAmount) + Number(p.creditApplied))}` },
            { label: 'Credit for unused time', value: `−₹${inr(p.creditApplied)}` },
          ] : []),
          { label: 'Total excluding tax', value: `₹${inr(p.baseAmount)}` },
          ...(gatewayFee ? [{ label: 'Payment gateway fee', value: `₹${inr(p.gatewayFeeAmount)}` }] : []),
          { label: gatewayFee ? 'GST on gateway fee' : 'GST', value: `₹${inr(p.gstAmount)}` },
          ...(Number(p.tdsAmount) > 0 ? [{ label: 'TDS deducted by you', value: `−₹${inr(p.tdsAmount)}` }] : []),
          { label: 'Amount paid', value: `₹${inr(p.amount)}`, strong: true },
          ...(p.invoiceNumber ? [{ label: 'Invoice', value: escape(p.invoiceNumber) }] : []),
          { label: 'Payment reference', value: escape(p.razorpayPaymentId || p.paymentId || '—') },
        ])}
        <p style="${SMALL}margin-bottom:6px;">Attached</p>
        <div>${fileChip('Invoice.pdf')}${fileChip('Receipt.pdf')}</div>
        ${emailButton('View billing', billingUrl())}
        <p style="${SMALL}">You can also download your invoice and receipt from your billing page.</p>
      `),
    };
  },
  SUBSCRIPTION_RENEWAL_REMINDER: (p) => ({
    subject: `Your ${p.planName} plan expires in ${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}`,
    html: email(`Your ${p.planName} plan expires in ${p.daysRemaining} days`, `Your plan expires in ${p.daysRemaining} day${p.daysRemaining === 1 ? '' : 's'}`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your <strong>${escape(p.planName)}</strong> subscription is valid through <strong>${escape(p.currentPeriodEnd)}</strong>.</p>
      ${emailButton('Renew your plan', billingUrl())}
      <p style="${SMALL}">This plan doesn't renew automatically. Pay again from your billing page to keep your current plan and limits without interruption.</p>
    `),
  }),
  INVOICE_ISSUED: (p) => ({
    subject: `Invoice ${p.invoiceNumber} from QuizBuzz: please pay by ${p.dueDate}`,
    html: email(`Invoice ${p.invoiceNumber}: please pay by ${p.dueDate}`, `Invoice ${escape(p.invoiceNumber)} is due on ${escape(p.dueDate)}`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Here's your invoice for ${escape(p.description)}.</p>
      ${infoTable([
        { label: 'Amount', value: `₹${inr(p.subtotal)}` },
        { label: 'GST', value: `₹${inr(p.gstAmount)}` },
        { label: `Total due by ${escape(p.dueDate)}`, value: `₹${inr(p.total)}`, strong: true },
      ])}
      ${p.payOnline ? emailButton(`Pay ₹${inr(p.total)}`, billingUrl()) : contactUs()}
      <p style="${SMALL}">Problem with this payment? Contact us using the details below.</p>
    `),
  }),
  INVOICE_REMINDER: (p) => {
    const overdue = Number(p.daysLeft) < 0;
    return {
      subject: overdue ? `Invoice ${p.invoiceNumber} is overdue` : `Invoice ${p.invoiceNumber} is due on ${p.dueDate}`,
      html: email(`Invoice ${p.invoiceNumber} is ${overdue ? 'overdue' : 'due soon'}`, overdue ? `Invoice ${escape(p.invoiceNumber)} is overdue` : `Invoice ${escape(p.invoiceNumber)} is due on ${escape(p.dueDate)}`, `
        <p style="${P}">Hi ${escape(p.adminName)},</p>
        <p style="${P}">${overdue
          ? `Your payment of <strong>₹${inr(p.balance)}</strong> for ${escape(p.description)} was due on ${escape(p.dueDate)}. Please complete it to continue your services without interruption.`
          : `<strong>₹${inr(p.balance)}</strong> is due on ${escape(p.dueDate)} for ${escape(p.description)}.`}</p>
        ${p.payOnline ? emailButton(`Pay ₹${inr(p.balance)}`, billingUrl()) : contactUs()}
        <p style="${SMALL}">Problem with this payment? Contact us using the details below.</p>
      `),
    };
  },
  CONTRACT_ENDING: (p) => ({
    subject: `Your QuizBuzz contract ends on ${p.contractEnd}`,
    html: email(`Your contract ends on ${p.contractEnd}`, `Your contract ends on ${escape(p.contractEnd)}`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your <strong>${escape(p.planName)}</strong> contract ends in ${escape(p.daysLeft)} days. Talk to your QuizBuzz contact to renew it.</p>
    `),
  }),
  CREDIT_NOTE_ISSUED: (p) => ({
    subject: `Credit note ${p.creditNoteNumber} for invoice ${p.invoiceNumber}`,
    html: email(`Credit note ${p.creditNoteNumber} issued`, undefined, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      ${bigAmount(`₹${inr(p.amount)}`, `Against invoice ${escape(p.invoiceNumber)}`, `Credit note ${escape(p.creditNoteNumber)}`)}
      ${infoTable([
        { label: 'Reason', value: escape(p.reason) },
        ...(p.refundLine ? [{ label: 'Refund', value: escape(p.refundLine) }] : []),
      ])}
      <p style="${SMALL}margin-bottom:6px;">Attached</p>
      <div>${fileChip('CreditNote.pdf')}</div>
      ${emailButton('View billing', billingUrl())}
    `),
  }),
  SUBSCRIPTION_CHANGE_SCHEDULED: (p) => ({
    subject: `Your plan changes to ${p.toPlan} on ${p.on}`,
    html: email(`Your plan changes to ${p.toPlan} on ${p.on}`, `Your plan changes on ${escape(p.on)}`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">You keep everything you paid for until then.</p>
      ${infoTable([
        { label: 'Until ' + escape(p.on), value: escape(p.fromPlan) },
        { label: 'From ' + escape(p.on), value: `${escape(p.toPlan)}, billed ${escape(p.cycle)}`, strong: true },
      ])}
      ${emailButton('Open billing', billingUrl())}
      ${p.needsNewMandate ? `<p style="${P}">Your automatic payment is set for your current plan. To renew automatically at the new price, turn on automatic renewal again from your billing page.</p>` : ''}
      <p style="${SMALL}">Changed your mind? You can keep your current plan from the billing page until ${escape(p.on)}.</p>
    `),
  }),
  SUBSCRIPTION_PAST_DUE: (p) => ({
    subject: `Renew your ${p.planName} plan by ${p.restrictAt}`,
    html: email(`Renew your ${p.planName} plan by ${p.restrictAt}`, `Renew your plan by ${escape(p.restrictAt)}`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your <strong>${escape(p.planName)}</strong> plan's paid period ended on ${escape(p.currentPeriodEnd)}. Everything keeps working until ${escape(p.restrictAt)}.</p>
      ${emailButton('Renew now', billingUrl())}
    `),
  }),
  SUBSCRIPTION_RESTRICTED: (p) => ({
    subject: `Your ${p.planName} plan is restricted`,
    html: email(`Your ${p.planName} plan is restricted`, `Your ${escape(p.planName)} plan is restricted`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your plan hasn't been renewed, so you can't create or publish anything new right now. Contests already scheduled or running aren't affected, and results and certificates still work.</p>
      ${emailButton('Renew now', billingUrl())}
      <p style="${SMALL}">If you don't renew by ${escape(p.downgradeAt)}, your organization moves to Free plan limits. Your data is always kept.</p>
    `),
  }),
  SUBSCRIPTION_EXPIRED: (p) => ({
    subject: `Your ${p.planName} subscription has expired`,
    html: email(`Your ${p.planName} subscription has expired`, `Your ${escape(p.planName)} subscription has expired`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your subscription ended on ${escape(p.currentPeriodEnd)}, so your organization is now on Free plan limits.</p>
      ${emailButton('Renew your plan', billingUrl())}
      <p style="${SMALL}">Renewing restores your plan's limits straight away. All your data is kept.</p>
    `),
  }),
  SUBSCRIPTION_LIMIT_INCREASED: (p) => ({
    subject: `Your ${p.fieldLabel} limit has increased`,
    html: email(`Your ${p.fieldLabel} limit has increased`, `Your ${escape(p.fieldLabel)} limit has increased`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      ${infoTable([
        { label: 'Limit', value: escape(p.fieldLabel) },
        ...(p.newValue != null ? [{ label: 'New value', value: escape(p.newValue), strong: true }] : []),
        { label: 'On top of', value: `${escape(p.planName)} plan` },
        ...(p.reason ? [{ label: 'Reason', value: escape(p.reason) }] : []),
        ...(p.expiresAt ? [{ label: 'Reverts on', value: escape(p.expiresAt) }] : []),
      ])}
    `),
  }),
  SUBSCRIPTION_LIMIT_DECREASED: (p) => ({
    subject: `Your ${p.fieldLabel} limit has changed`,
    html: email(`Your ${p.fieldLabel} limit has changed`, `Your ${escape(p.fieldLabel)} limit has changed`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">A temporary increase to your <strong>${escape(p.fieldLabel)}</strong> limit has ended${p.wasExpiry ? ' (its scheduled expiry was reached)' : ''}. Your ${escape(p.planName)} plan's normal limit now applies.</p>
    `),
  }),
  SUBSCRIPTION_CANCELLED: (p) => ({
    subject: `Your subscription has been cancelled`,
    html: email('Your subscription has been cancelled', 'Your subscription has been cancelled', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your <strong>${escape(p.planName)}</strong> subscription has been cancelled${p.effectiveDate ? ` effective ${escape(p.effectiveDate)}` : ''}.</p>
    `),
  }),
  SUBSCRIPTION_PLAN_CHANGED: (p) => ({
    subject: `Your plan has changed`,
    html: email('Your plan has changed', 'Your plan has changed', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      ${infoTable([
        { label: 'Before', value: escape(p.fromPlan) },
        { label: 'Now', value: escape(p.toPlan), strong: true },
      ])}
    `),
  }),
  PAYOUT_ACCOUNT_LINKED: (p) => ({
    subject: `Your payout account is now active`,
    html: email('Your payout account is active', 'Your payout account is now active', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your organization's Razorpay payout account has been linked and is now active. Contest fee payouts will begin processing automatically.</p>
    `),
  }),
  PAYOUT_ACCOUNT_STATUS_CHANGED: (p) => ({
    subject: `Payout account status update`,
    html: email('Your payout account status changed', 'Payout account status update', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your payout account status changed to <strong>${escape(p.status)}</strong>.</p>
      ${p.reason ? calloutBox(escape(p.reason), 'info') : ''}
    `),
  }),
  ORG_SUSPENDED: (p) => ({
    subject: `Your organization has been suspended`,
    html: email('Your organization has been suspended', 'Your organization has been suspended', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      ${calloutBox(`<strong>Reason:</strong> ${escape(p.reason || 'not specified')}`, 'danger')}
      <p style="${P}">Until the suspension is lifted, your team can't sign in or use the dashboard, and public registration and joining for your contests are paused.</p>
      <p style="${SMALL}">Contact support if you believe this is a mistake.</p>
    `),
  }),
  ORG_REACTIVATED: (p) => ({
    subject: `Your organization has been reactivated`,
    html: email('Your organization has been reactivated', 'Your organization has been reactivated', `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">Your organization has been reactivated and all features are available again.</p>
    `),
  }),
  ORG_CREATED: (p) => ({
    subject: `Your organization ${p.organizationName} is ready on QuizBuzz`,
    html: email(`${p.organizationName} is ready on QuizBuzz`, `${escape(p.organizationName)} is ready on QuizBuzz`, `
      <p style="${P}">Hi ${escape(p.adminName)},</p>
      <p style="${P}">We've created the organization <strong>${escape(p.organizationName)}</strong> for you.</p>
      ${
        p.newAccount
          ? `<p style="${P}">An account was created for <strong>${escape(p.ownerEmail)}</strong> with no password yet. Set your own password to sign in for the first time.</p>
             ${emailButton('Set your password', escape(p.forgotPasswordUrl))}
             ${linkFallback(escape(p.forgotPasswordUrl))}`
          : `<p style="${P}">Sign in with your existing account, then switch to the new organization from the organization menu.</p>
             ${emailButton('Sign in', escape(p.loginUrl))}
             ${linkFallback(escape(p.loginUrl))}`
      }
    `),
  }),
  CUSTOM: (p) => ({
    subject: p.subject || 'Notification from QuizBuzz',
    html: email(p.subject || 'Notification from QuizBuzz', p.subject ? escape(p.subject) : undefined, `<p style="${P}">${escape(p.body || '')}</p>`),
  }),
  PLATFORM_ADMIN_OTP: (p) => ({
    subject: `${p.otpCode} is your QuizBuzz Ops verification code`,
    html: email(`Your verification code is ${p.otpCode}`, 'Your verification code', `
      <p style="${P}">Hi ${escape(p.firstName || 'there')},</p>
      <p style="${P}">Use this code to sign in to QuizBuzz Ops. It expires in ${escape(p.expiryMinutes)} minute${p.expiryMinutes === 1 ? '' : 's'}.</p>
      ${otpBox(escape(p.otpCode))}
      <p style="${SMALL}">Didn't ask for this? Ignore this email. Nobody can sign in without the code.</p>
    `),
  }),
};

export function getEmailTemplate(template: OpsMessageTemplate, params: Record<string, any>): RenderedEmail {
  const builder = EMAIL_TEMPLATES[template];
  if (!builder) throw new Error(`Email template not implemented: ${template}`);
  return builder(params ?? {});
}

function email(preheader: string, heading: string | undefined, bodyHtml: string): string {
  return renderEmailLayout({ preheader: escape(preheader), heading, bodyHtml });
}

/** The figure an email is about (a payment, a credit), large, with a line of context above and below. */
function bigAmount(amount: string, context: string, label?: string): string {
  return `
    ${label ? `<p style="${SMALL}margin:0;">${label}</p>` : ''}
    <p style="margin:2px 0;font-family:${FONT};font-size:32px;font-weight:700;line-height:1.2;color:${COLORS.text};">${amount}</p>
    <p style="${SMALL}font-size:13px;margin-bottom:10px;">${context}</p>`;
}

/** For an invoice paid by direct transfer: we never email bank details, so the next step is a conversation. */
function contactUs(): string {
  return `<p style="${P}">This invoice is paid by direct transfer. Please contact us to arrange it, or wait for us to reach out. You'll find our number below.</p>`;
}

/** Rupees the Indian way: 2,95,000.00. */
function inr(value: unknown): string {
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
