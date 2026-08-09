import { FeatureFlagSeverity } from '@prisma/client';

export interface FeatureFlagDetail {
  id: string;
  key: string;
  label: string;
  description: string;
  isEnabled: boolean;
  severity: FeatureFlagSeverity;
  supportsOrgOverride: boolean;
  updatedAt: string;
  updatedByName: string;
}

export interface FeatureFlagOrgOverrideDetail {
  id: string;
  flagKey: string;
  organizationId: string;
  isEnabled: boolean;
  reason: string;
  createdByName: string;
  expiresAt: string | null;
  createdAt: string;
}
