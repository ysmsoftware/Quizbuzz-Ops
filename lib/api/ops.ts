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
  College,
  Department,
  UnlistedCollege,
  UnlistedDepartment,
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

// ─── College / Department catalog ──────────────────────────────
// Curated reference data, mirrored write-through into the main app's own
// database — see quizbuzz-ops-next College.repository.ts for the sync.

export async function getColleges(): Promise<College[]> {
  return apiRequest<College[]>('/api/v1/ops/colleges');
}

export async function createCollege(input: {
  name: string;
  state?: string;
  district?: string;
  city?: string;
}): Promise<College> {
  return apiRequest<College>('/api/v1/ops/colleges', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCollege(
  id: string,
  input: Partial<{ name: string; state: string; district: string; city: string; isActive: boolean }>
): Promise<College> {
  return apiRequest<College>(`/api/v1/ops/colleges/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteCollege(id: string): Promise<void> {
  await apiRequest<null>(`/api/v1/ops/colleges/${id}`, { method: 'DELETE' });
}

export async function getCollegeDepartments(collegeId: string): Promise<Department[]> {
  return apiRequest<Department[]>(`/api/v1/ops/colleges/${collegeId}/departments`);
}

export async function createDepartment(collegeId: string, input: { name: string }): Promise<Department> {
  return apiRequest<Department>(`/api/v1/ops/colleges/${collegeId}/departments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDepartment(
  collegeId: string,
  departmentId: string,
  input: Partial<{ name: string; isActive: boolean }>
): Promise<Department> {
  return apiRequest<Department>(`/api/v1/ops/colleges/${collegeId}/departments/${departmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// "Other" submissions from contest registration — colleges/departments typed as free text
// because they weren't in the catalog, so ops can see what's worth adding.
export async function getUnlistedRequests(): Promise<{ colleges: UnlistedCollege[]; departments: UnlistedDepartment[] }> {
  return apiRequest<{ colleges: UnlistedCollege[]; departments: UnlistedDepartment[] }>('/api/v1/ops/colleges/unlisted');
}

// "Skip" on one unlisted row — it's a live aggregate, not a stored queue, so this just
// remembers not to show this college/department pair again rather than deleting anything.
export async function dismissUnlistedCollege(name: string): Promise<void> {
  await apiRequest<null>('/api/v1/ops/colleges/unlisted/dismiss', {
    method: 'POST',
    body: JSON.stringify({ type: 'COLLEGE', collegeKey: name }),
  });
}

export async function dismissUnlistedDepartment(collegeKey: string, department: string): Promise<void> {
  await apiRequest<null>('/api/v1/ops/colleges/unlisted/dismiss', {
    method: 'POST',
    body: JSON.stringify({ type: 'DEPARTMENT', collegeKey, department }),
  });
}

// Platform-wide app logo — lives in the main app's own DB; this dashboard is
// a thin remote admin UI over it (see server/features/app-settings).
export async function getAppLogo(): Promise<{ appLogoUrl: string | null }> {
  return apiRequest<{ appLogoUrl: string | null }>('/api/v1/ops/app-logo');
}

export async function uploadAppLogo(input: { fileData: string; fileName: string }): Promise<{ appLogoUrl: string | null }> {
  return apiRequest<{ appLogoUrl: string | null }>('/api/v1/ops/app-logo', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function removeAppLogo(): Promise<void> {
  await apiRequest<null>('/api/v1/ops/app-logo', { method: 'DELETE' });
}
