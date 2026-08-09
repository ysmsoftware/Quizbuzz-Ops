'use client';

import { AuditLogEntry, InfraStatus, ScalingConfig } from '@/lib/types';

export const INITIAL_INFRA_STATUS: InfraStatus = {
  mode: 'idle',
  modeChangedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  activeAsgInstanceCount: 2,
  minAsgInstanceCount: 2,
  maxAsgInstanceCount: 10,
  elastiCacheStatus: 'not_provisioned',
  currentLiveContestIds: [],
  estimatedMonthToDateCostUsd: 142.50,
  estimatedMonthToDateCostBreakdown: { permanentInfra: 120.00, ephemeralInfra: 22.50 },
};

export const INITIAL_SCALING_CONFIG: ScalingConfig = {
  instanceCount: 2,
  maxWsConnectionsPerInstance: 1000,
  redisClusterSize: 1,
  queueConcurrency: 20,
  workerInstances: 4,
  wsHeartbeatIntervalMs: 15000,
  quizSessionTtlSeconds: 7200,
  rateLimitWindowSeconds: 600,
  rateLimitMax: 100,
  otpRateLimit: 5,
};

export interface MockDatabase {
  auditLogs?: AuditLogEntry[];
  infraStatus: InfraStatus;
  scalingConfig: ScalingConfig;
}

const LOCAL_STORAGE_KEY = 'quizbuzz_super_admin_mock_db';

export function getDatabase(): MockDatabase {
  if (typeof window === 'undefined') {
    return {
      auditLogs: [],
      infraStatus: INITIAL_INFRA_STATUS,
      scalingConfig: INITIAL_SCALING_CONFIG,
    };
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      let mutated = false;
      if (!parsed.infraStatus) { parsed.infraStatus = INITIAL_INFRA_STATUS; mutated = true; }
      if (!parsed.scalingConfig) { parsed.scalingConfig = INITIAL_SCALING_CONFIG; mutated = true; }
      if (!parsed.auditLogs) { parsed.auditLogs = []; mutated = true; }

      if (mutated) {
        saveDatabase(parsed);
      }
      return parsed;
    } catch (e) {
      console.error('Failed to parse stored mock DB, fallback to seed', e);
    }
  }

  const db: MockDatabase = {
    auditLogs: [],
    infraStatus: INITIAL_INFRA_STATUS,
    scalingConfig: INITIAL_SCALING_CONFIG,
  };
  saveDatabase(db);
  return db;
}

export function saveDatabase(db: MockDatabase): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
}

export function resetDatabaseToSeed(): MockDatabase {
  const db: MockDatabase = {
    auditLogs: [],
    infraStatus: INITIAL_INFRA_STATUS,
    scalingConfig: INITIAL_SCALING_CONFIG,
  };
  if (typeof window !== 'undefined') {
    saveDatabase(db);
  }
  return db;
}
