import { OpsMessageTemplate } from '@prisma/client';
import { IOrganizationsRepository, OrganizationsRepository } from '../features/organizations/organizations.repository';
import { IMessagingService, MessagingService } from '../features/messaging/messaging.service';

/**
 * Single entry point for every subscription/billing lifecycle email in this
 * app. Resolves the org's OWNER (never any other member — see the decision
 * recorded on OrganizationsRepository#getOwnerContact) and enqueues through
 * MessagingService.enqueueMessage(), which is itself queue-only: it writes
 * an OpsMessageLog row and pushes a BullMQ job — nothing in this class (or
 * any of its callers) ever sends an email directly. The actual send happens
 * later in message.worker.service.ts when the queue worker picks the job up.
 *
 * Callers pass template-specific params; `adminName`/`recipient` are always
 * resolved here so no call site can accidentally get the recipient wrong.
 */
export class OrgOwnerNotifier {
  constructor(
    private orgRepo: IOrganizationsRepository = new OrganizationsRepository(),
    private messaging: IMessagingService = new MessagingService()
  ) {}

  /**
   * Never throws — a notification failure (no owner found, DB blip enqueuing
   * the OpsMessageLog row, etc.) must not break the caller's actual business
   * operation (a payment already succeeded, an override was already applied,
   * an org was already suspended). Callers that want to know whether the
   * enqueue actually happened can inspect the boolean return value.
   */
  async notify(
    organizationId: string,
    template: OpsMessageTemplate,
    params: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      const owner = await this.orgRepo.getOwnerContact(organizationId);

      if (!owner) {
        console.warn(
          `[OrgOwnerNotifier] No active OWNER contact found for org ${organizationId} — skipping ${template} email.`
        );
        return false;
      }

      await this.messaging.enqueueMessage({
        organizationId,
        template,
        recipient: owner.email,
        channel: 'EMAIL',
        params: { adminName: owner.name, ...params },
      });
      return true;
    } catch (err) {
      console.error(`[OrgOwnerNotifier] Failed to enqueue ${template} for org ${organizationId}:`, err);
      return false;
    }
  }
}

export const orgOwnerNotifier = new OrgOwnerNotifier();
