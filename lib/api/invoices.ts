'use client';

import { apiRequest } from '@/lib/api/utils';

export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'WRITTEN_OFF';

export interface InvoicePayment {
  id: string;
  amount: string;
  tdsAmount: string | null;
  source: string;
  reference: string | null;
  receiptNumber: string | null;
  razorpayPaymentId: string | null;
  receivedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  proof: { fileName: string } | null;
}

export interface Invoice {
  id: string;
  organizationId: string;
  organizationName: string;
  invoiceNumber: string;
  description: string;
  collectionMethod: 'PAY_ONLINE' | 'OFFLINE' | 'COMPLIMENTARY';
  accessMode: 'ACCESS_NOW' | 'ON_PAYMENT';
  accessGrantedAt: string | null;
  subtotal: string;
  total: string;
  amountPaid: string;
  tdsAmount: string;
  dueAt: string;
  paidAt: string | null;
  status: InvoiceStatus;
  closedReason: string | null;
  razorpayLinkId: string | null;
  razorpayLinkUrl: string | null;
  razorpayLinkStatus: string | null;
  createdAt: string;
  payments: InvoicePayment[];
}

export interface InvoiceList { rows: Invoice[]; total: number; page: number; limit: number }

export interface IssueInvoiceBody {
  description: string;
  collectionMethod: Invoice['collectionMethod'];
  amount: number;
  gstRate: number;
  dueInDays: number;
  accessMode: Invoice['accessMode'];
  planId?: string;
  billingCycle?: 'MONTHLY' | 'HALF_YEARLY' | 'ANNUAL' | 'CUSTOM';
  periodEnd?: string;
}

export interface RecordPaymentBody {
  amount: number;
  tdsAmount: number;
  receivedAt: string;
  source: 'BANK_TRANSFER' | 'CHEQUE' | 'UPI_DIRECT' | 'OTHER';
  reference: string;
  notes?: string;
  proof?: { fileName: string; contentType: string; base64: string };
}

export type InvoiceAction =
  | { action: 'void' | 'write_off'; reason: string }
  | { action: 'extend_due'; reason: string; dueAt: string }
  | { action: 'create_link' }
  | { action: 'resend' };

export interface BillingSettings {
  legalName: string;
  gstin: string | null;
  sacCode: string | null;
  address: string;
  state: string;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
  invoicePrefix: string;
  receiptPrefix: string;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function listInvoices(params: { organizationId?: string; status?: string; overdue?: boolean; page: number; limit: number }) {
  const q = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.organizationId) q.set('organizationId', params.organizationId);
  if (params.status) q.set('status', params.status);
  if (params.overdue) q.set('overdue', 'true');
  return apiRequest<InvoiceList>(`/api/v1/ops/invoices?${q}`);
}

export const issueInvoice = (orgId: string, body: IssueInvoiceBody) =>
  apiRequest<{ invoice: Invoice; linkError: string | null }>(`/api/v1/ops/organizations/${orgId}/invoices`, json('POST', body));
export const recordInvoicePayment = (id: string, body: RecordPaymentBody) => apiRequest(`/api/v1/ops/invoices/${id}/payments`, json('POST', body));
export const voidInvoicePayment = (id: string, paymentId: string, reason: string) => apiRequest(`/api/v1/ops/invoices/${id}/payments/${paymentId}`, json('DELETE', { reason }));
export const actOnInvoice = (id: string, body: InvoiceAction) => apiRequest(`/api/v1/ops/invoices/${id}`, json('POST', body));
export const getBillingSettings = () => apiRequest<BillingSettings | null>('/api/v1/ops/billing/settings');
export const saveBillingSettings = (body: BillingSettings) => apiRequest('/api/v1/ops/billing/settings', json('PUT', body));

export interface SalesLead {
  id: string;
  organizationId: string | null;
  name: string;
  email: string;
  phone: string | null;
  organization: string | null;
  message: string | null;
  learners: number | null;
  source: string;
  status: 'NEW' | 'CONTACTED' | 'WON' | 'LOST';
  notes: string | null;
  createdAt: string;
}

export const listLeads = (status: string, page: number) => apiRequest<{ rows: SalesLead[]; total: number }>(`/api/v1/ops/leads?page=${page}${status ? `&status=${status}` : ''}`);
export const updateLead = (id: string, body: { status?: SalesLead['status']; notes?: string }) => apiRequest(`/api/v1/ops/leads/${id}`, json('PATCH', body));
