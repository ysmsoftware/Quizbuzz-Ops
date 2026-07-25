import { OpsMessageTemplate } from '@prisma/client';

/**
 * Channel-agnostic send contract. Every concrete provider (Email, WhatsApp,
 * and any future channel — SMS, push, etc.) implements exactly this shape.
 * Callers (the worker, the service) depend on this interface only — never
 * on a concrete provider class. This is the Dependency Inversion piece of
 * the messaging system: MessageProviderFactory is the single place that
 * knows which concrete class backs which channel.
 */
export interface IMessageProvider {
  send(template: OpsMessageTemplate, destination: string, params: Record<string, any>): Promise<any>;
}
