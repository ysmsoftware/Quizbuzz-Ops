import { AuditTargetType } from '@prisma/client';

export interface AuditLogListQuery {
  page: number;
  limit: number;
  action?: string;
  // Domain-only filter (e.g. "org" matches "org.suspended", "org.reactivated",
  // ...) — used when the UI's parent "Operation" dropdown is set but no
  // specific sub-"Action" has been picked yet. Ignored when `action` (an
  // exact match) is also present.
  actionPrefix?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  requestId?: string;
  actorId?: string;
  // Free-text, case-insensitive "contains" filters — actorLabel/targetLabel
  // are denormalized display strings on PlatformAuditLog (e.g. "Jane Doe
  // (SUPER_ADMIN)" / an organization's name), not IDs, so admins can search
  // by admin name or organization name without knowing the underlying id.
  actorName?: string;
  targetLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogEntryResponse {
  id: string;
  requestId: string | null;
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
