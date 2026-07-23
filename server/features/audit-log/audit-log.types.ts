import { AuditTargetType } from '@prisma/client';

export interface AuditLogListQuery {
  page: number;
  limit: number;
  action?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  actorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogEntryResponse {
  id: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  targetLabel: string;
  metadata: any;
  createdAt: string;
}

export interface AuditLogListResult {
  data: AuditLogEntryResponse[];
  total: number;
  page: number;
  limit: number;
}
