export type ApplicationFieldType = 'TEXT' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'SELECT' | 'DATE';

export interface ApplicationFieldDef {
  key: string;
  label: string;
  type: ApplicationFieldType;
  required: boolean;
  options?: string[]; // only meaningful when type === 'SELECT'
}

export interface AmbassadorTypeDetail {
  id: string;
  key: string;
  label: string;
  description: string | null;
  proofFieldLabel: string;
  applicationFields: ApplicationFieldDef[];
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationAmbassadorTypeAccessDetail {
  id: string;
  organizationId: string;
  ambassadorTypeId: string;
  isEnabled: boolean;
  updatedByName: string;
  updatedAt: string;
}
