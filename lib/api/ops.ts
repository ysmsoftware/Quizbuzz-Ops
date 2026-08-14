'use client';

import { getDatabase } from '@/lib/data/db';
import {
  InfraStatus,
  ScalingConfig,
  FeatureFlag,
  FeatureFlagOrgOverride,
  AmbassadorType,
  AmbassadorApplicationFieldDef,
  AmbassadorTypeOrgAccess,
} from '@/lib/types';
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

// ─── Ambassador Type catalog ──────────────────────────────────
// Runtime-creatable (unlike feature flags above) — see AmbassadorTypesView.tsx
// and ambassador-incentive-program-plan.md §0.3/§1.2 for why this is a
// separate, simpler mechanism instead of more flag entries.

export async function getAmbassadorTypes(): Promise<AmbassadorType[]> {
  return apiRequest<AmbassadorType[]>('/api/v1/ops/ambassador-types');
}

export async function createAmbassadorType(input: {
  key: string;
  label: string;
  description?: string;
  proofFieldLabel: string;
  applicationFields: AmbassadorApplicationFieldDef[];
}): Promise<AmbassadorType> {
  return apiRequest<AmbassadorType>('/api/v1/ops/ambassador-types', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAmbassadorType(
  key: string,
  input: Partial<{
    label: string;
    description: string;
    proofFieldLabel: string;
    applicationFields: AmbassadorApplicationFieldDef[];
    isActive: boolean;
  }>
): Promise<AmbassadorType> {
  return apiRequest<AmbassadorType>(`/api/v1/ops/ambassador-types/${key}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function getAmbassadorTypeOrgAccess(key: string): Promise<AmbassadorTypeOrgAccess[]> {
  return apiRequest<AmbassadorTypeOrgAccess[]>(`/api/v1/ops/ambassador-types/${key}/organizations`);
}

export async function setAmbassadorTypeOrgAccess(
  key: string,
  orgId: string,
  isEnabled: boolean
): Promise<AmbassadorTypeOrgAccess> {
  return apiRequest<AmbassadorTypeOrgAccess>(`/api/v1/ops/ambassador-types/${key}/organizations/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify({ isEnabled }),
  });
}
