'use client';

import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '@/lib/api/auditLog';

export function useAuditLogs() {
  const auditLogsQuery = useQuery({
    queryKey: ['auditLogs', 'list'],
    queryFn: getAuditLogs,
  });

  return {
    logs: auditLogsQuery.data || [],
    isLoading: auditLogsQuery.isLoading,
    isError: auditLogsQuery.isError,
    refetch: auditLogsQuery.refetch,
  };
}
