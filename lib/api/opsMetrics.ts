'use client';

import { OpsFleetSnapshot, OpsLiveContestSummary, OpsContestLiveSnapshot } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

export async function getOpsFleetSnapshot(): Promise<OpsFleetSnapshot> {
  return apiRequest<OpsFleetSnapshot>('/api/v1/ops/metrics/fleet');
}

export async function getOpsLiveContests(): Promise<OpsLiveContestSummary[]> {
  return apiRequest<OpsLiveContestSummary[]>('/api/v1/ops/metrics/contests');
}

export async function getOpsContestSnapshot(contestId: string): Promise<OpsContestLiveSnapshot> {
  return apiRequest<OpsContestLiveSnapshot>(`/api/v1/ops/metrics/contests/${encodeURIComponent(contestId)}`);
}
