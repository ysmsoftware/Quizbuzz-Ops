import { InfraStatus, ScalingConfig } from '@/lib/types';

// Placeholder data for the hidden Infra & Cost page — nothing real backs it yet, and nothing writes
// to it. Replace with a real endpoint when the page is wired up or delete both together.
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
