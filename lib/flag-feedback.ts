export type ToastFn = (title: string, description?: string, type?: 'success' | 'warning' | 'error' | 'info') => void;

/**
 * After a flag write, tell the operator about anything that didn't fully land: the change not
 * reaching the main app (which is what enforces flags), and server-side warnings such as a missing
 * prerequisite. Shared by the Feature Flags page and the per-organization Features tab.
 */
export function reportFlagOutcome(toast: ToastFn, outcome: { mirror?: { ok: boolean; error?: string }; warnings?: string[] }) {
  if (outcome.mirror && !outcome.mirror.ok) {
    toast(
      'Saved in Ops, but the main app was not updated',
      'The change is not live yet. Open "Verify sync" on this flag and re-sync. ' + (outcome.mirror.error ?? ''),
      'warning'
    );
  }
  (outcome.warnings ?? []).forEach((w) => toast('Heads up', w, 'warning'));
}
