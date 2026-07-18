'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPricingConfig, 
  updatePricingConfig, 
  getBookings, 
  getBooking, 
  createContestBooking, 
  updateBookingStatus 
} from '@/lib/api/bookings';
import { ContestBooking, PricingConfig } from '@/lib/types';

export function usePricingConfig() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['pricingConfig'],
    queryFn: getPricingConfig,
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ 
      updates, 
      adminName, 
      adminRole 
    }: { 
      updates: Partial<PricingConfig>; 
      adminName: string; 
      adminRole: any; 
    }) => updatePricingConfig(updates, adminName, adminRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricingConfig'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    pricingConfig: configQuery.data,
    isLoading: configQuery.isLoading,
    isError: configQuery.isError,
    updatePricingConfig: updateConfigMutation.mutateAsync,
    isUpdating: updateConfigMutation.isPending,
  };
}

export function useBookings() {
  const queryClient = useQueryClient();

  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'list'],
    queryFn: getBookings,
  });

  const createBookingMutation = useMutation({
    mutationFn: (newBooking: Omit<ContestBooking, 'id' | 'quotedAt'>) => 
      createContestBooking(newBooking),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    bookings: bookingsQuery.data || [],
    isLoading: bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    refetch: bookingsQuery.refetch,
    createBooking: createBookingMutation.mutateAsync,
    isCreating: createBookingMutation.isPending,
  };
}

export function useBookingDetail(bookingId: string | null) {
  const queryClient = useQueryClient();

  const bookingQuery = useQuery({
    queryKey: ['bookings', 'detail', bookingId],
    queryFn: () => {
      if (!bookingId) return null;
      return getBooking(bookingId);
    },
    enabled: !!bookingId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ 
      status, 
      details 
    }: { 
      status: ContestBooking['status']; 
      details: {
        paymentMethod?: string;
        paymentReference?: string;
        cancellationReason?: string;
        adminName: string;
        adminRole: any;
      }
    }) => {
      if (!bookingId) throw new Error('No booking selected');
      return updateBookingStatus(bookingId, status, details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
    },
  });

  return {
    booking: bookingQuery.data,
    isLoading: bookingQuery.isLoading,
    isError: bookingQuery.isError,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
  };
}
