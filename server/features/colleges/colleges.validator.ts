import { z } from 'zod';

const regionField = () => z.string().max(100).trim().optional();

export const collegeCreateSchema = z.object({
  name: z.string().min(1).max(200),
  state: regionField(),
  district: regionField(),
  city: regionField(),
});

export const collegeUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  state: regionField(),
  district: regionField(),
  city: regionField(),
  isActive: z.boolean().optional(),
});

export const departmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
});

export const departmentUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

export const dismissUnlistedSchema = z
  .object({
    type: z.enum(['COLLEGE', 'DEPARTMENT']),
    collegeKey: z.string().min(1),
    department: z.string().min(1).optional(),
  })
  .refine((data) => data.type === 'COLLEGE' || !!data.department, {
    message: 'department is required when type is DEPARTMENT',
    path: ['department'],
  });

export type CollegeCreateInput = z.infer<typeof collegeCreateSchema>;
export type CollegeUpdateInput = z.infer<typeof collegeUpdateSchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
export type DismissUnlistedInput = z.infer<typeof dismissUnlistedSchema>;
