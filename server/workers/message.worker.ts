import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { messagingConfig } from '../config/messaging.config';
import { messagingRepository } from '../container';
import { MessageWorkerService } from './message.worker.service';
import { SendMessageJobData } from '../queues/message.queue';

/**
 * Runs in its own Node process (see scripts/worker.ts) — never inside a
 * Next.js API route handler. A BullMQ Worker needs a long-lived, blocking
 * connection to poll for jobs; a Next.js route handler is request-scoped
 * and doesn't stay alive between requests. This mirrors the main app's
 * `backend/src/worker.ts`, which is likewise a dedicated process separate
 * from the Express API server (QuizBuzz scaling rule: workers must be
 * independent, no dependency on the API instance).
 */
export function startMessageWorker(): Worker<SendMessageJobData> {
  const workerService = new MessageWorkerService(messagingRepository);

  const worker = new Worker<SendMessageJobData>(
    messagingConfig.queue.name,
    async (job) => {
      if (job.name === 'send-message') {
        await workerService.process(job.data.messageLogId);
      }
    },
    {
      connection: redis,
      prefix: messagingConfig.queue.prefix,
      concurrency: messagingConfig.queue.workerConcurrency,
    }
  );

  worker.on('ready', () => {
    console.log(`[ops-message-worker] ready — concurrency: ${messagingConfig.queue.workerConcurrency}, prefix: ${messagingConfig.queue.prefix}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[ops-message-worker] job ${job?.id} (${job?.name}) failed (attempt ${job?.attemptsMade}): ${err.message}`);
  });

  worker.on('completed', (job) => {
    console.log(`[ops-message-worker] job ${job.id} (${job.name}) completed`);
  });

  return worker;
}
