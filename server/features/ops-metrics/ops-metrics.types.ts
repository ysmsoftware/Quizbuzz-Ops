// Mirrors Quizbuzz-new/backend/src/modules/ops-metrics/ops-metrics.types.ts —
// this app never re-derives these numbers, it just displays whatever the
// main app's /api/v1/ops/metrics/* endpoints already computed.

export interface InstanceHeartbeat {
  instanceId: string;
  role: 'backend' | 'worker';
  reportedAt: string;
  uptimeSec: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    heapLimitMb: number;
    heapUsedPct: number;
  };
  ws?: {
    activeConnections: number;
    maxConnections: number;
    draining: boolean;
  };
  redisHost: string;
}

export interface FleetSnapshot {
  reportingInstances: number;
  totals: {
    activeConnections: number;
    rssMb: number;
    heapUsedMb: number;
  };
  instances: InstanceHeartbeat[];
}

export interface LiveContestSummary {
  contestId: string;
  organizationId: string;
  title: string;
  status: string;
}

// Mirrors Quizbuzz-new/backend/src/modules/quiz/quiz.session.ts's
// RedisCounts / LiveParticipantRow — the shape getLiveSnapshot() returns.
export interface RedisCounts {
  waiting: number;
  active: number;
  submitted: number;
  disconnected: number;
}

export interface LiveParticipantRow {
  participantId: string;
  name: string;
  phase: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  violationCount: number;
  trustScore: number;
  isFlagged: boolean;
  lastActivityAt: string;
  isAlive: boolean;
}

export interface ContestLiveSnapshot {
  counts: RedisCounts;
  participants: LiveParticipantRow[];
}
