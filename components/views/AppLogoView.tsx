'use client';

import React, { useRef, useState } from 'react';
import { useAppSettings } from '@/lib/hooks/useAppSettings';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { ImageIcon, Upload, X, Lock, Loader2 } from 'lucide-react';

const MAX_SIZE_MB = 2;
const ACCEPT = 'image/png,image/jpeg,image/svg+xml';

export default function AppLogoView() {
  const { appLogoUrl, isLoading, uploadAppLogo, isUploading, removeAppLogo, isRemoving } = useAppSettings();
  const { hasPermission } = useCurrentAdmin();
  const { toast } = useToast();
  const canManage = hasPermission('APP_SETTINGS_MANAGE');

  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setError(null);
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_SIZE_MB) {
      setError(`File size must be less than ${MAX_SIZE_MB}MB`);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setError('Invalid file type. Accepted: PNG, JPG, SVG');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      try {
        await uploadAppLogo({ fileData: dataUrl, fileName: file.name });
        toast('App Logo Updated', 'The QuizBuzz application logo has been updated.', 'success');
      } catch (err: any) {
        toast('Failed to Upload Logo', err?.message || 'Could not upload the app logo.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = async () => {
    try {
      await removeAppLogo();
      toast('App Logo Removed', 'The main app now falls back to its default bundled logo.', 'success');
    } catch (err: any) {
      toast('Failed to Remove Logo', err?.message || 'Could not remove the app logo.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-64 bg-secondary/30 rounded" />
        <div className="h-64 bg-card rounded-xl border border-border/30" />
      </div>
    );
  }

  const busy = isUploading || isRemoving;

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Application Logo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the QuizBuzz brand logo shown across the main application (site header, public pages). This is
          separate from each organization&apos;s own logo, which organizations manage themselves.
        </p>
      </div>

      {!canManage && (
        <div className="p-3 bg-secondary/30 border border-border/40 rounded-lg flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Only Super Admins can change the application logo.
        </div>
      )}

      <div className="bg-card rounded-xl border border-border/50 shadow-sm p-6 max-w-lg space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file) handleFile(file);
            e.currentTarget.value = '';
          }}
        />

        {appLogoUrl ? (
          <div className="relative w-full aspect-[3/1] bg-secondary/20 rounded-xl overflow-hidden border border-border/30 flex items-center justify-center">
            <img src={appLogoUrl} alt="App logo preview" className="max-h-full max-w-full object-contain p-4" />
            {canManage && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="absolute top-2 right-2 p-1.5 bg-destructive/90 rounded-lg hover:bg-destructive transition-colors shadow disabled:opacity-50"
                aria-label="Remove logo"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-full aspect-[3/1] bg-secondary/20 rounded-xl border border-dashed border-border/50 flex items-center justify-center text-xs text-muted-foreground">
            No app logo set — the main app is showing its default bundled logo
          </div>
        )}

        {canManage && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full h-9 flex items-center justify-center gap-2 text-sm font-medium rounded-md border border-border/50 hover:bg-secondary/40 transition-colors disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {appLogoUrl ? 'Replace Logo' : 'Upload Logo'}
          </button>
        )}

        {error && <p className="text-xs text-destructive font-medium">{error}</p>}
        <p className="text-xs text-muted-foreground">
          PNG, JPG or SVG · up to {MAX_SIZE_MB}MB · a wide/landscape mark works best for the site header
        </p>
      </div>
    </div>
  );
}
