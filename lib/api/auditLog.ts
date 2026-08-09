'use client';

import { AuditLogEntry } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { getCurrentSessionSync } from '@/lib/api/auth';
import { apiRequest } from '@/lib/api/utils';

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  /** Domain-only match (e.g. "org" matches every "org.*" action) — ignored when `action` is also set. */
  actionPrefix?: string;
  targetType?: string;
  targetId?: string;
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
  if (params.actorId) query.set('actorId', params.actorId);
  if (params.actorName) query.set('actorName', params.actorName);
  if (params.targetLabel) query.set('targetLabel', params.targetLabel);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  const response = await apiRequest<{
    data: Array<{
      id: string;
      actorId: string | null;
      actorLabel: string;
      action: string;
      targetType: string;
      targetId: string;
      targetLabel: string;
      metadata: any;
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

/**
 * Mock-domain audit writer — still used by lib/api/bookings.ts (bookings,
 * impersonation), which remain mocked pending later phases. Not the real
 * audit trail: server/audit/audit-writer.ts is what backs getAuditLogs()
 * above. Remove this once those domains get real backends. Feature flags no
 * longer use this — they write through server/audit/audit-writer.ts now.
 */
export function writeAuditLogEntry(
  action: string,
  targetType: 'organization' | 'plan' | 'payment',
  targetId: string,
  targetLabel: string,
  metadata: any
): AuditLogEntry {
  const db = getDatabase();
  const session = getCurrentSessionSync();
  const entry: AuditLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    actorAdminName: session?.name || 'System',
    actorAdminRole: session?.role || 'SUPER_ADMIN',
    action,
    targetType,
    targetId,
    targetLabel,
    metadata,
    createdAt: new Date().toISOString(),
  };
  if (!db.auditLogs) {
    db.auditLogs = [];
  }
  db.auditLogs.unshift(entry);
  saveDatabase(db);
  return entry;
}
