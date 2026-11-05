import { AuditTargetType, CollectionMethod, Invoice, OpsPayment, Prisma, PlatformAdminRole } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { AuditActor, writeAuditLogEntry } from '../../audit/audit-writer';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { generateUlid } from '../../utils/ulid';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { refreshSubscriptionStatus } from '../subscriptions/access-input';
import { computeInvoiceTotals, financialYear, round2, settledStatus, splitPayment } from './invoice-math';
import { forgetDocuments, invoiceDocument, receiptDocument } from './billing-documents';
import { cancelPaymentLink, createPaymentLink, extendPaymentLink } from './razorpay-links';
import { BillingSettingsInput, IssueInvoiceInput, RecordPaymentInput } from './invoices.validator';

type Tx = Prisma.TransactionClient;
type Buyer = { name: string; gstin: string | null; address: string | null; state: string | null; email: string | null };

const MONTHS: Record<string, number> = { MONTHLY: 1, HALF_YEARLY: 6, ANNUAL: 12 };
const n = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** End of that day in IST, so "due in 15 days" doesn't lapse at some odd hour. */
function endOfDayIst(date: Date): Date {
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(23, 59, 59, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000);
}

export class InvoicesService {
  private entitlements = new EntitlementsService();

  getSettings() {
    return prisma.billingSettings.findUnique({ where: { id: 'billing_default' } });
  }

  async saveSettings(input: BillingSettingsInput, actor: AuditActor) {
    const data = { ...input, sacCode: input.sacCode || null };
    const saved = await prisma.billingSettings.upsert({ where: { id: 'billing_default' }, update: data, create: { id: 'billing_default', ...data } });
    await writeAuditLogEntry(actor, 'billing_settings.updated', AuditTargetType.APP_SETTINGS, saved.id, 'Billing settings');
    return saved;
  }

  async list(q: { organizationId?: string; status?: Invoice['status']; overdue: boolean; page: number; limit: number }) {
    const where: Prisma.InvoiceWhereInput = {
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.overdue ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueAt: { lt: new Date() } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: q.overdue ? { dueAt: 'asc' } : { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { payments: { orderBy: { createdAt: 'asc' }, include: { proof: { select: { fileName: true } } } } },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { rows, total, page: q.page, limit: q.limit };
  }

  private async buyerOf(organizationId: string): Promise<Buyer> {
    const rows = await queryMainDb<{ name: string; gstNumber: string | null; billingAddress: string | null; state: string | null; primaryContactEmail: string | null }>(
      `SELECT o.name, p."gstNumber", p."billingAddress", p.state, p."primaryContactEmail"
         FROM organizations o LEFT JOIN organization_profiles p ON p."organizationId" = o.id
        WHERE o.id = $1`,
      [organizationId],
    );
    if (!rows[0]) throw new NotFoundError('Organization not found');
    const r = rows[0];
    return { name: r.name, gstin: r.gstNumber, address: r.billingAddress, state: r.state, email: r.primaryContactEmail };
  }

  private async nextNumber(tx: Tx, prefix: string, at: Date): Promise<string> {
    const fy = financialYear(at);
    const key = `${prefix}/${fy}`;
    const row = await tx.billingSequence.upsert({ where: { key }, create: { key, last: 1 }, update: { last: { increment: 1 } } });
    return `${prefix}/${fy}/${String(row.last).padStart(5, '0')}`;
  }

  async issue(organizationId: string, input: IssueInvoiceInput, actor: AuditActor) {
    if (input.collectionMethod === 'COMPLIMENTARY' && actor.role !== PlatformAdminRole.SUPER_ADMIN) {
      throw new ValidationError(null, 'Only a super admin can grant a complimentary plan.');
    }
    const settings = await this.getSettings();
    if (!settings) throw new ConflictError('Fill in Billing Settings first: invoices need your legal name, address and state.');

    const buyer = await this.buyerOf(organizationId);
    const now = new Date();
    const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId } });

