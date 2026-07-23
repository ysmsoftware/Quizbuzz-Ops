'use client';

import { AuditLogEntry } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { getCurrentSessionSync } from '@/lib/api/auth';
import { apiRequest } from '@/lib/api/utils';

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
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
  }>('/api/v1/ops/audit-log?limit=100');

  return response.data.map((entry) => {
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
}

/**
 * Mock-domain audit writer — still used by lib/api/{ops,bookings}.ts and
 * OrganizationDetailView.tsx (feature flags, bookings, impersonation), which remain
 * mocked pending later phases. Not the real audit trail: server/audit/audit-writer.ts
 * is what backs getAuditLogs() above. Remove this once those domains get real backends.
 */
export function writeAuditLogEntry(
  action: string,
  targetType: 'organization' | 'plan' | 'payment' | 'pricing_config' | 'booking' | 'feature_flag',
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
