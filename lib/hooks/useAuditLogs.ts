'use client';

import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, GetAuditLogsParams } from '@/lib/api/auditLog';

/**
 * Backs the Security Audit Ledger page. `filters` should be a stable object
 * (from useState) so react-query's key comparison only re-fetches when a
 * filter actually changed. We always request a 50-row page from the backend
 * (real, query-based pagination — not a client-side slice of a giant list),
 * and the view renders those 50 rows in a scrollable ~20-row-tall viewport.
 */
export function useAuditLogs(filters: GetAuditLogsParams = {}) {
  const auditLogsQuery = useQuery({
    queryKey: ['auditLogs', 'list', filters],
    queryFn: () => getAuditLogs(filters),
    placeholderData: (prev) => prev, // keep the table populated while paging/filtering instead of flashing empty
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
