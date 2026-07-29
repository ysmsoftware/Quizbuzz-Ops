'use client';

import { AuditLogEntry, InfraStatus, ScalingConfig, FeatureFlag } from '@/lib/types';

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

export const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: 'flag_maintenance',
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Activates maintenance window platform-wide. All live operations are suspended.',
    isEnabled: false,
    scope: 'global',
    updatedAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_pause_reg',
    key: 'new_registrations_paused',
    label: 'Pause Registrations',
    description: 'Temporarily pause registration for new contest participants across the platform.',
    isEnabled: false,
    scope: 'global',
    updatedAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_proctoring',
    key: 'proctoring_enabled_platform_wide',
    label: 'Platform-wide AI Proctoring',
    description: 'Enables AI proctoring services across all qualified organization contests.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_cert_auto',
    key: 'certificate_auto_delivery',
    label: 'Certificate Auto-delivery',
    description: 'Automatically deliver signed PDF certificates to participants completing a contest.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_analytics',
    key: 'enhanced_analytics_pipeline',
    label: 'Enhanced Analytics Pipeline',
    description: 'Streams raw candidate responses to the high-concurrency analytical engine.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
  {
    id: 'flag_razorpay',
    key: 'razorpay_gateway_active',
    label: 'Razorpay Payment Gateway',
    description: 'Accept live candidate registration payments via Razorpay merchant portal.',
    isEnabled: true,
    scope: 'global',
    updatedAt: new Date(Date.now() - 12 * 86400 * 1000).toISOString(),
    updatedByAdminName: 'System Auto-Config'
  },
];

export interface MockDatabase {
  auditLogs?: AuditLogEntry[];
  infraStatus: InfraStatus;
  scalingConfig: ScalingConfig;
  featureFlags: FeatureFlag[];
}

const LOCAL_STORAGE_KEY = 'quizbuzz_super_admin_mock_db';

export function getDatabase(): MockDatabase {
  if (typeof window === 'undefined') {
    return {
      auditLogs: [],
      infraStatus: INITIAL_INFRA_STATUS,
      scalingConfig: INITIAL_SCALING_CONFIG,
      featureFlags: INITIAL_FEATURE_FLAGS,
    };
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      let mutated = false;
      if (!parsed.infraStatus) { parsed.infraStatus = INITIAL_INFRA_STATUS; mutated = true; }
      if (!parsed.scalingConfig) { parsed.scalingConfig = INITIAL_SCALING_CONFIG; mutated = true; }
      if (!parsed.featureFlags || parsed.featureFlags.length === 0) { parsed.featureFlags = INITIAL_FEATURE_FLAGS; mutated = true; }
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
    featureFlags: INITIAL_FEATURE_FLAGS,
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
    featureFlags: INITIAL_FEATURE_FLAGS,
  };
  if (typeof window !== 'undefined') {
    saveDatabase(db);
  }
  return db;
}
