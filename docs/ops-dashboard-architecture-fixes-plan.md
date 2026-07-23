# QuizBuzz Ops — Architecture Fixes Plan

Companion to the SOLID/OOP audit delivered in chat. This is the implementation plan for fixing what was found, not a re-statement of the findings. Scope is structural only — no behavior change, no schema change, and explicitly **no 2FA work**. Platform-admin login stays OTP-based exactly as it is today; `twoFaSecret`/`twoFaEnabled` stay unused until a later, separate milestone.

## 1. What's being fixed, in one table

| Problem | Where | Fix |
|---|---|---|
| No dependency injection anywhere | All 8 `server/features/*` modules | Central `server/container.ts`, constructor injection everywhere |
| No repository interfaces | All 8 modules | Extract `IXRepository` per module |
| `subscriptions` module has no repository | `server/features/subscriptions/` | New `subscriptions.repository.ts` |
| Shared cache-sync logic living inside one feature's service | `subscriptions.service.ts` exporting `syncOrgPlanLimitsCache`, imported by `plans.service.ts` | Extract to its own module |

## 2. Central container (Dependency Inversion fix)

### 2.1 Why

Every controller currently does `private service = new XService()`, every service does `private repo = new XRepository()`. It works, but nothing is swappable and nothing can be unit-tested with a fake repository without monkeypatching module internals. The main app already solved this — `backend/src/container.ts` instantiates every repository once, then every service with its dependencies passed into the constructor, then every controller the same way. This plan replicates that shape in `quizbuzz-ops-next`.

### 2.2 Target shape

```txt
server/
├── container.ts                 NEW — single wiring point, mirrors main app's container.ts
└── features/
    ├── organizations/
    │   ├── organizations.repository.ts     add: export interface IOrganizationsRepository
    │   └── organizations.service.ts        change: constructor(repo: IOrganizationsRepository)
    ├── payouts/       (same shape)
    ├── billing/       (same shape)
    ├── audit-log/     (same shape)
    ├── overview/      (same shape)
    ├── plans/         (same shape)
    ├── platform-auth/ (same shape)
    └── subscriptions/ (same shape, after §3 below gives it a repository to inject)
```

### 2.3 `container.ts` skeleton

```ts
// server/container.ts
import { OrganizationsRepository } from './features/organizations/organizations.repository';
import { OrganizationsService } from './features/organizations/organizations.service';
import { OrganizationsController } from './features/organizations/organizations.controller';

import { PayoutsRepository } from './features/payouts/payouts.repository';
import { PayoutsService } from './features/payouts/payouts.service';
import { PayoutsController } from './features/payouts/payouts.controller';

// ...one import block per module, same pattern...

// ─── Repositories ──────────────────────────────────────────
export const organizationsRepository = new OrganizationsRepository();
export const payoutsRepository = new PayoutsRepository();
export const billingRepository = new BillingRepository();
export const auditLogRepository = new AuditLogRepository();
export const overviewRepository = new OverviewRepository();
export const plansRepository = new PlansRepository();
export const platformAuthRepository = new PlatformAuthRepository();
export const subscriptionsRepository = new SubscriptionsRepository(); // new, see §3

// ─── Services ───────────────────────────────────────────────
export const organizationsService = new OrganizationsService(organizationsRepository);
export const payoutsService = new PayoutsService(payoutsRepository);
export const billingService = new BillingService(billingRepository);
export const auditLogService = new AuditLogService(auditLogRepository);
export const overviewService = new OverviewService(overviewRepository);
export const subscriptionsService = new SubscriptionsService(subscriptionsRepository);
export const plansService = new PlansService(plansRepository, subscriptionsService); // needs the cache-sync fn, see §4
export const platformAuthService = new PlatformAuthService(platformAuthRepository);

// ─── Controllers ────────────────────────────────────────────
export const organizationsController = new OrganizationsController(organizationsService);
export const payoutsController = new PayoutsController(payoutsService);
export const billingController = new BillingController(billingService);
export const auditLogController = new AuditLogController(auditLogService);
export const overviewController = new OverviewController(overviewService);
export const plansController = new PlansController(plansService);
export const subscriptionsController = new SubscriptionsController(subscriptionsService);
export const platformAuthController = new PlatformAuthController(platformAuthService);
```

Each `app/api/v1/ops/**/route.ts` changes from:

```ts
const controller = new OrganizationsController();
```

to:

```ts
import { organizationsController } from '../../../../../server/container';
```

That's the only change route files need — they already just call one controller method and wrap errors, per the existing (correct) convention.

### 2.4 Interface extraction, one example

Every repository gets an exported interface above the class, matching the main app's `IPaymentRepository` pattern:

```ts
// payouts.repository.ts
export interface IPayoutsRepository {
  getPlatformPayoutAccounts(params: PayoutAccountsListQueryParams): Promise<{ rows: any[]; total: number }>;
  getOrganizationPayoutAccount(orgId: string): Promise<any | null>;
  getOrganizationTransferSummary(orgId: string): Promise<any>;
  getOrganizationRouteTransfers(orgId: string, params: RouteTransfersListQueryParams): Promise<{ rows: any[]; total: number }>;
  getPlatformRouteTransfers(params: RouteTransfersListQueryParams): Promise<{ rows: any[]; total: number }>;
  attachLinkedAccount(orgId: string, razorpayLinkedAccountId: string): Promise<any | null>;
  updatePayoutStatus(orgId: string, status: string, reason: string): Promise<any | null>;
  getOrganizationDetail(orgId: string): Promise<any | null>;
}

export class PayoutsRepository implements IPayoutsRepository {
  // unchanged method bodies
}
```

