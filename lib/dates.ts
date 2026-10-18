/** Inclusive local-day range as yyyy-MM-dd strings (what DateRangePicker emits). */
export interface DayRange {
  start: string;
  end: string;
}

/**
 * Local calendar day → ISO bound, so "29 Sep" means 29 Sep in the admin's timezone
 * and the end bound covers the WHOLE day (23:59:59.999). Passing a bare date string to
 * `new Date()` instead parses as UTC midnight, which is the off-by-timezone bug this
 * replaces.
 */
export function dayToIso(day: string | null | undefined, endOfDay: boolean): string | undefined {
  if (!day) return undefined;
  return new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString();
}

export function dayRangeToIso(range: DayRange | null | undefined): { dateFrom?: string; dateTo?: string } {
  return { dateFrom: dayToIso(range?.start, false), dateTo: dayToIso(range?.end, true) };
}
