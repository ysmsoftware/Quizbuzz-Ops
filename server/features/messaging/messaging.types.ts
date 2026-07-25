import { OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@prisma/client';

export interface SendMessageInput {
  organizationId: string;
  template: OpsMessageTemplate;
  recipient: string;
  subject?: string;
  channel?: OpsMessageChannel; // defaults to EMAIL; see messaging.validator.ts for the public API's restriction
  params?: Record<string, any>;
}

export interface MessageLogResult {
  id: string;
  organizationId: string;
  channel: OpsMessageChannel;
  template: OpsMessageTemplate;
  recipient: string;
  subject: string | null;
  params: unknown;
  status: OpsMessageStatus;
  providerMsgId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  retryCount: number;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMessagesResult {
  data: MessageLogResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MessageTemplateDescriptor {
  id: OpsMessageTemplate;
  name: string;
  variables: string[];
}
