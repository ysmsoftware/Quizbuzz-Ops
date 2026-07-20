'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import { SupportNote } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

interface OrgNotesTabProps {
  notes?: SupportNote[];
  authorName?: string;
  isAddingNote: boolean;
  addNote: (data: { authorName: string; body: string; tags: string[] }) => Promise<any>;
}

export default function OrgNotesTab({
  notes = [],
  authorName,
  isAddingNote,
  addNote,
}: OrgNotesTabProps) {
  const { toast } = useToast();
  const [noteBody, setNoteBody] = useState('');
  const [noteTags, setNoteTags] = useState('');

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) {
      toast('Text Required', 'Please input notes detail.', 'warning');
      return;
    }
    try {
      const tags = noteTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await addNote({
        authorName: authorName || 'Support Executive',
        body: noteBody,
        tags
      });
      toast('Note Appended', 'Support log note updated.', 'success');
      setNoteBody('');
      setNoteTags('');
    } catch (err: any) {
      toast('Note Failed', err.message || 'Operation failed.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 font-sans">
      {/* Note creation form */}
      <div className="lg:col-span-2 p-5 bg-card border border-border/30 rounded-xl shadow-sm space-y-4 h-fit">
        <div className="space-y-0.5">
          <h3 className="font-bold text-sm">Append Support Log Note</h3>
          <p className="text-[11px] text-muted-foreground">Add internal audit remarks regarding terms checks or billing discussions.</p>
        </div>

        <form onSubmit={handleAddNoteSubmit} className="space-y-3 font-sans">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Note Content</label>
            <textarea
              required
              rows={4}
              placeholder="Detail the interaction, discussion, or warning issued..."
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/15 focus:bg-card border border-border/55 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g. Support, Billing, Warning"
              value={noteTags}
              onChange={(e) => setNoteTags(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-secondary/15 focus:bg-card border border-border/55 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground font-mono"
            />
          </div>

          {/* Quick selects */}
          <div className="flex flex-wrap gap-1.5">
            {['Upgrade', 'Sales', 'Infringement', 'Abuse', 'Billing'].map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  const prev = noteTags ? noteTags.split(',').map(t => t.trim()) : [];
                  if (!prev.includes(tag)) {
                    const next = [...prev, tag].filter(Boolean).join(', ');
                    setNoteTags(next);
                  }
                }}
                className="px-2 py-0.5 text-[9px] font-semibold border border-border bg-secondary/10 hover:bg-secondary/40 text-muted-foreground rounded transition-all cursor-pointer"
              >
                +{tag}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isAddingNote}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/95 transition-all shadow-sm cursor-pointer"
          >
            {isAddingNote ? 'Appending Note...' : 'Add Note Entry'}
          </button>
        </form>
      </div>

      {/* Timeline */}
      <div className="lg:col-span-3 space-y-4">
        <h3 className="font-bold text-sm">Interact/Audit Timeline Notes</h3>
        
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {!notes || notes.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground border border-dashed border-border/30 rounded-xl bg-secondary/10">
              No support log notes recorded for this tenant.
            </div>
          ) : (
            notes.map((note) => (
              <div 
                key={note.id} 
                className="p-4 border border-border/30 bg-card rounded-xl shadow-sm space-y-2.5 font-sans relative"
              >
                <div className="flex justify-between items-center text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground">{note.authorName}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground font-mono">Operator</span>
                  </div>
                  <span className="text-muted-foreground font-mono">
                    {format(new Date(note.createdAt), 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{note.body}</p>

                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {note.tags.map((tag, idx) => (
                      <span 
                        key={idx} 
                        className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border border-border/40 bg-secondary/30 text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
