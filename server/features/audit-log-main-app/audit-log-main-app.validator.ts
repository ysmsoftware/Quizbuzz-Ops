import { z } from 'zod';
import { paginationFields, dateRangeFields } from '../../http/query-schemas';

// targetType/actorType are the main app's own enums (AuditTargetType /
// AuditActorType in Quizbuzz-new/backend/prisma/schema.prisma) — deliberately
// validated as plain strings here rather than z.nativeEnum against ops's own
// (different) AuditTargetType, since this reads the main app's table raw via
// queryMainDb, not through ops's Prisma client.
export const mainAppAuditLogListQuerySchema = z.object({
  ...paginationFields(20),
  action: z.string().optional(),
  actionPrefix: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  requestId: z.string().optional(),
  organizationId: z.string().optional(),
  actorId: z.string().optional(),
  actorName: z.string().optional(),
  targetLabel: z.string().optional(),
  ...dateRangeFields,
});

export type MainAppAuditLogListQueryInput = z.infer<typeof mainAppAuditLogListQuerySchema>;
