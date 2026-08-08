'use client';

import React from 'react';
import { Eye, Loader2, MailOpen } from 'lucide-react';

interface MessagePreviewPanelProps {
  recipient: string;
  subject: string | null;
  html: string | null;
  isLoading: boolean;
  hasTemplate: boolean;
}

/**
 * Renders the exact HTML the /preview endpoint returns — that endpoint runs
 * the same template builder the real send path uses, so this is a
 * byte-accurate "what the recipient will actually see," not an approximation.
 * The white card is intentional: real inbox previews render on a white
 * background regardless of the dashboard's own light/dark theme.
 */
export default function MessagePreviewPanel({ recipient, subject, html, isLoading, hasTemplate }: MessagePreviewPanelProps) {
  return (
    <div className="flex flex-col h-full bg-secondary/10 border border-border/40 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border/40 bg-secondary/20 flex items-center gap-1.5 shrink-0">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Preview</span>
        {isLoading && <Loader2 className="h-3 w-3 text-muted-foreground animate-spin ml-auto" />}
      </div>

      {!hasTemplate ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-2">
          <MailOpen className="h-7 w-7 text-muted-foreground/50" />
          <p className="text-[11px] text-muted-foreground">Pick a template to preview exactly what the recipient will receive.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-border/30 space-y-0.5 shrink-0 bg-card/50">
            <p className="text-[10px] text-muted-foreground truncate"><span className="font-semibold text-foreground/80">To:</span> {recipient || '—'}</p>
            <p className="text-[11px] font-semibold text-foreground truncate">{subject || 'Untitled message'}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 bg-white">
            {html ? (
              <div className="text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground/70">Rendering...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
