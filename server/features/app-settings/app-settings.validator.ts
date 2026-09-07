import { z } from 'zod';

export const appLogoUploadSchema = z.object({
  fileData: z.string().min(1, 'fileData is required'),
  fileName: z.string().min(1, 'fileName is required'),
});

export type AppLogoUploadInput = z.infer<typeof appLogoUploadSchema>;
