import { z } from 'zod';
import { AuditTargetType } from '@prisma/client';
import { paginationFields, dateRangeFields } from '../../http/query-schemas';

export const auditLogListQuerySchema = z.object({
  ...paginationFields(20),
  action: z.string().optional(),
  actionPrefix: z.string().optional(),
  targetType: z.nativeEnum(AuditTargetType).optional(),
  targetId: z.string().optional(),
  requestId: z.string().optional(),
  /** Org-scoped view: the org's own events plus events about it filed under another target (flag overrides). */
  organizationId: z.string().optional(),
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  targetLabel: z.string().optional(),
  ...dateRangeFields,
});

export type AuditLogListQueryInput = z.infer<typeof auditLogListQuerySchema>;
