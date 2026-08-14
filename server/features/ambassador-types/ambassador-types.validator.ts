import { z } from 'zod';

// Mirrors ApplicationFieldDef in ambassador-types.types.ts — kept as a literal
// Zod shape (not z.infer'd into the type) so the wire contract with
// Quizbuzz-new's backend (which owns its own identical hand-written
// ApplicationFieldDef type) is checked structurally at every boundary,
// not just trusted to stay in sync by convention.
const applicationFieldSchema = z
  .object({
    key: z
      .string()
      .min(1)
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'key must be a valid identifier, e.g. "graduationYear"'),
    label: z.string().min(1),
    type: z.enum(['TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'DATE']),
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
  })
  .refine((f) => f.type !== 'SELECT' || (f.options && f.options.length > 0), {
    message: 'SELECT fields must have at least one option',
    path: ['options'],
  });

const applicationFieldsSchema = z.array(applicationFieldSchema).superRefine((fields, ctx) => {
  const keys = fields.map((f) => f.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate field key(s): ${[...new Set(dupes)].join(', ')}` });
  }
});

export const ambassadorTypeCreateSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'key must be lowercase snake_case, e.g. "student"'),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  proofFieldLabel: z.string().min(1).max(100).default('Identity / Enrollment Proof'),
  applicationFields: applicationFieldsSchema.default([]),
});

export const ambassadorTypeUpdateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  proofFieldLabel: z.string().min(1).max(100).optional(),
  applicationFields: applicationFieldsSchema.optional(),
  isActive: z.boolean().optional(),
});

export const orgAccessSetSchema = z.object({ isEnabled: z.boolean() });

export type AmbassadorTypeCreateInput = z.infer<typeof ambassadorTypeCreateSchema>;
export type AmbassadorTypeUpdateInput = z.infer<typeof ambassadorTypeUpdateSchema>;
export type OrgAccessSetInput = z.infer<typeof orgAccessSetSchema>;
