'use client';

import { useQuery } from '@tanstack/react-query';
import { getPlatformBillingSummary, getPlatformPayments } from '@/lib/api/billing';
import { BillingPaymentsListQueryParams } from '@/server/features/billing/billing.types';

export function useBillingSummary() {
  return useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: () => getPlatformBillingSummary(),
  });
}

export function useBillingPayments(params?: Partial<BillingPaymentsListQueryParams>) {
  return useQuery({
    queryKey: ['billing', 'payments', params],
    queryFn: () => getPlatformPayments(params),
  });
}

/**
 * Backwards compatibility hook wrapper
 */
export function useBilling() {
  const summaryQuery = useBillingSummary();
  const paymentsQuery = useBillingPayments({ limit: 100 });

  return {
    summary: summaryQuery.data,
    isSummaryLoading: summaryQuery.isLoading,
    isSummaryError: summaryQuery.isError,

    payments: paymentsQuery.data?.data || [],
    paymentsTotal: paymentsQuery.data?.total || 0,
    isPaymentsLoading: paymentsQuery.isLoading,
    isPaymentsError: paymentsQuery.isError,
  };
}
