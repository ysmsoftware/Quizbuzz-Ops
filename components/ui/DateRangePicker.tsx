'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { DayPicker, type DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Calendar as CalendarIcon, ChevronDown, RefreshCw } from 'lucide-react';

/** Inclusive local-day range as yyyy-MM-dd strings (same shape as the main app's DateRangePicker). */
export interface DateRangeValue {
  start: string;
  end: string;
}

// yyyy-MM-dd → local-midnight Date (new Date('2026-09-30') would be UTC midnight).
const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Two-month range picker — mirrors Quizbuzz-new/frontend/components/ui/date-range-picker.tsx
 * (react-day-picker, range mode). Dropdown/click-outside handling follows
 * OrganizationCombobox rather than pulling in a popover library.
 */
export default function DateRangePicker({
  value,
  onChange,
  className = '',
}: {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selected: DateRange | undefined = value?.start
    ? { from: parseDay(value.start), to: value.end ? parseDay(value.end) : undefined }
    : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    if (!range?.from) return onChange(null);
    const start = format(range.from, 'yyyy-MM-dd');
    onChange({ start, end: range.to ? format(range.to, 'yyyy-MM-dd') : start });
  };

  const label = !value?.start
    ? 'Date range'
    : value.start === value.end
      ? format(parseDay(value.start), 'MMM dd, yyyy')
      : `${format(parseDay(value.start), 'MMM dd, yyyy')} – ${format(parseDay(value.end), 'MMM dd, yyyy')}`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center justify-between gap-2 px-3 h-9 w-full sm:w-[260px] text-xs rounded-lg border bg-secondary/20 transition-all cursor-pointer ${
          open ? 'border-primary ring-2 ring-primary/10' : 'border-border/40 hover:border-muted-foreground/30'
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className={`truncate ${value ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{label}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute z-30 mt-1 left-0 p-4 bg-popover text-popover-foreground border border-border/50 rounded-xl shadow-xl max-w-[calc(100vw-2rem)] overflow-x-auto"
        >
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            defaultMonth={selected?.from}
            showOutsideDays={false}
            style={
              {
                '--rdp-accent-color': 'var(--primary)',
                '--rdp-accent-background-color': 'color-mix(in oklab, var(--primary) 12%, transparent)',
                '--rdp-day-height': '34px',
                '--rdp-day-width': '34px',
                '--rdp-day_button-height': '32px',
                '--rdp-day_button-width': '32px',
                fontSize: '12px',
              } as CSSProperties
            }
            classNames={{ months: 'rdp-months flex flex-col md:flex-row gap-6' }}
          />
          {value && (
            <div className="flex justify-end border-t border-border/40 pt-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:text-rose-600 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" /> Clear range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
