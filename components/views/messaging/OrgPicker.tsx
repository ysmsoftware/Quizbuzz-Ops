'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Search, X } from 'lucide-react';
import { useOrganizations } from '@/lib/hooks/useOrganizations';

export interface OrgPickerOption {
  id: string;
  name: string;
  ownerEmail: string;
}

interface OrgPickerProps {
  value: OrgPickerOption | null;
  onChange: (org: OrgPickerOption | null) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable organization combobox — type to search by name/slug, pick from
 * the dropdown. Built as a standalone component (not inlined into a single
 * page) specifically so it can be reused anywhere else in the dashboard that
 * needs an org lookup (e.g. filter bars, compose forms).
 */
export default function OrgPicker({ value, onChange, placeholder = 'Search organizations...', className = '' }: OrgPickerProps) {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { organizations, isLoading } = useOrganizations({ search: term, limit: 8 });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (value) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 text-xs bg-secondary/25 border border-border/50 rounded-lg text-foreground ${className}`}>
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold block truncate">{value.name}</span>
          <span className="text-[10px] text-muted-foreground block truncate">{value.ownerEmail}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary/60 shrink-0 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 text-xs bg-secondary/20 focus:bg-card border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground"
        />
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-card border border-border/50 rounded-lg shadow-lg">
          {isLoading ? (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">Searching...</div>
          ) : organizations && organizations.length > 0 ? (
            organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  onChange({ id: org.id, name: org.name, ownerEmail: org.ownerEmail });
                  setTerm('');
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 transition-colors flex flex-col cursor-pointer"
              >
                <span className="font-semibold text-foreground truncate">{org.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">{org.ownerEmail}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              {term ? 'No organizations match your search.' : 'Start typing to search organizations.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
