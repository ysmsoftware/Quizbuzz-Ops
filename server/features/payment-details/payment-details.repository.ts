import { queryMainDb } from '../../db/main-db-pool';
import { PaymentDetailsListQuery } from './payment-details.types';

export interface IPaymentDetailsRepository {
  listPayments(params: PaymentDetailsListQuery): Promise<{ rows: any[]; total: number }>;
  /** Every Razorpay order per payment (main app's payment_orders), newest first. */
  listOrders(paymentIds: string[]): Promise<any[]>;
}

/**
 * Read-only — the main app's contest-fee `payments` table over queryMainDb,
 * joined to who paid and for what. Unlike billing.repository.ts's ledger this
 * returns every Razorpay-side field we store (order ID, failure reason,
 * attempts, webhook flag, raw metadata), for cross-checking against the
 * Razorpay dashboard. Subscription payments (ops DB) stay on the Billing page.
 */
export class PaymentDetailsRepository implements IPaymentDetailsRepository {
  async listPayments(params: PaymentDetailsListQuery) {
    const { page, limit, status, search, organizationId, retriedOnly, dateFrom, dateTo } = params;

    const conditions: string[] = ['pay."isDeleted" = false'];
    const sqlParams: any[] = [];
    const addParam = (value: any) => {
      sqlParams.push(value);
      return `$${sqlParams.length}`;
    };

    if (status !== 'all') conditions.push(`pay.status = ${addParam(status)}::"PaymentStatus"`);
    if (organizationId) conditions.push(`pay."organizationId" = ${addParam(organizationId)}`);
    if (retriedOnly === '1') conditions.push('pay.attempts > 1');
    if (dateFrom) conditions.push(`pay."createdAt" >= ${addParam(new Date(dateFrom))}`);
    if (dateTo) conditions.push(`pay."createdAt" <= ${addParam(new Date(dateTo))}`);

    if (search) {
      const like = addParam(`%${search}%`);
      const fields = [
        'cnt.email',
        `cnt."firstName" || ' ' || COALESCE(cnt."lastName", '')`,
        'pay.id',
        'pay."participantId"',
        'pay."razorpayOrderId"',
        'pay."razorpayPaymentId"',
        'p."registrationRef"',
        'c.title',
        'o.name',
      ].map((f) => `${f} ILIKE ${like}`);
      // Phones are typed every which way ("+91 93735 50044", "9373550044") —
      // compare digits only so either form matches.
      const digits = search.replace(/\D/g, '');
      if (digits.length >= 4) {
        fields.push(`regexp_replace(COALESCE(cnt.phone, ''), '\\D', '', 'g') LIKE ${addParam(`%${digits}%`)}`);
      }
      conditions.push(`(${fields.join(' OR ')})`);
    }

    const fromClause = `
      FROM payments pay
      JOIN organizations o ON pay."organizationId" = o.id
      LEFT JOIN contests c ON pay."contestId" = c.id
      LEFT JOIN contacts cnt ON pay."contactId" = cnt.id
      LEFT JOIN participants p ON pay."participantId" = p.id
      WHERE ${conditions.join(' AND ')}
    `;

    const countQuery = `SELECT COUNT(*)::int as count ${fromClause}`;
    const dataQuery = `
      SELECT
        pay.id, pay."organizationId", o.name as "organizationName",
        pay."contestId", c.title as "contestTitle",
        pay."participantId", p."registrationRef", p.status as "participantStatus",
        cnt."firstName", cnt."lastName", cnt.email, cnt.phone,
        pay.amount, pay.currency, pay.status,
        pay."razorpayOrderId", pay."razorpayPaymentId", pay."razorpayStatus",
        pay."failureReason", pay.attempts, pay."webhookConfirmed", pay.metadata,
        pay."paidAt", pay."createdAt", pay."updatedAt"
      ${fromClause}
      ORDER BY pay."createdAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    const [countResult, dataResult] = await Promise.all([
      queryMainDb(countQuery, sqlParams),
      queryMainDb(dataQuery, sqlParams),
    ]);

    return { rows: dataResult, total: countResult[0]?.count || 0 };
  }

  // Needs prisma/grants/005_quizbuzz_ops_payment_orders.sql on the main DB.
  async listOrders(paymentIds: string[]) {
    if (paymentIds.length === 0) return [];
    return queryMainDb(
      `SELECT "paymentId", "razorpayOrderId", status, "razorpayPaymentId", method,
              "failureReason", "errorCode", "errorReason", "createdAt", "updatedAt"
       FROM payment_orders
       WHERE "paymentId" = ANY($1)
       ORDER BY "createdAt" DESC`,
      [paymentIds]
    );
  }
}
export default PaymentDetailsRepository;
