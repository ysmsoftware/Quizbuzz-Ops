export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeBackgroundJobs } = await import('./server/jobs');
    initializeBackgroundJobs();
  }
}
