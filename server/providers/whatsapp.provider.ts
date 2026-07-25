import { OpsMessageTemplate } from '@prisma/client';
import { messagingConfig } from '../config/messaging.config';
import { getWhatsAppTemplate } from '../templates/whatsapp.templates';
import { IMessageProvider } from './message-provider.interface';

/**
 * Fully working WhatsApp Business API provider (AiSensy-style REST call,
 * mirroring the main app's implementation). Not wired into any
 * user-selectable channel yet — see messaging.validator.ts and
 * messaging.service.ts for where WHATSAPP is currently blocked from the
 * public send path. This class itself has no knowledge of that policy; it
 * will send whatever it's asked to send. Keeping the policy decision out
 * of the provider (and in the service layer instead) is what lets this
 * provider be turned on later with a config flag and zero code changes.
 */
export class WhatsAppProvider implements IMessageProvider {
  async send(template: OpsMessageTemplate, destination: string, params: Record<string, any>): Promise<any> {
    if (!destination) throw new Error('Destination is required');
    if (!messagingConfig.whatsapp.url) throw new Error('WHATSAPP_API_URL is not configured');

    const { campaignName, templateParams } = getWhatsAppTemplate(template, params);

    const payload = {
      apiKey: messagingConfig.whatsapp.apiKey,
      campaignName,
      destination,
      userName: params?.adminName ?? params?.name ?? 'there',
      templateParams: templateParams.map((p) => String(p)),
      source: 'Ops Dashboard',
    };

    const response = await fetch(messagingConfig.whatsapp.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${messagingConfig.whatsapp.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${data?.message ?? response.statusText}`);
    }

    return data;
  }
}

let _whatsappProvider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (!_whatsappProvider) _whatsappProvider = new WhatsAppProvider();
  return _whatsappProvider;
}
