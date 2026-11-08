import { AuditTargetType, type Invoice } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { generateUlid } from '../../utils/ulid';
import { writeAuditLogEntry, type AuditActor } from '../../audit/audit-writer';
import { ConflictError, ValidationError } from '../../http/errors';
import { AI_TOP_UP_VALID_MONTHS, aiCreditPack } from '@/lib/pricing/ai-credits';
import { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service';
import { invoicesService } from './invoices.service';

/**
 * AI credit top-ups. Buying one is an ordinary invoice with a pay link, so the receipt, the email and a
 * refund work as for anything else; paying it adds the credits. The AI module spends them: the main app
 * gets aiCreditsPerMonth (plan) and aiTopUpCredits (unexpired top-ups) in the plan cache.
 */

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

/** Unexpired top-up credits, for the cache and the Billing page. */
export async function liveTopUps(organizationId: string, now = new Date()) {
  return prisma.aiCreditTopUp.findMany({ where: { organizationId, expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' } });
}

/** Called when an invoice is paid. Safe to repeat: one top-up per invoice. */
export async function grantPaidTopUp(invoice: Pick<Invoice, 'id' | 'organizationId' | 'aiCredits' | 'invoiceNumber'>) {
  if (!invoice.aiCredits) return;
  await prisma.aiCreditTopUp.upsert({
    where: { invoiceId: invoice.id },
    update: {},
    create: { id: generateUlid(), organizationId: invoice.organizationId, credits: invoice.aiCredits, invoiceId: invoice.id, reason: `Paid with ${invoice.invoiceNumber}`, expiresAt: addMonths(new Date(), AI_TOP_UP_VALID_MONTHS) },
  });
}

/** The owner picks a pack: an invoice with a Razorpay link, returned for them to pay. */
export async function buyTopUp(organizationId: string, credits: number, actor: AuditActor): Promise<string> {
  const pack = aiCreditPack(credits);
  if (!pack) throw new ValidationError(null, 'Pick one of the credit packs.');
  const { invoice, linkError } = await invoicesService.issue(
    organizationId,
    { description: `QuizBuzz AI credits, ${pack.credits.toLocaleString('en-IN')} (valid ${AI_TOP_UP_VALID_MONTHS} months)`, collectionMethod: 'PAY_ONLINE', amount: pack.price, gstRate: 18, dueInDays: 7, accessMode: 'ON_PAYMENT' },
    actor,
    { aiCredits: pack.credits },
  );
  if (linkError || !invoice.razorpayLinkUrl) throw new ConflictError('Online payment isn’t available right now. Please try again shortly.');
  return invoice.razorpayLinkUrl;
}

/** Ops gives credits for free: a pilot, a goodwill gesture, an apology. */
export async function grantFreeTopUp(organizationId: string, input: { credits: number; months: number; reason: string }, actor: AuditActor) {
  const row = await prisma.aiCreditTopUp.create({
    data: { id: generateUlid(), organizationId, credits: input.credits, reason: input.reason, expiresAt: addMonths(new Date(), input.months), createdById: actor.id },
  });
  await syncOrgPlanLimitsCache(organizationId).catch((err) => console.error('[ai-credits] cache sync:', err));
  await writeAuditLogEntry(actor, 'ai_credits.granted', AuditTargetType.ORGANIZATION, organizationId, `${input.credits} AI credits`, { ...input, expiresAt: row.expiresAt.toISOString() });
  return row;
}
