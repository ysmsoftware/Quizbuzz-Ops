import { AuditTargetType } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { handoffSecret } from './handoff-secret';
import { writeAuditLogEntry } from '../../audit/audit-writer';
import { errorResponse, okResponse } from '../../http/envelope';
import { ConflictError, NotFoundError } from '../../http/errors';
import { orgOwnerNotifier } from '../../notifications/org-owner-notifier';
import { verifyJwt } from '../../utils/jwt';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { computeAccessDates, lapseStatusAt } from '../subscriptions/access-dates';
import { oldestUnpaidDueAt } from '../subscriptions/access-input';
import { invoiceDocument, pdfResponse, receiptDocument } from './billing-documents';
import { invoicesService } from './invoices.service';

/**
 * What the owner's Billing page asks ops for. The main app checks the caller is the org's OWNER,
 * then signs a one-minute token naming the org, so ops only ever answers for that org.
 */

interface AccountClaims { organizationId: string; adminEmail?: string; purpose?: string }

function claimsFrom(token: unknown): AccountClaims | null {
  const secret = handoffSecret();
  if (!secret || typeof token !== 'string') return null;
  try {
    const claims = verifyJwt(token, secret) as unknown as AccountClaims;
    return claims.purpose === 'billing_account' && claims.organizationId ? claims : null;
  } catch {
    return null;
  }
}

const num = (v: unknown) => Number(v ?? 0);

async function summary(organizationId: string) {
  const [sub, invoices] = await Promise.all([
    prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } }),
    prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { payments: { where: { voidedAt: null, status: 'PAID', receiptNumber: { not: null } }, orderBy: { createdAt: 'asc' }, select: { id: true, receiptNumber: true } } },
    }),
  ]);
  const dates = sub
    ? computeAccessDates({
        kind: sub.plan.kind,
        currentPeriodEnd: sub.currentPeriodEnd,
        graceDays: sub.graceDays,
        overdueInvoiceDueAt: await oldestUnpaidDueAt(organizationId),
        cancelled: sub.status === 'CANCELLED',
      })
    : { restrictAt: null, downgradeAt: null };

  return {
    plan: sub ? { name: sub.plan.name, slug: sub.plan.slug, kind: sub.plan.kind } : null,
    subscription: sub && {
      status: sub.status,
      billingCycle: sub.billingCycle,
      collectionMethod: sub.collectionMethod,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      contractEnd: sub.contractEnd?.toISOString() ?? null,
      restrictAt: dates.restrictAt?.toISOString() ?? null,
      downgradeAt: dates.downgradeAt?.toISOString() ?? null,
    },
    invoices: invoices.map((inv) => {
      const open = inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID';
      return {
        id: inv.id,
        number: inv.invoiceNumber,
        date: inv.createdAt.toISOString(),
        description: inv.description,
        total: num(inv.total),
        amountDue: open ? Math.round((num(inv.total) - num(inv.amountPaid) - num(inv.tdsAmount)) * 100) / 100 : 0,
        status: inv.status,
        dueAt: inv.dueAt.toISOString(),
        canPayOnline: open && inv.collectionMethod === 'PAY_ONLINE',
        receipts: inv.payments.map((p) => ({ paymentId: p.id, number: p.receiptNumber })),
      };
    }),
  };
}

async function cancel(claims: AccountClaims, resume: boolean) {
  const organizationId = claims.organizationId;
  const sub = await prisma.organizationSubscription.findUnique({ where: { organizationId }, include: { plan: true } });
  if (!sub) throw new NotFoundError('No subscription found');
  if (sub.plan.kind !== 'STANDARD' || sub.collectionMethod !== 'PAY_ONLINE') {
    throw new ConflictError('This plan is managed by your account manager. Please contact us to change it.');
  }
  const input = { kind: sub.plan.kind, currentPeriodEnd: sub.currentPeriodEnd, graceDays: sub.graceDays, overdueInvoiceDueAt: await oldestUnpaidDueAt(organizationId) };
  const status = resume ? lapseStatusAt(input) : 'CANCELLED';
  await prisma.organizationSubscription.update({ where: { id: sub.id }, data: { status, cancelledAt: resume ? null : new Date() } });
  await new EntitlementsService().syncOrgPlanLimitsCache(organizationId);
  await writeAuditLogEntry(
    { id: null, email: claims.adminEmail ?? 'owner', name: 'Organization owner', role: 'org-owner' },
    resume ? 'subscription.resumed' : 'subscription.cancelled',
    AuditTargetType.SUBSCRIPTION, sub.id, sub.plan.name, { organizationId, currentPeriodEnd: sub.currentPeriodEnd.toISOString() },
  );
  if (!resume) {
    await orgOwnerNotifier.notify(organizationId, 'SUBSCRIPTION_CANCELLED', { planName: sub.plan.name, effectiveDate: sub.currentPeriodEnd.toISOString().slice(0, 10) });
  }
}

export async function handleAccountRequest(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; action?: string; invoiceId?: string; paymentId?: string };
  const claims = claimsFrom(body.token);
  if (!claims) return errorResponse('Invalid or expired token', 'UNAUTHENTICATED', null, 401);
  const organizationId = claims.organizationId;

  if (body.action === 'cancel' || body.action === 'resume') {
    await cancel(claims, body.action === 'resume');
    return okResponse(await summary(organizationId), 'Updated.');
  }

  if (body.action === 'receipt') {
    const invoice = await prisma.invoice.findFirst({ where: { id: body.invoiceId, organizationId }, include: { payments: true } });
    const payment = invoice?.payments.find((p) => p.id === body.paymentId && !p.voidedAt);
    if (!invoice || !payment?.receiptNumber) return errorResponse('Receipt not found', 'NOT_FOUND', null, 404);
    return pdfResponse(await receiptDocument(invoice, payment, invoice.payments));
  }

  if (body.action === 'pdf' || body.action === 'pay') {
    const invoice = await prisma.invoice.findFirst({ where: { id: body.invoiceId, organizationId }, include: { payments: true } });
    if (!invoice) return errorResponse('Invoice not found', 'NOT_FOUND', null, 404);

    if (body.action === 'pdf') {
      return pdfResponse(await invoiceDocument(invoice));
    }

    const usable = invoice.razorpayLinkUrl && invoice.razorpayLinkStatus === 'created';
    if (usable) return okResponse({ url: invoice.razorpayLinkUrl }, 'Pay link.');
    if (invoice.collectionMethod !== 'PAY_ONLINE') throw new ConflictError('This invoice is paid by bank transfer. The details are in the PDF.');
    const updated = (await invoicesService.act(invoice.id, { action: 'create_link' }, { id: null, email: claims.adminEmail ?? 'owner', name: 'Organization owner', role: 'org-owner' })) as { razorpayLinkUrl?: string | null };
    if (!updated.razorpayLinkUrl) throw new ConflictError('Online payment is not available right now. Please try again shortly.');
    return okResponse({ url: updated.razorpayLinkUrl }, 'Pay link.');
  }

  return okResponse(await summary(organizationId), 'Billing retrieved.');
}
