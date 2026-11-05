'use client';

import React from 'react';
import { X } from 'lucide-react';

export const fieldClass = 'w-full px-3 py-2 rounded-md bg-background border border-input focus:ring-1 focus:ring-primary';

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block font-semibold text-foreground mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The frame every billing dialog shares: title, scrolling form, Cancel and a submit button. */
export function InvoiceModal({ title, onClose, onSubmit, submitLabel, isSubmitting, disabled, children }: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-card border border-border/80 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border/50 bg-muted/20">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"><X className="h-5 w-5" /></button>
        </div>
        <form
          className="p-6 space-y-4 text-xs overflow-y-auto"
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        >
          {children}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border/40">
            <button type="button" onClick={onClose} className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted">Cancel</button>
            <button type="submit" disabled={isSubmitting || disabled} className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50">
              {isSubmitting ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
