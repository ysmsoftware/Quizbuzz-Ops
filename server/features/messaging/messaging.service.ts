import { IMessagingRepository, MessageListFilters, MessagingRepository } from './messaging.repository';
import { messageQueue } from '../../queues/message.queue';
import { messagingConfig } from '../../config/messaging.config';
import { NotFoundError, ValidationError } from '../../http/errors';
import { OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@prisma/client';
import { getEmailTemplate, RenderedEmail } from '../../templates/email.templates';
import { MessageLogResult, PaginatedMessagesResult, SendMessageInput } from './messaging.types';

export interface IMessagingService {
  enqueueMessage(input: SendMessageInput): Promise<MessageLogResult>;
  getMessageById(id: string, organizationId?: string): Promise<MessageLogResult>;
  getMessagesByOrganization(organizationId: string, page: number, limit: number): Promise<PaginatedMessagesResult>;
  getMessages(filters: MessageListFilters, page: number, limit: number): Promise<PaginatedMessagesResult>;
  previewMessage(template: OpsMessageTemplate, params: Record<string, any>): RenderedEmail;
  retryMessage(id: string, organizationId?: string): Promise<MessageLogResult>;
  retryFailedMessages(organizationId: string): Promise<{ count: number }>;
  updateMessageStatus(id: string, status: OpsMessageStatus, additionalData?: Record<string, any>): Promise<any>;
  incrementAttempt(id: string): Promise<void>;
}

/**
 * All business logic for outbound ops messaging lives here — routes/
 * controllers stay thin, repositories stay DB-only (per this repo's
 * layering convention).
 *
 * This is also the single enforcement point for the "WhatsApp is fully
 * built but not switched on" policy. `messaging.validator.ts` already
 * blocks WHATSAPP from the public send DTO, but internal/system callers
 * (billing, subscriptions, payouts) go through `enqueueMessage()` directly
 * with a typed `SendMessageInput`, bypassing that DTO — so the guard is
 * repeated here as defense in depth. Both checks read the same
 * `messagingConfig.whatsapp.enabled` flag, so enabling WhatsApp for
 * everyone is still a single config change.
 */
export class MessagingService implements IMessagingService {
  constructor(private repo: IMessagingRepository = new MessagingRepository()) {}

  async enqueueMessage(input: SendMessageInput): Promise<MessageLogResult> {
    const channel: OpsMessageChannel = input.channel ?? 'EMAIL';

    if (channel === 'WHATSAPP' && !messagingConfig.whatsapp.enabled) {
      throw new ValidationError(
        { channel: 'WhatsApp messaging is implemented but not yet enabled.' },
        'WhatsApp channel is not yet enabled. Set WHATSAPP_MESSAGING_ENABLED=true to activate it.'
      );
    }

    const message = await this.repo.create({
      organizationId: input.organizationId,
      channel,
      template: input.template,
      recipient: input.recipient,
      subject: input.subject ?? null,
      params: input.params ?? null,
      status: 'QUEUED',
    });

    // jobId = message.id makes re-enqueueing idempotent: BullMQ will not
    // create a second job for a jobId that's already active/waiting.
    await messageQueue.add('send-message', { messageLogId: message.id }, { jobId: message.id });

    return toDTO(message);
  }

  async getMessageById(id: string, organizationId?: string): Promise<MessageLogResult> {
    const message = await this.repo.findById(id, organizationId);
    if (!message) throw new NotFoundError('Message not found');
    return toDTO(message);
  }

  async getMessagesByOrganization(organizationId: string, page: number, limit: number): Promise<PaginatedMessagesResult> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.repo.findByOrganization(organizationId, skip, limit),
      this.repo.countByOrganization(organizationId),
    ]);

    return {
      data: rows.map(toDTO),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Platform-wide message log for the centralized Messaging dashboard page —
   * same pagination shape as getMessagesByOrganization, but not scoped to a
   * single tenant unless the caller passes filters.organizationId.
   */
  async getMessages(filters: MessageListFilters, page: number, limit: number): Promise<PaginatedMessagesResult> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.repo.findAll(filters, skip, limit),
      this.repo.countAll(filters),
    ]);

    return {
      data: rows.map(toDTO),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Renders the exact subject/HTML an EMAIL send of this template+params
   * would produce, without touching the queue, the DB, or the audit log —
   * lets the compose UI show a byte-accurate live preview instead of a
   * separately-maintained (and inevitably drifting) copy of the markup.
   */
  previewMessage(template: OpsMessageTemplate, params: Record<string, any>): RenderedEmail {
    return getEmailTemplate(template, params ?? {});
  }

  /**
   * Re-queues a message log row for delivery. Originally FAILED-only ("retry");
   * now also allowed from SENT/DELIVERED so an operator can manually resend a
   * message that already went out (e.g. the recipient says they never got it) —
   * still blocked while QUEUED/PROCESSING since that message is already
   * in-flight and a second concurrent send would just race it. Each call
   * increments retryCount and re-uses the same message row/history rather
   * than creating a new one, so the Actions column's "Resend" button works
   * for any row regardless of its current status.
   */
  async retryMessage(id: string, organizationId?: string): Promise<MessageLogResult> {
    const message = await this.repo.findById(id, organizationId);
    if (!message) throw new NotFoundError('Message not found');
    if (message.status === 'QUEUED' || message.status === 'PROCESSING') {
      throw new ValidationError(
        { status: message.status },
        `Cannot resend a message that is currently ${message.status.toLowerCase()}. Wait for it to finish before resending.`
      );
    }

    const updated = await this.repo.updateStatus(id, 'QUEUED', { retryCount: { increment: 1 } });
    await messageQueue.add('send-message', { messageLogId: id }, { jobId: `retry-${id}-${Date.now()}` });
    return toDTO(updated);
  }

  async retryFailedMessages(organizationId: string): Promise<{ count: number }> {
    const failed = await this.repo.findFailed(organizationId);
    for (const msg of failed) {
      await this.repo.updateStatus(msg.id, 'QUEUED', { retryCount: { increment: 1 } });
      await messageQueue.add('send-message', { messageLogId: msg.id }, { jobId: `retry-${msg.id}-${Date.now()}` });
    }
    return { count: failed.length };
  }

  async updateMessageStatus(id: string, status: OpsMessageStatus, additionalData: Record<string, any> = {}) {
    return this.repo.updateStatus(id, status, additionalData);
  }

  async incrementAttempt(id: string) {
    await this.repo.incrementAttempt(id);
  }
}

function toDTO(message: any): MessageLogResult {
  return {
    id: message.id,
    organizationId: message.organizationId,
    channel: message.channel,
    template: message.template,
    recipient: message.recipient,
    subject: message.subject ?? null,
    params: message.params ?? null,
    status: message.status,
    providerMsgId: message.providerMsgId ?? null,
    sentAt: message.sentAt ? new Date(message.sentAt).toISOString() : null,
    deliveredAt: message.deliveredAt ? new Date(message.deliveredAt).toISOString() : null,
    failureReason: message.failureReason ?? null,
    retryCount: message.retryCount,
    attemptCount: message.attemptCount,
    createdAt: new Date(message.createdAt).toISOString(),
    updatedAt: new Date(message.updatedAt).toISOString(),
  };
}
