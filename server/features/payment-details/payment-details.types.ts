import { PaymentDetailsListQueryInput } from './payment-details.validator';

export type PaymentDetailsListQuery = PaymentDetailsListQueryInput;

export interface PaymentDetailResponse {
  id: string;
  organizationId: string;
  organizationName: string;
  contestId: string;
  contestTitle: string | null;
  participantId: string;
  registrationRef: string | null;
  participantStatus: string | null;
  payeeName: string;
  email: string | null;
  phone: string | null;
  amount: number; // INR (converted from paise)
  currency: string;
  status: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpayStatus: string | null;
  failureReason: string | null;
  attempts: number;
  webhookConfirmed: boolean;
  // The receipts the main app puts on its Razorpay orders (payment.service.ts
  // createOrder/retryPayment). Searching these in the Razorpay dashboard's
  // Orders page surfaces every order ever created for this participant —
  // including ones whose ID was overwritten here by updateForRetry.
  razorpayReceipts: { original: string; retry: string };
  // Every Razorpay order for this payment, newest first (null = history unavailable).
  orders: PaymentOrderResponse[] | null;
  metadata: any;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrderResponse {
  razorpayOrderId: string;
  status: string;
  razorpayPaymentId: string | null;
  method: string | null;
  failureReason: string | null;
  errorCode: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetailsListResult {
  data: PaymentDetailResponse[];
  total: number;
  page: number;
  limit: number;
}
