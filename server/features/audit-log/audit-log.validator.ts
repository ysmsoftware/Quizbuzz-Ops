import { z } from 'zod';
import { AuditTargetType } from '@prisma/client';

export const auditLogListQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  action: z.string().optional(),
  targetType: z.nativeEnum(AuditTargetType).optional(),
  targetId: z.string().optional(),
  actorId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type AuditLogListQueryInput = z.infer<typeof auditLogListQuerySchema>;
