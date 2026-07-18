'use client';

import { AuditLogEntry } from '@/lib/types';
import { getDatabase, saveDatabase } from '@/lib/data/db';
import { simulateLatency } from '@/lib/api/utils';
import { getCurrentSessionSync } from '@/lib/api/auth';

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  await simulateLatency(100, 300);
  const db = getDatabase();
  if (!db.auditLogs) {
    db.auditLogs = [];
  }
  return db.auditLogs;
}

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
