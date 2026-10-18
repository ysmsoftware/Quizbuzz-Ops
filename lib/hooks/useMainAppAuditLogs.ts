'use client';

import { useQuery } from '@tanstack/react-query';
import { getMainAppAuditLogs, getMainAppAuditActions, GetMainAppAuditLogsParams } from '@/lib/api/mainAppAuditLog';
import { MAIN_AUDIT_GROUPS, mergeActionGroups } from '@/lib/constants/audit-actions';

/** Mirrors useAuditLogs.ts — same shape, backs the "Main Application" audit tab instead. */
export function useMainAppAuditLogs(filters: GetMainAppAuditLogsParams = {}) {
  const auditLogsQuery = useQuery({
    queryKey: ['mainAppAuditLogs', 'list', filters],
    queryFn: () => getMainAppAuditLogs(filters),
    placeholderData: (prev) => prev,
  });

  return {
    logs: auditLogsQuery.data?.data || [],
    pagination: {
      total: auditLogsQuery.data?.total || 0,
      page: auditLogsQuery.data?.page || filters.page || 1,
      limit: auditLogsQuery.data?.limit || filters.limit || 50,
    },
    isLoading: auditLogsQuery.isLoading,
    isFetching: auditLogsQuery.isFetching,
    isError: auditLogsQuery.isError,
    refetch: auditLogsQuery.refetch,
  };
}

/** Operation/Action dropdown options: the catalogue plus any action the main app has actually written. */
export function useMainAppAuditActionGroups() {
  const { data } = useQuery({ queryKey: ['mainAppAuditLogs', 'actions'], queryFn: getMainAppAuditActions, staleTime: 5 * 60_000 });
  return mergeActionGroups(MAIN_AUDIT_GROUPS, data);
}
