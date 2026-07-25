import { IMessagingRepository } from '../features/messaging/messaging.repository';
import { MessageProviderFactory } from '../providers/message-provider.factory';

/**
 * The actual send logic, kept separate from the BullMQ `Worker` wrapper so
 * it can be unit tested without spinning up a real queue/connection.
 *
 * Talks to the repository directly rather than through MessagingService —
 * the worker's job is "given a message log id, attempt delivery and record
 * the outcome," which is a different responsibility than the service's
 * "validate and enqueue new messages." Keeping them separate avoids a
 * circular dependency (service enqueues -> worker processes -> would
 * otherwise call back into the service that owns the policy checks that
 * already happened once at enqueue time).
 */
export class MessageWorkerService {
  constructor(private repo: IMessagingRepository) {}

  async process(messageLogId: string): Promise<void> {
    const log = await this.repo.findById(messageLogId);
    if (!log) throw new Error(`Message log ${messageLogId} not found`);
    if (log.status === 'SENT') return; // already delivered — stalled/duplicate job redelivery

    const provider = MessageProviderFactory.getProvider(log.channel);

    try {
      await this.repo.updateStatus(log.id, 'PROCESSING');

      const response = await provider.send(log.template, log.recipient, log.params ?? {});

      await this.repo.updateStatus(log.id, 'SENT', {
        providerMsgId: response?.messageId ?? null,
        sentAt: new Date(),
        metadata: response ?? null,
      });
    } catch (error) {
      await this.repo.incrementAttempt(log.id);

      const failureReason = (error as Error).message;
      // Only flip to FAILED once BullMQ's own retries are exhausted
      // (attempts = messagingConfig.queue.retryAttempts, default 3) —
      // mirrors the main app's message.worker.service.ts exactly.
      if (Number(log.attemptCount) + 1 >= 3) {
        await this.repo.updateStatus(log.id, 'FAILED', { failureReason });
      }

      // Rethrow so BullMQ's 'failed' event fires and its own backoff/retry
      // applies. Swallowing the error here would make BullMQ think the job
      // succeeded.
      throw error;
    }
  }
}
