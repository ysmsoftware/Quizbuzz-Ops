export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeBackgroundJobs } = await import('./server/jobs');
    initializeBackgroundJobs();

    // Self-healing feature-flag registry sync — see
    // server/features/feature-flags/feature-flag-registry.ts. Runs on every
    // boot (every deploy restarts the container) so a flag added to that
    // file in code shows up as a real DB row without a manual seed-script
    // run. Non-fatal on failure: a transient DB hiccup here must not take
    // down the whole app, and any flags that already exist keep working
    // exactly as before either way.
    try {
      const { prisma } = await import('./server/db/ops-prisma');
      const { syncFeatureFlagRegistry } = await import('./server/features/feature-flags/sync-feature-flags');
      const result = await syncFeatureFlagRegistry(prisma);
      if (result.created.length || result.updated.length || result.deprecated.length) {
        console.log('[feature-flags] registry sync:', result);
      }
    } catch (err) {
      console.error('[feature-flags] registry sync failed (existing flags are unaffected):', err);
    }
  }
}
