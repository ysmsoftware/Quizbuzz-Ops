'use client';

import { AuditLogEntry, AuditMetadata } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  /** Domain-only match (e.g. "org" matches every "org.*" action) — ignored when `action` is also set. */
  actionPrefix?: string;
  targetType?: string;
  targetId?: string;
  /** The org's own events plus events about it filed under another target (e.g. flag grants). */
  organizationId?: string;
  actorId?: string;
  /** Contains-match against the actor's denormalized display label (admin name). */
  actorName?: string;
  /** Contains-match against the target's denormalized display label (e.g. organization name). */
  targetLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function getAuditLogs(params: GetAuditLogsParams = {}): Promise<PaginatedAuditLogs> {
  const query = new URLSearchParams();
  query.set('page', String(params.page || 1));
  query.set('limit', String(params.limit || 50));
  if (params.action) query.set('action', params.action);
  if (params.actionPrefix) query.set('actionPrefix', params.actionPrefix);
  if (params.targetType) query.set('targetType', params.targetType);
  if (params.targetId) query.set('targetId', params.targetId);
  if (params.organizationId) query.set('organizationId', params.organizationId);
  if (params.actorId) query.set('actorId', params.actorId);
  if (params.actorName) query.set('actorName', params.actorName);
  if (params.targetLabel) query.set('targetLabel', params.targetLabel);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  const response = await apiRequest<{
    data: Array<{
      id: string;
      requestId: string | null;
      actorId: string | null;
      actorLabel: string;
      action: string;
      targetType: string;
      targetId: string;
      targetLabel: string;
      metadata: AuditMetadata;
      createdAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }>(`/api/v1/ops/audit-log?${query.toString()}`);

  const data = response.data.map((entry) => {
    // actorLabel is written as "${name} (${role})" or "SYSTEM" for unattended jobs
    const match = entry.actorLabel.match(/^(.*) \(([^)]+)\)$/);
    const actorAdminName = match ? match[1] : entry.actorLabel;
    const actorAdminRole = (match ? match[2] : entry.actorLabel === 'SYSTEM' ? 'SYSTEM' : 'SYSTEM') as AuditLogEntry['actorAdminRole'];

    return {
      id: entry.id,
      actorAdminName,
      actorAdminRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetLabel: entry.targetLabel,
      metadata: entry.metadata,
      requestId: entry.requestId,
      createdAt: entry.createdAt,
    };
  });

  return {
    data,
    total: response.total,
    page: response.page,
    limit: response.limit,
  };
}

/** Distinct actions ever written to the ops audit log. */
export const getAuditActions = () => apiRequest<string[]>('/api/v1/ops/audit-log/actions');
