import { z } from 'zod';
import { ValidationError } from './errors';

export async function parseRequest<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<z.infer<T>> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(result.error.format());
    }
    return result.data;
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError({ _errors: ['Invalid or missing JSON body'] });
  }
}

export function parseQueryParams<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): z.infer<T> {
  const { searchParams } = new URL(req.url);
  const params: Record<string, any> = {};
  
  searchParams.forEach((value, key) => {
    // Collect duplicate params into array if needed, otherwise string
    if (params[key]) {
      if (Array.isArray(params[key])) {
        params[key].push(value);
      } else {
        params[key] = [params[key], value];
      }
    } else {
      params[key] = value;
    }
  });

  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationError(result.error.format());
  }
  return result.data;
}
