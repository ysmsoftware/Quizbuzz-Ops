'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { Search, Globe, ChevronRight, CornerDownLeft, X } from 'lucide-react';
import { useOrganizations } from '@/lib/hooks/useOrganizations';
import { Organization } from '@/lib/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { organizations } = useOrganizations({ search: query, limit: 8 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle outside click and keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => 
          organizations && prev < organizations.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (organizations && organizations[selectedIndex]) {
          handleSelect(organizations[selectedIndex]);
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, organizations, selectedIndex]);

  const handleSelect = (org: Organization) => {
    router.push(`/dashboard/organizations?orgId=${org.id}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 pointer-events-auto">
          {/* Backdrop Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden relative z-50 flex flex-col"
            ref={containerRef}
          >
            {/* Search Input Area */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/40">
              <Search className="h-5 w-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search organizations by name, slug, contact email..."
                className="w-full bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground text-sm font-sans"
              />
              <button
                onClick={onClose}
                className="p-1 rounded-md hover:bg-secondary/50 text-muted-foreground transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results Area */}
            <div className="max-h-[300px] overflow-y-auto p-2">
              {!organizations || organizations.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground font-sans">
                  No matching organizations found.
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground font-sans">
                    Organizations ({organizations.length})
                  </div>
                  {organizations.map((org, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={org.id}
                        onClick={() => handleSelect(org)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-sans transition-colors ${
                          isSelected
                            ? 'bg-primary/15 text-foreground'
                            : 'hover:bg-secondary/30 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-1.5 rounded-md shrink-0 ${
                            org.status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                          }`}>
                            <Globe className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <span className="font-semibold text-foreground leading-none block">{org.name}</span>
                            <span className="text-[11px] text-muted-foreground mt-0.5 block">
                              slug: <span className="font-mono">{org.slug}</span> • Contact: {org.contactPerson.name}
                            </span>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="flex items-center gap-1 text-[11px] text-primary font-mono shrink-0">
                            <span>Open</span>
                            <CornerDownLeft className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Commands Helper */}
            <div className="px-4 py-2 bg-secondary/30 border-t border-border/40 flex justify-between items-center text-[10px] text-muted-foreground font-sans">
              <div className="flex gap-4">
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/50 bg-card font-mono">↑↓</kbd> Navigate</span>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/50 bg-card font-mono">Enter</kbd> Select</span>
              </div>
              <div>
                <span><kbd className="px-1.5 py-0.5 rounded border border-border/50 bg-card font-mono">ESC</kbd> Close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