```ts
// payouts.service.ts
export class PayoutsService {
  constructor(private repo: IPayoutsRepository) {}   // was: private repo = new PayoutsRepository();
  // method bodies unchanged — this.repo.xyz(...) already works, just typed against the interface now
}
```

Repeat for all 8 repositories. Mechanical, no logic changes — each one is a find-and-replace of the constructor line plus lifting the existing method signatures into an `interface` block.

### 2.5 Rollout order (avoid a big-bang PR)

1. `subscriptions.repository.ts` first (§3) — it doesn't exist yet, so there's no risk of breaking a working module while extracting it.
2. `container.ts` — wire up all 8 modules at once, since it's additive (new file) and doesn't require touching service internals yet.
3. Repository interfaces + constructor injection, one module at a time, smallest first: `overview` → `audit-log` → `billing` → `payouts` → `organizations` → `plans` → `platform-auth` → `subscriptions` last (since it now also depends on the cache-sync extraction in §4).
4. After each module: re-run its existing manual smoke test from the relevant guide doc (e.g. payouts guide §11) to confirm no behavior changed.

## 3. Missing `subscriptions.repository.ts`

### 3.1 What moves out of the service

Everything in `subscriptions.service.ts` that currently calls `prisma.organizationSubscription.*`, `prisma.subscriptionOverride.*`, or `prisma.subscriptionChangeLog.*` directly.

### 3.2 Proposed interface

```ts
export interface ISubscriptionsRepository {
  findByOrgId(orgId: string): Promise<OrganizationSubscriptionWithPlan | null>;
  findByOrgIdWithOverridesAndHistory(orgId: string): Promise<FullSubscriptionRecord | null>;
  upsert(params: {
    organizationId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }): Promise<OrganizationSubscription>;
  updatePlan(organizationId: string, planId: string): Promise<OrganizationSubscription>;
  createChangeLog(params: {
    subscriptionId: string;
    fromPlanId: string | null;
    toPlanId: string;
    changedById: string | null;
    changedVia: string;
  }): Promise<SubscriptionChangeLog>;
  createOverride(params: {
    subscriptionId: string;
    field: string;
    value: number;
    reason: string;
    createdById: string;
    expiresAt?: Date;
  }): Promise<SubscriptionOverride>;
  removeOverride(overrideId: string, removedById: string, reason: string): Promise<SubscriptionOverride>;
  findActiveOverridesForPlan(planId: string): Promise<{ organizationId: string }[]>; // used by plans.service.ts getImpact
}
```

### 3.3 What `subscriptions.service.ts` keeps

All business logic stays in the service exactly where it is: effective-limit computation, the branching in `changePlan` (assign vs. change), and orchestration order (upsert → change-log → cache-sync → audit). Only the raw `prisma.*` calls move into the new repository, called through `this.repo.xyz(...)`.

### 3.4 Constructor after the fix

```ts
export class SubscriptionsService {
  constructor(private repo: ISubscriptionsRepository) {}
  // assignPlan / changePlan / addOverride / removeOverride / getSubscription bodies
  // unchanged except prisma.* calls become this.repo.*
}
```

## 4. Extracting `syncOrgPlanLimitsCache`

### 4.1 Why it's misplaced

It's a standalone exported function living inside `subscriptions.service.ts`, imported by `plans.service.ts` (`import { syncOrgPlanLimitsCache } from '../subscriptions/subscriptions.service'`). It writes to the **main app's** `organizations` table — that's a distinct responsibility from either "manage subscriptions" or "manage plans." Neither module should own the other's implementation detail.

### 4.2 Proposed home

```txt
server/features/entitlements/
├── entitlements.repository.ts    the queryMainDb UPDATE currently inline in syncOrgPlanLimitsCache
└── entitlements.service.ts       syncOrgPlanLimitsCache(orgId), unchanged logic, moved
```

`subscriptions.service.ts` and `plans.service.ts` both import from `entitlements.service.ts` instead of one importing from the other. Once `container.ts` exists (§2), both get an `entitlementsService` constructor dependency instead of a bare function import — keeps it consistent with the rest of the DI fix rather than leaving one bare exported function as the odd one out.

## 5. Non-goals for this pass

- No TOTP/2FA implementation. Login stays OTP-based.
- No new database columns or migrations.
- No change to any API request/response shape — this is purely internal wiring.
- No change to the audit-writer, envelope, or auth-guard modules — they're already clean, shared, single-responsibility utilities and don't need touching.

## 6. Definition of done

- `server/container.ts` exists and every route file imports its controller from it instead of `new`-ing one.
- Every `server/features/*/X.repository.ts` exports an `IXRepository` interface; every service takes it via constructor.
- `subscriptions.repository.ts` exists; `subscriptions.service.ts` has zero direct `prisma.*` calls.
- `syncOrgPlanLimitsCache` lives in `server/features/entitlements/` and both `plans` and `subscriptions` depend on it the same way.
- `npx tsc --noEmit` clean.
- Manual smoke test of organizations, plans, subscriptions, payouts, billing, audit-log flows still behaves identically to before the refactor.
