'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCurrentSession, login, logout, getCurrentSessionSync, verifyOtpCode } from '@/lib/api/auth';
import { AdminRole, AdminSession } from '@/lib/types';

export function useCurrentAdmin() {
  const queryClient = useQueryClient();

  const { data: session, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getCurrentSession,
    initialData: () => getCurrentSessionSync() || undefined,
    enabled: typeof window !== 'undefined',
    // A transient failure (network blip, dev-mode double-invoke abort, a
    // 5xx) shouldn't be treated the same as a real 401 — retry once before
    // giving up. getCurrentSession() already only resolves to `null` (the
    // "you are logged out" signal) on a definitive 401 from both /me and
    // /refresh; anything else throws and lands here.
    retry: 1,
    retryDelay: 400,
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
        // Support can view, and initiate impersonation, but cannot do billing refunds, plan price updates, or manage feature flags
        return !['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'ORG_DELETE', 'FEATURE_FLAG_MANAGE'].includes(action);
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
    // True while the session is being validated/re-validated against the
    // server (including the initial background check that runs even when
    // `initialData` already made isLoading false). DashboardLayout waits
    // for this to settle before deciding the user is actually logged out.
    isFetching,
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