    let period: { start: Date; end: Date; months: number } | null = null;
    if (input.planId) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.isActive) throw new NotFoundError('Plan not found or inactive');
      if (plan.organizationId && plan.organizationId !== organizationId) throw new ConflictError('That plan is private to another organization.');
      // A renewal continues from the old end date, so paying late doesn't buy free days.
      const start = sub?.planId === input.planId ? sub.currentPeriodEnd : now;
      const months = MONTHS[input.billingCycle!] ?? 0;
      const end = input.periodEnd ? new Date(input.periodEnd) : addMonths(start, months);
      if (end <= start) throw new ValidationError(null, 'The end date must be after the start date.');
      period = { start, end, months: months || Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 86_400_000))) };
    }

    const totals = computeInvoiceTotals({ subtotal: input.amount, gstRate: input.gstRate, sellerState: settings.state, buyerState: buyer.state });
    const complimentary = input.collectionMethod === 'COMPLIMENTARY';

    const invoice = await prisma.$transaction(async (tx) =>
      tx.invoice.create({
        data: {
          id: generateUlid(),
          organizationId,
          organizationName: buyer.name,
          invoiceNumber: await this.nextNumber(tx, settings.invoicePrefix, now),
          planId: input.planId,
          billingCycle: input.planId ? input.billingCycle : undefined,
          periodMonths: period?.months,
          periodStart: period?.start,
          periodEnd: period?.end,
          description: input.description,
          collectionMethod: input.collectionMethod,
          accessMode: complimentary ? 'ACCESS_NOW' : input.accessMode,
          ...totals,
          gstRate: input.gstRate,
          dueAt: endOfDayIst(new Date(now.getTime() + input.dueInDays * 86_400_000)),
          status: complimentary ? 'PAID' : 'ISSUED',
          paidAt: complimentary ? now : undefined,
          seller: settings as unknown as Prisma.InputJsonValue,
          buyer: buyer as unknown as Prisma.InputJsonValue,
          createdById: actor.id,
        },
      }),
    );

    await writeAuditLogEntry(actor, 'invoice.issued', AuditTargetType.INVOICE, invoice.id, invoice.invoiceNumber, {
      organizationId, total: totals.total, collectionMethod: input.collectionMethod, accessMode: invoice.accessMode, planId: input.planId ?? null,
    });

    if (invoice.accessMode === 'ACCESS_NOW') await this.grantAccess(invoice, actor);

    const linkError = input.collectionMethod === 'PAY_ONLINE' ? await this.attachLink(invoice.id) : null;
    const saved = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await this.saveCopy(() => invoiceDocument(saved));
    if (!complimentary) await this.emailIssued(invoice.id);
    return { invoice: saved, linkError };
  }

  /** A failure here costs nothing: the same PDF is built and saved the first time anyone asks for it. */
  private async saveCopy(work: () => Promise<unknown>): Promise<void> {
    await work().catch((err) => console.error('[invoices] Could not save a document yet:', err));
  }

  private saveReceipt(invoiceId: string, paymentId: string): Promise<void> {
    return this.saveCopy(async () => {
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
      const payment = invoice.payments.find((p) => p.id === paymentId);
      if (payment) await receiptDocument(invoice, payment, invoice.payments);
    });
  }

  /** The invoice stands even if Razorpay is down: ops can retry the link from the invoice. */
  private async attachLink(invoiceId: string): Promise<string | null> {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const buyer = inv.buyer as unknown as Buyer;
    const owner = await new OrganizationsRepository().getOwnerContact(inv.organizationId);
    try {
      const link = await createPaymentLink({
        invoiceId: inv.id,
        reference: inv.invoiceNumber,
        amountRupees: round2(n(inv.total) - n(inv.amountPaid) - n(inv.tdsAmount)),
        description: inv.description,
        expiresAt: inv.dueAt,
        customer: { name: buyer.name, email: buyer.email ?? owner?.email ?? null },
      });
      await prisma.invoice.update({ where: { id: inv.id }, data: { razorpayLinkId: link.id, razorpayLinkUrl: link.url, razorpayLinkStatus: 'created' } });
      return null;
    } catch (err) {
      console.error(`[invoices] Could not create a payment link for ${inv.id}:`, err);
      return 'The invoice was issued, but the payment link could not be created. Retry it from the invoice.';
    }
  }

  private async emailIssued(invoiceId: string): Promise<boolean> {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const seller = inv.seller as unknown as BillingSettingsInput;
    return orgOwnerNotifier.notify(inv.organizationId, 'INVOICE_ISSUED', {
      invoiceNumber: inv.invoiceNumber,
      description: inv.description,
      subtotal: n(inv.subtotal),
      gstAmount: round2(n(inv.total) - n(inv.subtotal)),
      total: n(inv.total),
      dueDate: inv.dueAt.toISOString().slice(0, 10),
      payLink: inv.razorpayLinkUrl,
      bank: inv.collectionMethod === 'OFFLINE' ? { name: seller.bankName, account: seller.accountName, number: seller.accountNumber, ifsc: seller.ifsc, upi: seller.upiId } : null,
    });
  }

  /** Puts the org on what the invoice is for. Safe to call twice. */
  private async grantAccess(invoice: Invoice, actor: AuditActor): Promise<void> {
    const fresh = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    if (fresh.accessGrantedAt) return;

    if (fresh.planId && fresh.periodStart && fresh.periodEnd) {
      const existing = await prisma.organizationSubscription.findUnique({ where: { organizationId: fresh.organizationId } });
      const now = new Date();
      // A new plan bought on payment starts when it's paid, not when the invoice went out. A renewal keeps its dates.
      const moving = existing?.planId !== fresh.planId && fresh.accessMode === 'ON_PAYMENT';
      const start = moving ? now : fresh.periodStart;
      const end = moving ? new Date(now.getTime() + (fresh.periodEnd.getTime() - fresh.periodStart.getTime())) : fresh.periodEnd;
      const data = {
        planId: fresh.planId,
        status: 'ACTIVE' as const,
        billingCycle: fresh.billingCycle ?? 'CUSTOM',
        periodMonths: fresh.periodMonths ?? 1,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        collectionMethod: fresh.collectionMethod,
      };
      const sub = await prisma.organizationSubscription.upsert({
        where: { organizationId: fresh.organizationId },
        update: data,
        create: { id: generateUlid(), organizationId: fresh.organizationId, ...data },
      });
      if (existing?.planId !== fresh.planId) {
        await prisma.subscriptionChangeLog.create({
          data: { id: generateUlid(), subscriptionId: sub.id, fromPlanId: existing?.planId, toPlanId: fresh.planId, changedById: actor.id, changedVia: `Invoice ${fresh.invoiceNumber}` },
        });
      }
    }
    await prisma.invoice.update({ where: { id: fresh.id }, data: { accessGrantedAt: new Date() } });
  }

  /** Recomputes the invoice from its live payments, so a void or a retry can never leave the sums wrong. */
  private async settle(tx: Tx, invoiceId: string): Promise<Invoice> {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const live = await tx.opsPayment.findMany({ where: { invoiceId, voidedAt: null, status: 'PAID' } });
    const amountPaid = round2(live.reduce((sum, p) => sum + n(p.amount), 0));
    const tdsAmount = round2(live.reduce((sum, p) => sum + n(p.tdsAmount), 0));
    const closed = inv.status === 'VOID' || inv.status === 'WRITTEN_OFF';
    const status = closed ? inv.status : settledStatus(n(inv.total), amountPaid, tdsAmount);
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid,
        tdsAmount,
        status,
        paidAt: status === 'PAID' ? (inv.paidAt ?? new Date()) : null,
      },
    });
  }

  private async afterMoneyChanged(invoice: Invoice, actor: AuditActor): Promise<void> {
    if (invoice.status === 'PAID') await this.grantAccess(invoice, actor);
    await refreshSubscriptionStatus(invoice.organizationId);
    try {
      await this.entitlements.syncOrgPlanLimitsCache(invoice.organizationId);
    } catch (err) {
      // The money is recorded. The hourly job repairs the cache.
      console.error(`[invoices] Cache sync failed for org ${invoice.organizationId}:`, err);
    }
  }

  private async sendReceipt(invoice: Invoice, payment: OpsPayment): Promise<void> {
    await orgOwnerNotifier.notify(invoice.organizationId, 'BILLING_RECEIPT', {
      planName: invoice.description,
      billingCycle: invoice.billingCycle ?? 'MONTHLY',
      baseAmount: n(payment.baseAmount),
      creditApplied: 0,
      gatewayFeeAmount: 0,
      gstAmount: n(payment.gstAmount),
      tdsAmount: n(payment.tdsAmount),
      amount: n(payment.amount),
      paidAt: (payment.paidAt ?? new Date()).toISOString().slice(0, 10),
      razorpayPaymentId: payment.razorpayPaymentId ?? payment.reference,
      paymentId: payment.id,
      invoiceNumber: invoice.invoiceNumber,
      receiptNumber: payment.receiptNumber,
    });
  }

  /** Money that reached our bank. There's no third-party record, so who entered it and on what evidence is kept with it. */
  async recordPayment(invoiceId: string, input: RecordPaymentInput, actor: AuditActor) {
    const settings = await this.getSettings();
    if (!settings) throw new ConflictError('Fill in Billing Settings first.');

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw new NotFoundError('Invoice not found');
      if (inv.status !== 'ISSUED' && inv.status !== 'PARTIALLY_PAID') throw new ConflictError(`This invoice is ${inv.status.toLowerCase().replace('_', ' ')}.`);

      const balance = round2(n(inv.total) - n(inv.amountPaid) - n(inv.tdsAmount));
      const covered = round2(input.amount + input.tdsAmount);
      if (covered > balance) throw new ValidationError(null, `That's more than the ₹${balance.toFixed(2)} still due on this invoice.`);

      const duplicate = await tx.opsPayment.findFirst({ where: { organizationId: inv.organizationId, reference: input.reference, voidedAt: null } });
      if (duplicate) throw new ConflictError(`Reference ${input.reference} is already recorded for this organization.`);

      const split = splitPayment(covered, { subtotal: n(inv.subtotal), total: n(inv.total) });
      const payment = await tx.opsPayment.create({
        data: {
          id: generateUlid(),
          organizationId: inv.organizationId,
          purpose: 'subscription',
          planId: inv.planId,
          billingCycle: inv.billingCycle,
          periodMonths: inv.periodMonths,
          ...split,
          amount: input.amount,
          tdsAmount: input.tdsAmount,
          status: 'PAID',
          paidAt: new Date(input.receivedAt),
          receivedAt: new Date(input.receivedAt),
          invoiceId,
          receiptNumber: await this.nextNumber(tx, settings.receiptPrefix, new Date()),
          source: input.source,
          reference: input.reference,
          notes: input.notes,
          recordedById: actor.id,
        },
      });
      if (input.proof) {
        await tx.paymentProof.create({
          data: { paymentId: payment.id, fileName: input.proof.fileName, contentType: input.proof.contentType, data: Buffer.from(input.proof.base64, 'base64') },
        });
      }
      return { payment, invoice: await this.settle(tx, invoiceId) };
    });

    await writeAuditLogEntry(actor, 'invoice.payment_recorded', AuditTargetType.INVOICE, invoiceId, result.invoice.invoiceNumber, {
      organizationId: result.invoice.organizationId,
      paymentId: result.payment.id,
      amount: input.amount,
      tdsAmount: input.tdsAmount,
      source: input.source,
      reference: input.reference,
      hasProof: !!input.proof,
    });
    await this.afterMoneyChanged(result.invoice, actor);
    await this.saveReceipt(result.invoice.id, result.payment.id);
    await this.sendReceipt(result.invoice, result.payment);
    return result;
  }

  /** A bounced cheque or a typing mistake. Nothing is deleted, and access follows the invoice again. */
  async voidPayment(invoiceId: string, paymentId: string, reason: string, actor: AuditActor) {
    const invoice = await prisma.$transaction(async (tx) => {
      const payment = await tx.opsPayment.findFirst({ where: { id: paymentId, invoiceId } });
      if (!payment) throw new NotFoundError('Payment not found on this invoice');
      if (payment.voidedAt) throw new ConflictError('This payment is already voided.');
      if (payment.razorpayPaymentId) throw new ConflictError('A Razorpay payment is reversed with a refund, not voided.');
      await tx.opsPayment.update({ where: { id: paymentId }, data: { status: 'FAILED', voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
      return this.settle(tx, invoiceId);
    });

    // Later receipts count this payment, so they're all rebuilt. The invoice itself didn't change.
    await forgetDocuments(invoiceId, 'RECEIPT');
    await writeAuditLogEntry(actor, 'invoice.payment_voided', AuditTargetType.INVOICE, invoiceId, invoice.invoiceNumber, { organizationId: invoice.organizationId, paymentId, reason });
    await this.afterMoneyChanged(invoice, actor);
    return invoice;
  }

  async act(
    invoiceId: string,
    input: { action: 'void' | 'write_off'; reason: string } | { action: 'extend_due'; reason: string; dueAt: string } | { action: 'create_link' } | { action: 'resend' },
    actor: AuditActor,
  ) {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundError('Invoice not found');
    const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID';

    if (input.action === 'resend') {
      if (!open) throw new ConflictError('Only an unpaid invoice can be resent.');
      return { sent: await this.emailIssued(invoiceId) };
    }
    if (input.action === 'create_link') {
      if (!open) throw new ConflictError('Only an unpaid invoice can have a payment link.');
      if (inv.dueAt <= new Date()) throw new ConflictError('Move the due date forward first: a link can\'t expire in the past.');
      const linkError = await this.attachLink(invoiceId);
      if (linkError) throw new ConflictError(linkError);
      await forgetDocuments(invoiceId, 'INVOICE');
      return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    }
    if (!open) throw new ConflictError(`This invoice is ${inv.status.toLowerCase().replace('_', ' ')}.`);

    if (input.action === 'extend_due') {
      const dueAt = endOfDayIst(new Date(input.dueAt));
      if (dueAt <= new Date()) throw new ValidationError(null, 'The new due date must be in the future.');
      if (inv.razorpayLinkId) await extendPaymentLink(inv.razorpayLinkId, dueAt).catch((err) => console.error('[invoices] Could not extend the link:', err));
      await prisma.invoice.update({ where: { id: invoiceId }, data: { dueAt, lastReminderDays: null } });
    } else {
      if (input.action === 'void' && n(inv.amountPaid) + n(inv.tdsAmount) > 0) throw new ConflictError('Void its payments first.');
      if (inv.razorpayLinkId) await cancelPaymentLink(inv.razorpayLinkId).catch((err) => console.error('[invoices] Could not cancel the link:', err));
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: input.action === 'void' ? 'VOID' : 'WRITTEN_OFF', closedReason: input.reason },
      });
    }
    await writeAuditLogEntry(actor, `invoice.${input.action}`, AuditTargetType.INVOICE, invoiceId, inv.invoiceNumber, {
      organizationId: inv.organizationId,
      reason: input.reason,
      ...(input.action === 'extend_due' ? { from: inv.dueAt.toISOString(), to: input.dueAt } : {}),
    });
    await forgetDocuments(invoiceId, 'INVOICE');
    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await this.afterMoneyChanged(updated, actor);
    return updated;
  }

  /** A Razorpay link was paid. Idempotent on the payment id, since Razorpay can deliver an event twice. */
  async applyLinkPayment(linkId: string, payment: { id: string; amountPaise: number }, actor: AuditActor) {
    const inv = await prisma.invoice.findUnique({ where: { razorpayLinkId: linkId } });
    if (!inv) return null;
    const settings = await this.getSettings();
    if (!settings) throw new Error('Billing settings are missing');

    const amount = round2(payment.amountPaise / 100);
    const result = await prisma.$transaction(async (tx) => {
      if (await tx.opsPayment.findUnique({ where: { razorpayPaymentId: payment.id } })) return null;
      const row = await tx.opsPayment.create({
        data: {
          id: generateUlid(),
          organizationId: inv.organizationId,
          purpose: 'subscription',
          planId: inv.planId,
          billingCycle: inv.billingCycle,
          periodMonths: inv.periodMonths,
          ...splitPayment(amount, { subtotal: n(inv.subtotal), total: n(inv.total) }),
          amount,
          status: 'PAID',
          paidAt: new Date(),
          receivedAt: new Date(),
          razorpayPaymentId: payment.id,
          invoiceId: inv.id,
          receiptNumber: await this.nextNumber(tx, settings.receiptPrefix, new Date()),
          source: 'RAZORPAY_LINK',
        },
      });
      return { row, invoice: await this.settle(tx, inv.id) };
    });
    if (!result) return null;

    await writeAuditLogEntry(actor, 'invoice.payment_received', AuditTargetType.INVOICE, inv.id, inv.invoiceNumber, {
      organizationId: inv.organizationId, razorpayPaymentId: payment.id, amount,
    });
    await this.afterMoneyChanged(result.invoice, actor);
    await this.saveReceipt(result.invoice.id, result.row.id);
    await this.sendReceipt(result.invoice, result.row);
    return result.invoice;
  }

  setLinkStatus(linkId: string, status: string) {
    return prisma.invoice.updateMany({ where: { razorpayLinkId: linkId }, data: { razorpayLinkStatus: status } });
  }

  /**
   * A self-serve checkout already happened and the plan is assigned, so this only adds the invoice
   * for it. Never fails the payment: without billing settings, or for an order priced under the old
   * fee line, it logs and moves on.
   */
  async recordOrderInvoice(payment: OpsPayment, description: string): Promise<string | null> {
    if (payment.invoiceId) return null;
    const settings = await this.getSettings();
    if (!settings) {
      console.warn(`[invoices] No billing settings, so no invoice for payment ${payment.id}.`);
      return null;
    }
    const buyer = await this.buyerOf(payment.organizationId);
    const totals = computeInvoiceTotals({ subtotal: n(payment.baseAmount), gstRate: 18, sellerState: settings.state, buyerState: buyer.state });
    if (totals.total !== n(payment.amount)) {
      console.warn(`[invoices] Payment ${payment.id} doesn't match base + GST, so no invoice was made.`);
      return null;
    }
    const now = new Date();
    // assignPlan has just set these, and the invoice names the period it paid for.
    const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId: payment.organizationId } });
    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          id: generateUlid(),
          organizationId: payment.organizationId,
          organizationName: buyer.name,
          invoiceNumber: await this.nextNumber(tx, settings.invoicePrefix, now),
          planId: payment.planId,
          billingCycle: payment.billingCycle,
          periodMonths: payment.periodMonths,
          periodStart: sub?.currentPeriodStart,
          periodEnd: sub?.currentPeriodEnd,
          description,
          collectionMethod: CollectionMethod.PAY_ONLINE,
          accessGrantedAt: now,
          ...totals,
          gstRate: 18,
          amountPaid: totals.total,
          dueAt: now,
          status: 'PAID',
          paidAt: payment.paidAt ?? now,
          seller: settings as unknown as Prisma.InputJsonValue,
          buyer: buyer as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.opsPayment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id, receiptNumber: await this.nextNumber(tx, settings.receiptPrefix, now) } });
      return invoice;
    });
    await this.saveCopy(() => invoiceDocument(created));
    await this.saveReceipt(created.id, payment.id);
    return created.invoiceNumber;
  }
}

export const invoicesService = new InvoicesService();
