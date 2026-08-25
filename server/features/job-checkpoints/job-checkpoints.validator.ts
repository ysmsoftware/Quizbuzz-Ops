import { z } from 'zod';

// Reads the main app's scheduled_jobs / job_checkpoints tables raw via
// queryMainDb, same reasoning as audit-log-main-app.validator.ts — status
// validated as a plain string rather than z.nativeEnum against a locally
// generated Prisma enum, since this app doesn't own that schema.
export const jobCheckpointListQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
  jobId: z.string().optional(),
  requestId: z.string().optional(),
  queue: z.string().optional(),
  status: z.string().optional(),
  organizationId: z.string().optional(),
});

export type JobCheckpointListQueryInput = z.infer<typeof jobCheckpointListQuerySchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string().min(1),
});
