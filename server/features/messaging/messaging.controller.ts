import { getSessionAdmin } from '../../http/auth-guard';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { okResponse } from '../../http/envelope';
import { writeAuditLogEntry } from '../../audit/audit-writer';
import { AuditTargetType, OpsMessageTemplate } from '@prisma/client';
import { SendMessageSchema, PaginationQuerySchema } from './messaging.validator';
import { IMessagingService, MessagingService } from './messaging.service';

/** Template metadata for a future compose UI — channel-agnostic; the channel itself is fixed to EMAIL by the service layer. */
const TEMPLATE_CATALOG: { id: OpsMessageTemplate; name: string; variables: string[] }[] = [
  { id: 'BILLING_PAYMENT_SUCCESS', name: 'Billing: Payment Success', variables: ['adminName', 'planName', 'amount'] },
  { id: 'BILLING_PAYMENT_FAILED', name: 'Billing: Payment Failed', variables: ['adminName', 'planName', 'amount', 'reason'] },
  { id: 'SUBSCRIPTION_PAST_DUE', name: 'Subscription: Past Due', variables: ['adminName', 'planName'] },
  { id: 'SUBSCRIPTION_CANCELLED', name: 'Subscription: Cancelled', variables: ['adminName', 'planName', 'effectiveDate'] },
  { id: 'SUBSCRIPTION_PLAN_CHANGED', name: 'Subscription: Plan Changed', variables: ['adminName', 'fromPlan', 'toPlan'] },
  { id: 'PAYOUT_ACCOUNT_LINKED', name: 'Payout: Account Linked', variables: ['adminName'] },
  { id: 'PAYOUT_ACCOUNT_STATUS_CHANGED', name: 'Payout: Status Changed', variables: ['adminName', 'status', 'reason'] },
  { id: 'ORG_SUSPENDED', name: 'Organization Suspended', variables: ['adminName', 'reason'] },
  { id: 'ORG_REACTIVATED', name: 'Organization Reactivated', variables: ['adminName'] },
  { id: 'CUSTOM', name: 'Custom Message', variables: ['adminName', 'subject', 'body'] },
];

export class MessagingController {
  constructor(private service: IMessagingService = new MessagingService()) {}

  async getTemplates() {
    await getSessionAdmin();
    return okResponse(TEMPLATE_CATALOG, 'Message templates retrieved.');
  }

  async sendMessage(req: Request) {
    const admin = await getSessionAdmin();
    const input = await parseRequest(req, SendMessageSchema);

    // `input.channel` is always 'EMAIL' here — SendMessageSchema rejects
    // anything else before this line is reached (see messaging.validator.ts).
    const message = await this.service.enqueueMessage({
      organizationId: input.organizationId,
      template: input.template,
      recipient: input.recipient,
      subject: input.subject,
      channel: input.channel,
      params: input.params,
    });

    await writeAuditLogEntry(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      'org.message_sent',
      AuditTargetType.ORGANIZATION,
      input.organizationId,
      input.recipient,
      { template: input.template, channel: input.channel, messageId: message.id }
    );

    return okResponse(message, 'Message queued for sending.');
  }

  async getMessageById(id: string) {
    await getSessionAdmin();
    const message = await this.service.getMessageById(id);
    return okResponse(message, 'Message retrieved.');
  }

  async getMessagesByOrganization(req: Request, orgId: string) {
    await getSessionAdmin();
    const { page, limit } = parseQueryParams(req, PaginationQuerySchema);
    const result = await this.service.getMessagesByOrganization(orgId, page, limit);
    return okResponse(result, 'Message history retrieved.');
  }

  async retryMessage(id: string) {
    const admin = await getSessionAdmin();
    const message = await this.service.retryMessage(id);

    await writeAuditLogEntry(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      'org.message_retried',
      AuditTargetType.ORGANIZATION,
      message.organizationId,
      message.recipient,
      { messageId: id }
    );

    return okResponse(message, 'Message queued for retry.');
  }

  async retryFailedMessages(orgId: string) {
    await getSessionAdmin();
    const result = await this.service.retryFailedMessages(orgId);
    return okResponse(result, `Queued ${result.count} failed messages for retry.`);
  }
}

export default MessagingController;
