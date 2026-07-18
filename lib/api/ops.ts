'use client';

import { getDatabase, saveDatabase } from '@/lib/data/db';
import { InfraStatus, ScalingConfig, FeatureFlag } from '@/lib/types';
import { simulateLatency } from '@/lib/api/utils';
import { getCurrentSessionSync } from '@/lib/api/auth';
import { writeAuditLogEntry } from '@/lib/api/auditLog';

export async function getInfraStatus(): Promise<InfraStatus> {
  await simulateLatency(100, 200);
  const db = getDatabase();
  return db.infraStatus;
}

export async function getScalingConfig(): Promise<ScalingConfig> {
  await simulateLatency(100, 200);
  const db = getDatabase();
  return db.scalingConfig;
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  await simulateLatency(100, 200);
  const db = getDatabase();
  return db.featureFlags || [];
}

export async function toggleFeatureFlag(key: string, isEnabled: boolean): Promise<FeatureFlag> {
  await simulateLatency(100, 250);
  const db = getDatabase();
  const session = getCurrentSessionSync();
  
  if (!db.featureFlags) {
    db.featureFlags = [];
  }
  
  const flagIndex = db.featureFlags.findIndex(f => f.key === key);
  if (flagIndex === -1) {
    throw new Error(`Feature flag with key '${key}' not found`);
  }
  
  const oldFlag = db.featureFlags[flagIndex];
  const oldVal = oldFlag.isEnabled;
  
  const updatedFlag: FeatureFlag = {
    ...oldFlag,
    isEnabled,
    updatedAt: new Date().toISOString(),
    updatedByAdminName: session?.name || 'System Operator'
  };
  
  db.featureFlags[flagIndex] = updatedFlag;
  
  // Write PlatformAuditLog entry
  writeAuditLogEntry(
    'feature_flag.toggled',
    'feature_flag',
    key,
    updatedFlag.label,
    { from: oldVal, to: isEnabled }
  );
  
  saveDatabase(db);
  
  return updatedFlag;
}
