'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentSession, login, logout, getCurrentSessionSync, verifyOtpCode } from '@/lib/api/auth';
import { AdminRole, AdminSession } from '@/lib/types';

export function useCurrentAdmin() {
  const queryClient = useQueryClient();

  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getCurrentSession,
    initialData: () => getCurrentSessionSync() || undefined,
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string; role?: AdminRole }) =>
      login(email, password),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      verifyOtpCode(email, otp),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'session'], data);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'session'], null);
      queryClient.clear();
    },
  });

  const hasPermission = (action: string): boolean => {
    if (!session) return false;
    const role = session.role;
    
    // Simple permission lookup table
    switch (role) {
      case 'SUPER_ADMIN':
        return true; // Super Admins can do anything
      case 'SUPPORT':
        // Support can view, and initiate impersonation, but cannot do billing refunds or plan price updates
        return !['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'ORG_DELETE'].includes(action);
      case 'BILLING_ADMIN':
        // Billing Admins can manage plans, issue refunds, view, but cannot suspend/activate orgs or view secure system audit logs
        return ['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'PLAN_UPDATE', 'BILLING_VIEW'].includes(action);
      default:
        return false;
    }
  };

  return {
    admin: session,
    isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isVerifyingOtp: verifyOtpMutation.isPending,
    verifyOtpError: verifyOtpMutation.error,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
    hasPermission,
    refetchSession: refetch,
  };
}
