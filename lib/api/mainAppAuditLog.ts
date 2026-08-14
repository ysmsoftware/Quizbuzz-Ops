'use client';

import { MainAppAuditLogEntry } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export interface GetMainAppAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  /** Domain-only match (e.g. "contest" matches every "contest.*" action) — ignored when `action` is also set. */
  actionPrefix?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  organizationId?: string;
  actorId?: string;
  /** Contains-match against the actor's denormalized display label. */
  actorName?: string;
  /** Contains-match against the target's denormalized display label. */
  targetLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedMainAppAuditLogs {
  data: MainAppAuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export async function getMainAppAuditLogs(
  params: GetMainAppAuditLogsParams = {}
): Promise<PaginatedMainAppAuditLogs> {
  const query = new URLSearchParams();
  query.set('page', String(params.page || 1));
  query.set('limit', String(params.limit || 50));
  if (params.action) query.set('action', params.action);
  if (params.actionPrefix) query.set('actionPrefix', params.actionPrefix);
  if (params.targetType) query.set('targetType', params.targetType);
  if (params.targetId) query.set('targetId', params.targetId);
  if (params.requestId) query.set('requestId', params.requestId);
  if (params.organizationId) query.set('organizationId', params.organizationId);
  if (params.actorId) query.set('actorId', params.actorId);
  if (params.actorName) query.set('actorName', params.actorName);
  if (params.targetLabel) query.set('targetLabel', params.targetLabel);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  return apiRequest<PaginatedMainAppAuditLogs>(`/api/v1/ops/audit-log/main-app?${query.toString()}`);
}
