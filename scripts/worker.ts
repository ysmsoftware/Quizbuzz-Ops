/**
 * Standalone entrypoint for the ops messaging worker.
 *
 * Run via `npm run worker` as its own process (PM2/systemd/Docker service),
 * separate from `npm start` (the Next.js web process). See
 * docs/ops-dashboard-messaging-system-implementation-guide.md §14 for the
 * deployment rationale — Next.js has no persistent server process of its
 * own for a BullMQ Worker to live inside.
 */
import { startMessageWorker } from '../server/workers/message.worker';

console.log('[ops-worker] starting...');
startMessageWorker();

process.on('uncaughtException', (err) => {
  console.error('[ops-worker] uncaught exception', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[ops-worker] unhandled rejection', reason);
});
