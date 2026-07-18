'use client';

import React, { useState } from 'react';
import { useOps } from '@/lib/hooks/useOps';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { 
  Sliders, 
  HelpCircle, 
  AlertOctagon, 
  User, 
  Clock, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  Play, 
  Pause,
  AlertTriangle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ConfirmationState {
  isOpen: boolean;
  flagKey: string;
  flagLabel: string;
  targetValue: boolean;
  title: string;
  message: string;
  type: 'critical' | 'warning';
}

export default function FeatureFlagsView() {
  const { featureFlags, isLoadingFlags, toggleFlag, isToggling } = useOps();
  const { admin } = useCurrentAdmin();
  const { toast } = useToast();
  
  // Modal dialog confirmation state
  const [confirmState, setConfirmState] = useState<ConfirmationState>({
    isOpen: false,
    flagKey: '',
    flagLabel: '',
    targetValue: false,
    title: '',
    message: '',
    type: 'warning',
  });

  const isSupport = admin?.role === 'SUPPORT';

  if (isLoadingFlags) {
    return (
      <div className="space-y-6 font-sans animate-pulse">
        <div className="h-10 w-48 bg-secondary/30 rounded" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border/30" />
          ))}
        </div>
      </div>
    );
  }

  const handleToggleClick = (flagKey: string, flagLabel: string, currentValue: boolean) => {
    if (isSupport) {
      toast('Permission Denied', 'Support operators are not authorized to modify platform feature flags.', 'error');
      return;
    }

    const nextValue = !currentValue;

    // Special verification rules for maintenance_mode and new_registrations_paused when turning ON
    if (flagKey === 'maintenance_mode' && nextValue === true) {
      setConfirmState({
        isOpen: true,
        flagKey,
        flagLabel,
        targetValue: nextValue,
        title: 'Activate Platform-Wide Maintenance Mode?',
        message: 'CRITICAL ACTION: This immediately suspends all active operations, contests, and admin controls across every single tenant organization on the platform. Current users will see a maintenance message.',
        type: 'critical',
      });
      return;
    }

    if (flagKey === 'new_registrations_paused' && nextValue === true) {
      setConfirmState({
        isOpen: true,
        flagKey,
        flagLabel,
        targetValue: nextValue,
        title: 'Pause All Candidate Registrations?',
        message: 'WARNING: This halts all participant registration queries and operations across all live and upcoming contests platform-wide. Existing registered candidates can still participate.',
        type: 'warning',
      });
      return;
    }

    // Direct toggle for all other cases
    executeToggle(flagKey, nextValue);
  };

  const executeToggle = async (key: string, isEnabled: boolean) => {
    try {
      await toggleFlag({ key, isEnabled });
      toast(
        'Feature Flag Updated', 
        `Successfully turned ${isEnabled ? 'ON' : 'OFF'} the "${key}" feature flag.`, 
        'success'
      );
      // Dispatch a custom event to tell the app shell to immediately update the maintenance banner
      window.dispatchEvent(new CustomEvent('quizbuzz_flag_updated', { detail: { key, isEnabled } }));
    } catch (err: any) {
      toast('Operation Failed', err?.message || 'Failed to update feature flag.', 'error');
    }
  };

  const handleConfirmAction = () => {
    executeToggle(confirmState.flagKey, confirmState.targetValue);
    setConfirmState(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="space-y-8 font-sans max-w-4xl mx-auto pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Sliders className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Ops Workspace</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Platform-Wide Feature Flags
          </h1>
          <p className="text-xs text-muted-foreground max-w-xl">
            Toggle global configurations to manage traffic spikes, deploy hotfixes, or activate emergency lockouts. All operations write directly to the persistent platform audit trail.
          </p>
        </div>

        {/* Live Registrations Status Badge */}
        {featureFlags.find(f => f.key === 'new_registrations_paused')?.isEnabled && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse self-start sm:self-center">
            <Pause className="h-3.5 w-3.5" />
            Registrations paused
          </span>
        )}
      </div>

      {/* SUPPORT ROLE WARNING BANNER */}
      {isSupport && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold">Support Role Read-Only Restrictions</h4>
            <p className="leading-relaxed opacity-90">
              Your active operator profile is registered under the <strong>SUPPORT</strong> clearance group. Toggling global configuration flags, emergency shutdown matrices, or feature scopes is strictly limited to <strong>SUPER_ADMIN</strong> and <strong>BILLING_ADMIN</strong> roles.
            </p>
          </div>
        </div>
      )}

      {/* FEATURE FLAGS LIST */}
      <div className="space-y-4">
        {featureFlags.map(flag => {
          const isEmergency = flag.key === 'maintenance_mode' || flag.key === 'new_registrations_paused';
          
          return (
            <div 
              key={flag.id}
              id={`flag-card-${flag.key}`}
              className={`p-5 sm:p-6 bg-card border rounded-xl shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative group ${
                flag.isEnabled && isEmergency
                  ? 'border-amber-500/30 bg-amber-500/[0.01]'
                  : 'border-border/40 hover:border-border'
              }`}
            >
              <div className="space-y-2.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">
                    {flag.label}
                  </h3>
                  <code className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground">
                    {flag.key}
                  </code>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {flag.description}
                </p>

                {/* Meta details changed log */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-semibold pt-1 border-t border-border/10">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    By: {flag.updatedByAdminName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last changed: {format(parseISO(flag.updatedAt), 'dd MMM yyyy, hh:mm a')}
                  </span>
                </div>
              </div>

              {/* Toggle Switch Component with Support clearance tooltip */}
              <div className="shrink-0 flex items-center justify-end">
                <div className="relative group/toggle">
                  <button
                    id={`toggle-btn-${flag.key}`}
                    disabled={isSupport || isToggling}
                    onClick={() => handleToggleClick(flag.key, flag.label, flag.isEnabled)}
                    className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isSupport ? 'opacity-60 cursor-not-allowed' : ''
                    } ${
                      flag.isEnabled 
                        ? (isEmergency ? 'bg-amber-500' : 'bg-primary') 
                        : 'bg-secondary'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out ${
                        flag.isEnabled ? 'translate-x-5.5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  {/* Explanatory Tooltip when hovering a disabled flag switch */}
                  {isSupport && (
                    <div className="absolute right-0 bottom-full mb-2 hidden group-hover/toggle:block w-52 p-2 bg-popover text-popover-foreground text-[10px] rounded border border-border/50 shadow-md leading-relaxed z-15">
                      <Lock className="h-3 w-3 inline mr-1 text-destructive" />
                      Role <strong>SUPPORT</strong> is locked out from editing. Request Super Admin privileges.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CONFIRMATION OVERLAY MODAL */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop scrim */}
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
          />
          
          {/* Modal Container */}
          <div className="relative bg-card border border-border/60 rounded-xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              {confirmState.type === 'critical' ? (
                <div className="p-2.5 bg-red-500/10 text-red-500 rounded-lg shrink-0">
                  <ShieldAlert className="h-6 w-6" />
                </div>
              ) : (
                <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-lg shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              )}

              <div className="space-y-1.5 min-w-0">
                <h2 className="text-base font-black text-foreground tracking-tight leading-none">
                  {confirmState.title}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                className="h-9 px-4 rounded-md hover:bg-secondary/60 text-foreground font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-flag-toggle-btn"
                onClick={handleConfirmAction}
                className={`h-9 px-4 rounded-md text-white font-extrabold text-xs transition-colors cursor-pointer ${
                  confirmState.type === 'critical' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                Yes, Commit Global Override
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
