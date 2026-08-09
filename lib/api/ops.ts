'use client';

import { getDatabase } from '@/lib/data/db';
import { InfraStatus, ScalingConfig, FeatureFlag, FeatureFlagOrgOverride } from '@/lib/types';
import { simulateLatency } from '@/lib/api/utils';
import { apiRequest } from '@/lib/api/utils';

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

function mapFlag(f: any): FeatureFlag {
  return {
    id: f.id,
    key: f.key,
    label: f.label,
    description: f.description,
    isEnabled: f.isEnabled,
    scope: 'global',
    severity: f.severity,
    supportsOrgOverride: f.supportsOrgOverride,
    updatedAt: f.updatedAt,
    updatedByAdminName: f.updatedByName,
  };
}

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const raw = await apiRequest<any[]>('/api/v1/ops/feature-flags');
  return raw.map(mapFlag);
}

export async function toggleFeatureFlag(key: string, isEnabled: boolean): Promise<FeatureFlag> {
  const raw = await apiRequest<any>(`/api/v1/ops/feature-flags/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  });
  return mapFlag(raw);
}

export async function getFlagOrgOverrides(key: string): Promise<FeatureFlagOrgOverride[]> {
  return apiRequest<FeatureFlagOrgOverride[]>(`/api/v1/ops/feature-flags/${key}/organizations`);
}

export async function setFlagOrgOverride(
  key: string,
  orgId: string,
  isEnabled: boolean,
  reason: string
): Promise<FeatureFlagOrgOverride> {
  return apiRequest<FeatureFlagOrgOverride>(`/api/v1/ops/feature-flags/${key}/organizations/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify({ isEnabled, reason }),
  });
}

export async function removeFlagOrgOverride(key: string, orgId: string): Promise<void> {
  await apiRequest<any>(`/api/v1/ops/feature-flags/${key}/organizations/${orgId}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
