import { AuditLogRepository } from './features/audit-log/audit-log.repository';
import { AuditLogService } from './features/audit-log/audit-log.service';
import { AuditLogController } from './features/audit-log/audit-log.controller';

import { BillingRepository } from './features/billing/billing.repository';
import { BillingService } from './features/billing/billing.service';
import { BillingController } from './features/billing/billing.controller';

import { EntitlementsRepository } from './features/entitlements/entitlements.repository';
import { EntitlementsService } from './features/entitlements/entitlements.service';

import { FeatureFlagsRepository } from './features/feature-flags/feature-flags.repository';
import { FeatureFlagsService } from './features/feature-flags/feature-flags.service';
import { FeatureFlagsController } from './features/feature-flags/feature-flags.controller';

import { MessagingRepository } from './features/messaging/messaging.repository';
import { MessagingService } from './features/messaging/messaging.service';
import { MessagingController } from './features/messaging/messaging.controller';

import { OrganizationsRepository } from './features/organizations/organizations.repository';
import { OrganizationsService } from './features/organizations/organizations.service';
import { OrganizationsController } from './features/organizations/organizations.controller';

import { OverviewRepository } from './features/overview/overview.repository';
import { OverviewService } from './features/overview/overview.service';
import { OverviewController } from './features/overview/overview.controller';

import { PayoutsRepository } from './features/payouts/payouts.repository';
import { PayoutsService } from './features/payouts/payouts.service';
import { PayoutsController } from './features/payouts/payouts.controller';

import { PlansRepository } from './features/plans/plans.repository';
import { PlansService } from './features/plans/plans.service';
import { PlansController } from './features/plans/plans.controller';

import { PlatformAuthRepository } from './features/platform-auth/platform-auth.repository';
import { PlatformAuthService } from './features/platform-auth/platform-auth.service';
import { PlatformAuthController } from './features/platform-auth/platform-auth.controller';

import { SubscriptionsRepository } from './features/subscriptions/subscriptions.repository';
import { SubscriptionsService } from './features/subscriptions/subscriptions.service';
import { SubscriptionsController } from './features/subscriptions/subscriptions.controller';

import { BookingsRepository } from './features/bookings/bookings.repository';
import { BookingsService } from './features/bookings/bookings.service';
import { BookingsController } from './features/bookings/bookings.controller';

import { OrgOwnerNotifier } from './notifications/org-owner-notifier';

// ─── Repositories ──────────────────────────────────────────
export const auditLogRepository = new AuditLogRepository();
export const billingRepository = new BillingRepository();
export const bookingsRepository = new BookingsRepository();
export const entitlementsRepository = new EntitlementsRepository();
export const featureFlagsRepository = new FeatureFlagsRepository();
export const messagingRepository = new MessagingRepository();
export const organizationsRepository = new OrganizationsRepository();
export const overviewRepository = new OverviewRepository();
export const payoutsRepository = new PayoutsRepository();
export const plansRepository = new PlansRepository();
export const platformAuthRepository = new PlatformAuthRepository();
export const subscriptionsRepository = new SubscriptionsRepository();

// ─── Services ───────────────────────────────────────────────
export const auditLogService = new AuditLogService(auditLogRepository);
export const billingService = new BillingService(billingRepository);
export const bookingsService = new BookingsService(bookingsRepository);
export const entitlementsService = new EntitlementsService(entitlementsRepository);
export const featureFlagsService = new FeatureFlagsService(featureFlagsRepository);
export const messagingService = new MessagingService(messagingRepository);
export const organizationsService = new OrganizationsService(organizationsRepository);
export const overviewService = new OverviewService(overviewRepository);
export const payoutsService = new PayoutsService(payoutsRepository);
export const orgOwnerNotifier = new OrgOwnerNotifier(organizationsRepository, messagingService);
export const subscriptionsService = new SubscriptionsService(subscriptionsRepository, entitlementsService);
export const plansService = new PlansService(plansRepository, entitlementsService, subscriptionsRepository);
export const platformAuthService = new PlatformAuthService(platformAuthRepository);

// ─── Controllers ────────────────────────────────────────────
export const auditLogController = new AuditLogController(auditLogService);
export const featureFlagsController = new FeatureFlagsController(featureFlagsService);
export const billingController = new BillingController(billingService);
export const bookingsController = new BookingsController(bookingsService);
export const messagingController = new MessagingController(messagingService);
export const organizationsController = new OrganizationsController(organizationsService);
export const overviewController = new OverviewController(overviewService);
export const payoutsController = new PayoutsController(payoutsService);
export const plansController = new PlansController(plansService);
export const subscriptionsController = new SubscriptionsController(subscriptionsService);
export const platformAuthController = new PlatformAuthController(platformAuthService);

