'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

type FilterValue = string | number | boolean | null | undefined;
// Defaults like `status: 'all'` / `open: false` are literal types; widen them so setFilter accepts any string / boolean.
type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T;
type Widened<F> = { [K in keyof F]: Widen<F[K]> };

interface Options<F> {
  /** Filter keys typed free-text (search boxes): the API only sees them after the user pauses. */
  debounce?: ReadonlyArray<keyof F>;
  debounceMs?: number;
}

/**
 * Filter + pagination state for a server-driven list, in one place.
 *
 *  - Changing ANY filter jumps back to page 1 (never request a page that no longer exists).
 *  - `filters` is what the inputs show (updates every keystroke); `params` is what to send
 *    to the API (debounced for the keys named in `debounce`, with the current `page`).
 *  - Empty strings / 'all' are dropped from `params`, so callers don't repeat that check.
 */
export function useTableQuery<F extends Record<string, FilterValue>>(defaults: F, options: Options<F> = {}) {
  const { debounce = [], debounceMs = 400 } = options;
  const [filters, setFilters] = useState<Widened<F>>(defaults as Widened<F>);
  const [page, setPage] = useState(1);

  // One debounced copy of the whole object keeps hook order stable regardless of key count.
  const debouncedFilters = useDebouncedValue(filters, debounceMs);

  const setFilter = useCallback(<K extends keyof F>(key: K, value: Widened<F>[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFilters(defaults as Widened<F>);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = useMemo(() => {
    const out: Record<string, Exclude<FilterValue, null>> = {};
    (Object.keys(filters) as Array<keyof F>).forEach((key) => {
      const source = debounce.includes(key) ? debouncedFilters : filters;
      const value = source[key];
      if (value === '' || value === 'all' || value === false || value == null) return;
      out[key as string] = value;
    });
    return out as { [K in keyof F]?: Exclude<Widened<F>[K], null | ''> } & { page: number };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedFilters]);

  const hasActiveFilters = useMemo(
    () => (Object.keys(filters) as Array<keyof F>).some((k) => filters[k] !== defaults[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters]
  );

  return { filters, params: { ...params, page } as typeof params, page, setPage, setFilter, reset, hasActiveFilters };
}
