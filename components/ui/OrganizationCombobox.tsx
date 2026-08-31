'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Building2 } from 'lucide-react';
import { useOrganizations } from '@/lib/hooks/useOrganizations';

// No shared `cn` helper exists in this app (components here build conditional
// classNames with plain template strings) — small local join to match.
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface OrganizationComboboxProps {
  value: string; // selected Organization.id — this is still what gets submitted to the API
  onChange: (orgId: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Org picker for the "grant this org access" forms (Feature Flags org overrides,
 * Ambassador Type org access). The API still takes a plain organizationId string —
 * this only changes how an admin *finds* that id: search/select by name and owner
 * instead of having to already know/paste a raw id. Reuses useOrganizations() as-is,
 * the same hook the Organizations list page already uses.
 */
export function OrganizationCombobox({ value, onChange, placeholder = 'Select an organization…', className }: OrganizationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // A generous single page — this is an internal ops picker, not a paginated
  // table; the tenant count doesn't warrant server-side search for this UI.
  const { organizations, isLoading, isError, error, refetch } = useOrganizations({ limit: 500 });

  const selected = useMemo(() => organizations?.find((o) => o.id === value), [organizations, value]);

  const filtered = useMemo(() => {
    const list = organizations ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug?.toLowerCase().includes(q) ||
        o.ownerName?.toLowerCase().includes(q) ||
        o.ownerEmail?.toLowerCase().includes(q)
    );
  }, [organizations, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-8 px-2 flex items-center justify-between gap-2 text-xs rounded-md bg-background border border-border/40 text-foreground cursor-pointer"
      >
        <span className={cx('truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[260px] bg-popover border border-border/50 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or owner…"
              className="w-full bg-transparent text-xs outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {isLoading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Loading organizations…</p>
            ) : isError ? (
              <div className="px-3 py-2 space-y-1">
                <p className="text-xs text-destructive">
                  Couldn&apos;t load organizations{error?.message ? `: ${error.message}` : '.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {organizations && organizations.length > 0
                  ? `No organizations match "${search}".`
                  : 'No organizations found.'}
              </p>
            ) : (
              filtered.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => {
                    onChange(org.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cx(
                    'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-secondary/60 cursor-pointer',
                    org.id === value && 'bg-primary/10'
                  )}
                >
                  <Building2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {org.ownerName || org.ownerEmail || 'No owner on record'}
                      {org.slug ? ` · ${org.slug}` : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
