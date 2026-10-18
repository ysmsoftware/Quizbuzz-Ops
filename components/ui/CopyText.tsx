'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Click-to-copy monospace value (ids, Razorpay references). Renders "—" for empty. */
export default function CopyText({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground/60">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={`inline-flex items-center gap-1 font-mono hover:text-primary cursor-pointer text-left ${className}`}
      title="Copy"
    >
      <span className="break-all">{value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : <Copy className="h-3 w-3 shrink-0 opacity-50" />}
    </button>
  );
}
