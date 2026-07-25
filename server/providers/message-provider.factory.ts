import { OpsMessageChannel } from '@prisma/client';
import { IMessageProvider } from './message-provider.interface';
import { getEmailProvider } from './email.provider';
import { getWhatsAppProvider } from './whatsapp.provider';

/**
 * Strategy/Factory: the only place in the codebase that maps a channel enum
 * to a concrete provider class. Adding a new channel means adding one case
 * here and one new provider class — nothing else in the messaging pipeline
 * (queue, worker, repository) needs to know a new channel exists.
 *
 * This factory does NOT enforce the "WhatsApp is hidden" policy — that's a
 * business rule, and belongs in MessagingService, not in provider wiring.
 * Keeping it out of here means the factory stays a pure mechanical lookup
 * and the policy lives in exactly one place.
 */
export class MessageProviderFactory {
  static getProvider(channel: OpsMessageChannel): IMessageProvider {
    switch (channel) {
      case 'EMAIL':
        return getEmailProvider();
      case 'WHATSAPP':
        return getWhatsAppProvider();
      default: {
        const _exhaustive: never = channel;
        throw new Error(`Unsupported message channel: ${_exhaustive}`);
      }
    }
  }
}
