'use client';

import { useQuery } from '@tanstack/react-query';
import { getPaymentDetails, GetPaymentDetailsParams } from '@/lib/api/paymentDetails';

/** Mirrors useMainAppAuditLogs.ts — backs the Payments page. */
export function usePaymentDetails(filters: GetPaymentDetailsParams = {}) {
  const paymentsQuery = useQuery({
    queryKey: ['paymentDetails', 'list', filters],
    queryFn: () => getPaymentDetails(filters),
    placeholderData: (prev) => prev,
  });

  return {
    payments: paymentsQuery.data?.data || [],
    pagination: {
      total: paymentsQuery.data?.total || 0,
      page: paymentsQuery.data?.page || filters.page || 1,
      limit: paymentsQuery.data?.limit || filters.limit || 50,
    },
    isLoading: paymentsQuery.isLoading,
    isFetching: paymentsQuery.isFetching,
    isError: paymentsQuery.isError,
    refetch: paymentsQuery.refetch,
  };
}
