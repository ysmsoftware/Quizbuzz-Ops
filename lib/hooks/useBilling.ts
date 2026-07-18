'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBillingRecords, refundBillingRecord, getPayments, refundPayment } from '@/lib/api/billing';

export function useBilling() {
  const queryClient = useQueryClient();

  const billingQuery = useQuery({
    queryKey: ['billing', 'list'],
    queryFn: getBillingRecords,
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', 'list'],
    queryFn: getPayments,
  });

  const refundMutation = useMutation({
    mutationFn: (billingId: string) => refundBillingRecord(billingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  const refundPaymentMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => refundPayment(paymentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    records: billingQuery.data || [],
    isLoading: billingQuery.isLoading,
    isError: billingQuery.isError,
    refundRecord: refundMutation.mutateAsync,
    isRefunding: refundMutation.isPending,

    payments: paymentsQuery.data || [],
    isPaymentsLoading: paymentsQuery.isLoading,
    refundPayment: refundPaymentMutation.mutateAsync,
    isRefundingPayment: refundPaymentMutation.isPending,
  };
}
