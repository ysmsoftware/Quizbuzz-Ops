import { IPaymentDetailsRepository, PaymentDetailsRepository } from './payment-details.repository';
import { PaymentDetailsListQuery, PaymentDetailsListResult } from './payment-details.types';

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
