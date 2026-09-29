import { IPaymentDetailsRepository, PaymentDetailsRepository } from './payment-details.repository';
import { PaymentDetailsListQuery, PaymentDetailsListResult, PaymentOrderResponse } from './payment-details.types';
import { logger } from '../../http/logger';

export interface IPaymentDetailsService {
  listPayments(params: PaymentDetailsListQuery): Promise<PaymentDetailsListResult>;
}

// Same receipt format as Quizbuzz-new/backend/src/modules/payment/payment.service.ts
// (createOrder: `rcpt_` + 30 chars, retries: `rcpt_r_` + 27 chars). Keep in sync.
function razorpayReceipts(participantId: string) {
  const compact = participantId.replace(/-/g, '');
  return { original: `rcpt_${compact.slice(0, 30)}`, retry: `rcpt_r_${compact.slice(0, 27)}` };
}

export class PaymentDetailsService implements IPaymentDetailsService {
  constructor(private repo: IPaymentDetailsRepository = new PaymentDetailsRepository()) {}

  async listPayments(params: PaymentDetailsListQuery): Promise<PaymentDetailsListResult> {
    const { rows, total } = await this.repo.listPayments(params);

    // Order history is best-effort: if the read grant on payment_orders hasn't been
    // applied on this environment yet, the page still works without it.
    let ordersByPayment: Map<string, PaymentOrderResponse[]> | null = new Map();
    try {
      for (const o of await this.repo.listOrders(rows.map((r) => r.id))) {
        const list = ordersByPayment.get(o.paymentId) ?? [];
        list.push({
          razorpayOrderId: o.razorpayOrderId,
          status: o.status,
          razorpayPaymentId: o.razorpayPaymentId,
          method: o.method,
          failureReason: o.failureReason,
          errorCode: o.errorCode,
          errorReason: o.errorReason,
          createdAt: new Date(o.createdAt).toISOString(),
          updatedAt: new Date(o.updatedAt).toISOString(),
        });
        ordersByPayment.set(o.paymentId, list);
      }
    } catch (err) {
      logger.warn('[payment-details] Could not read payment_orders — apply prisma/grants/005_quizbuzz_ops_payment_orders.sql', {
        err: (err as Error).message,
      });
      ordersByPayment = null;
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        organizationName: r.organizationName,
        contestId: r.contestId,
        contestTitle: r.contestTitle,
        participantId: r.participantId,
        registrationRef: r.registrationRef,
        participantStatus: r.participantStatus,
        payeeName: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unknown',
        email: r.email,
        phone: r.phone,
        amount: r.amount / 100, // paise to INR
        currency: r.currency,
        status: r.status,
        razorpayOrderId: r.razorpayOrderId,
        razorpayPaymentId: r.razorpayPaymentId,
        razorpayStatus: r.razorpayStatus,
        failureReason: r.failureReason,
        attempts: r.attempts,
        webhookConfirmed: r.webhookConfirmed,
        razorpayReceipts: razorpayReceipts(r.participantId),
        orders: ordersByPayment ? ordersByPayment.get(r.id) ?? [] : null,
        metadata: r.metadata,
        paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}
export default PaymentDetailsService;
