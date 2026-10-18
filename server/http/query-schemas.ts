import { z } from 'zod';

/** `page` + `limit` query fields shared by every paginated list endpoint. */
export const paginationFields = (defaultLimit = 20, maxLimit = 100) => ({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(maxLimit).default(defaultLimit),
});

/**
 * `dateFrom` / `dateTo` as ISO strings. The client converts a picked local day into
 * start-of-day / end-of-day (lib/dates.ts), so `dateTo` already covers the whole day.
 */
const isoString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
export const dateRangeFields = {
  dateFrom: isoString.optional(),
  dateTo: isoString.optional(),
};

/** Turn an optional ISO string from `dateRangeFields` into a Date (or undefined). */
export const toDate = (value?: string): Date | undefined => (value ? new Date(value) : undefined);
