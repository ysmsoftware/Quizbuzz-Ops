import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { messagingConfig } from '../config/messaging.config';

export interface SendMessageJobData {
  messageLogId: string;
}

export const messageQueue = new Queue<SendMessageJobData>(messagingConfig.queue.name, {
  connection: redis,
  prefix: messagingConfig.queue.prefix,
  defaultJobOptions: {
    attempts: messagingConfig.queue.retryAttempts,
    backoff: messagingConfig.queue.backoff,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});
