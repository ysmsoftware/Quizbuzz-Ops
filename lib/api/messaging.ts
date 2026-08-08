'use client';

import { apiRequest } from '@/lib/api/utils';
import { MessageTemplateDescriptor, OpsMessage, OpsMessageChannel, OpsMessageStatus, OpsMessageTemplate } from '@/lib/types';

export interface PaginatedMessages {
  data: OpsMessage[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetMessagesParams {
  page?: number;
  limit?: number;
  organizationId?: string;
  status?: OpsMessageStatus;
  channel?: OpsMessageChannel;
  template?: OpsMessageTemplate;
  search?: string;
}

/** Platform-wide message log — backs the centralized Messaging dashboard page. */
export async function getMessages(params: GetMessagesParams = {}): Promise<PaginatedMessages> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.organizationId) query.append('organizationId', params.organizationId);
  if (params.status) query.append('status', params.status);
  if (params.channel) query.append('channel', params.channel);
  if (params.template) query.append('template', params.template);
  if (params.search) query.append('search', params.search);

  return apiRequest<PaginatedMessages>(`/api/v1/ops/messaging?${query.toString()}`);
}

export async function getMessageById(id: string): Promise<OpsMessage> {
  return apiRequest<OpsMessage>(`/api/v1/ops/messaging/${id}`);
}

export async function getMessageTemplates(): Promise<MessageTemplateDescriptor[]> {
  return apiRequest<MessageTemplateDescriptor[]>('/api/v1/ops/messaging/templates');
}

export interface MessagePreview {
  subject: string;
  html: string;
}

export interface PreviewMessageParams {
  template: OpsMessageTemplate;
  params?: Record<string, string>;
}

/** Renders the exact subject/HTML a template+params combo would produce — no send, no DB write. */
export async function previewMessage(payload: PreviewMessageParams): Promise<MessagePreview> {
  return apiRequest<MessagePreview>('/api/v1/ops/messaging/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface SendMessageParams {
  organizationId: string;
  template: OpsMessageTemplate;
  recipient: string;
  subject?: string;
  params?: Record<string, string>;
}

export async function sendMessage(payload: SendMessageParams): Promise<OpsMessage> {
  return apiRequest<OpsMessage>('/api/v1/ops/messaging/send', {
    method: 'POST',
    body: JSON.stringify({ ...payload, channel: 'EMAIL' }),
  });
}

export async function retryMessage(id: string): Promise<OpsMessage> {
  return apiRequest<OpsMessage>(`/api/v1/ops/messaging/${id}/retry`, { method: 'POST' });
}

export async function retryFailedMessages(organizationId: string): Promise<{ count: number }> {
  return apiRequest<{ count: number }>(
    `/api/v1/ops/messaging/retry-failed?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'POST' }
  );
}
