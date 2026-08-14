'use client';

import { useQuery } from '@tanstack/react-query';
import { getMainAppAuditLogs, GetMainAppAuditLogsParams } from '@/lib/api/mainAppAuditLog';

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
