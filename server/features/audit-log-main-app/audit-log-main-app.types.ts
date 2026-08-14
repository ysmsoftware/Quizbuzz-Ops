export interface MainAppAuditLogListQuery {
  page: number;
  limit: number;
  action?: string;
  // Domain-only filter (e.g. "contest" matches "contest.published",
  // "contest.cancelled", ...) — mirrors audit-log's actionPrefix.
  actionPrefix?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  // The main app is multi-tenant — ops's own audit log has no equivalent.
  organizationId?: string;
  actorId?: string;
  actorName?: string;
  targetLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MainAppAuditLogEntryResponse {
  id: string;
  requestId: string | null;
  organizationId: string | null;
  actorId: string | null;
  actorType: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface MainAppAuditLogListResult {
  data: MainAppAuditLogEntryResponse[];
  total: number;
  page: number;
  limit: number;
}
