# QuizBuzz Ops Dashboard Database and Data Flows

## 1. Database Boundary

The ops dashboard uses two logical databases on the same PostgreSQL/RDS instance:

```txt
quizbuzz       main app database, owned by the main app
quizbuzz_ops   ops dashboard database, owned by this Next.js ops app
```

The ops app connects to both:

- `OPS_DATABASE_URL`: Prisma client, full DDL/DML over `quizbuzz_ops`.
- `MAIN_DATABASE_URL`: raw `pg.Pool`, restricted role against `quizbuzz`.

Ops migrations must only run against `quizbuzz_ops`. Any change to the main app schema belongs in the main app repo and migration history.

## 2. Main App Data the Ops Dashboard Reads

The main app database already contains the operational data needed for Phase 1.

Important main app models:

| Model                      | Purpose in ops                                       |
| ----------------------------| ------------------------------------------------------|
| `Organization`             | Tenant root, status, plan cache, onboarding status   |
| `OrganizationProfile`      | Onboarding/business profile fields                   |
| `OrgMember`                | Members and roles inside an org                      |
| `Admin`                    | Org admin identity for owners/admins/viewers         |
| `Contest`                  | Contest list, status, schedule, limits, payment flag |
| `PaymentConfig`            | Contest registration fee configuration               |
| `Contact`                  | Deduplicated participant identity per org            |
| `Participant`              | Registration row for contact x contest               |
| `Payment`                  | Contest registration payment records                 |
| `Submission`               | Quiz submission/result state                         |
| `LeaderboardEntry`         | Ranking and score data                               |
| `Certificate`              | Certificate generation status                        |
| `ProctoringEvent`          | Proctoring event details                             |
| `ProctoringScore`          | Participant proctoring score summary                 |
| `MessageLog`               | Notification history                                 |
| `ScheduledJob`             | BullMQ job audit trail                               |
| `ContestAnalyticsSnapshot` | Precomputed contest analytics                        |
| `OrganizationPayoutAccount`| Razorpay Route Linked Account status per org (added with the payout milestone, ahead of Phase 3) |
| `PaymentRouteTransfer`     | Per-payment Route transfer ledger — gross/fee/transfer amounts and status |

## 3. Main App Fields Ops May Write

Ops should have a restricted database role. In Phase 1 and Phase 2, allowed main DB writes are intentionally narrow:

| Table | Column | Reason |
|---|---|---|
| `organizations` | `isActive` | Suspend/reactivate org |
| `organizations` | `planSlug` | Current plan cache |
| `organizations` | `planStatus` | Current subscription status cache |
| `organizations` | `planLimitsCache` | Effective entitlement cache |
| `organization_payout_accounts` | `status` | Manual verification-failed/disabled/reactivate |
| `organization_payout_accounts` | `razorpayLinkedAccountId` | Attach Linked Account created in Razorpay Dashboard |
| `organization_payout_accounts` | `activatedAt` | Set when status flips to `ACTIVE` |
| `organization_payout_accounts` | `statusReason` | Human-readable reason shown in the org's own Settings page on `VERIFICATION_FAILED`/`DISABLED` |

**Resolved 2026-07-21:** the `planStaus` typo this section used to flag as an open decision is
already fixed on the main app side — confirmed live against the schema, the column is `planStatus`.
No compatibility-debt path needed; write `planStatus` directly.

## 4. Main DB Role Grants

Actual runnable script, not just an example: [`prisma/grants/001_quizbuzz_ops_reader.sql`](../prisma/grants/001_quizbuzz_ops_reader.sql).
Tested 2026-07-21 against a local copy of the main app database — role creation is idempotent
(guarded by a `\gexec` existence check, not a bare `CREATE ROLE` — dollar-quoted `DO $$` blocks don't
get psql's `:'var'` substitution, so the script avoids that shape entirely), and grants were verified
column-by-column against `information_schema.column_privileges` to land on exactly the columns listed
above — no broader access anywhere. Run it against the real main app database with:

```sh
psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -v ops_reader_password='<set a real secret>' \
  -f prisma/grants/001_quizbuzz_ops_reader.sql
```

One correction from the earlier version of this doc: `PaymentConfig` is the actual table name
(mixed-case, needs quoting — `"PaymentConfig"`), not `payment_configs`. The script uses the correct
name; note it here so nobody copies the old lowercase form from this doc's history.

Application-side pool constraints:

- `MAIN_DB_POOL_MAX`: 5-8 connections.
- Per-connection `statement_timeout`: 10 seconds.
- All SQL parameterized.
- Aggregate in SQL, not in Node over large row sets.

## 5. Ops Database Design

`quizbuzz_ops` contains data owned by the ops dashboard.

### 5.1 Enums

```prisma
enum PlatformAdminRole {
  SUPER_ADMIN
  SUPPORT
  BILLING_ADMIN
}

enum SubscriptionStatus {
  ACTIVE
  PAST_DUE
  CANCELLED
}

enum BillingCycle {
  MONTHLY
  ANNUAL
}

enum AuditTargetType {
  ORGANIZATION
  PLAN
  SUBSCRIPTION
  OVERRIDE
  PAYMENT
  BOOKING
  PRICING_CONFIG
  FEATURE_FLAG
  PLATFORM_ADMIN
}

enum OpsPaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum BookingStatus {
  QUOTED
  PAID
  PROVISIONED
  COMPLETED
  CANCELLED
}
```

### 5.2 Phase 1 Tables

```prisma
model PlatformAdmin {
  id            String            @id @default(ulid())
  email         String            @unique
  passwordHash  String
  firstName     String
  lastName      String?
  role          PlatformAdminRole @default(SUPPORT)
  isActive      Boolean           @default(true)
  twoFaSecret   String?
  twoFaEnabled  Boolean           @default(false)
  lastLoginAt   DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  refreshTokens PlatformAdminRefreshToken[]
  auditEntries  PlatformAuditLog[]
  orgNotes      OrganizationNote[]

  @@index([email])
  @@map("platform_admins")
}

model PlatformAdminRefreshToken {
  id          String    @id @default(ulid())
  adminId     String
  tokenHash   String    @unique
  deviceInfo  String?
  ipAddress   String?
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  admin       PlatformAdmin @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId])
  @@index([expiresAt])
  @@map("platform_admin_refresh_tokens")
}

model OrganizationNote {
  id             String   @id @default(ulid())
  organizationId String
  authorId       String
  body           String
  tags           String[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  author         PlatformAdmin @relation(fields: [authorId], references: [id])

  @@index([organizationId])
  @@map("organization_notes")
}

model OrganizationSuspension {
  id             String    @id @default(ulid())
  organizationId String
  reason         String
  suspendedById  String
  suspendedAt    DateTime  @default(now())
  liftedById     String?
  liftedAt       DateTime?
  liftReason     String?

  @@index([organizationId])
  @@map("organization_suspensions")
}

model PlatformAuditLog {
  id          String          @id @default(ulid())
  actorId     String?
  actorLabel  String
  action      String
  targetType  AuditTargetType
  targetId    String
  targetLabel String
  metadata    Json?
  createdAt   DateTime        @default(now())

  actor PlatformAdmin? @relation(fields: [actorId], references: [id])

  @@index([actorId])
  @@index([targetType, targetId])
  @@index([action, createdAt])
  @@map("platform_audit_logs")
}
```

### 5.3 Phase 2 Tables

```prisma
model SubscriptionPlan {
  id            String       @id @default(ulid())
  name          String
  slug          String       @unique
  description   String?
  price         Decimal      @db.Decimal(10, 2)
  currency      String       @default("INR")
  billingCycle  BillingCycle @default(MONTHLY)
  isActive      Boolean      @default(true)

  maxContestsPerCycle       Int?
  maxParticipantsPerContest Int?
  maxQuestionsPerContest    Int?
  maxOrgMembers             Int?

  featureProctoring          Boolean @default(false)
  featureCertBranding        Boolean @default(false)
  featurePrioritySupport     Boolean @default(false)
  featureAnalyticsExport     Boolean @default(false)
  featureCustomDomain        Boolean @default(false)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  subscriptions OrganizationSubscription[]

  @@index([isActive])
  @@map("subscription_plans")
}

model OrganizationSubscription {
  id                 String             @id @default(ulid())
  organizationId     String             @unique
  planId             String
  status             SubscriptionStatus @default(ACTIVE)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelledAt        DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  plan      SubscriptionPlan       @relation(fields: [planId], references: [id])
  overrides SubscriptionOverride[]
  changes   SubscriptionChangeLog[]

  @@index([planId])
  @@index([status, currentPeriodEnd])
  @@map("organization_subscriptions")
}

model SubscriptionOverride {
  id             String    @id @default(ulid())
  subscriptionId String
  field          String
  value          Int?
  reason         String
  createdById    String
  expiresAt      DateTime?
  removedAt      DateTime?
  removedById    String?
  removedReason  String?
  createdAt      DateTime  @default(now())

  subscription OrganizationSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId, removedAt])
  @@index([expiresAt])
  @@map("subscription_overrides")
}

model SubscriptionChangeLog {
  id             String   @id @default(ulid())
  subscriptionId String
  fromPlanId     String?
  toPlanId       String
  changedById    String?
  changedVia     String
  createdAt      DateTime @default(now())

  subscription OrganizationSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId])
  @@map("subscription_change_logs")
}

model OpsPayment {
  id                String           @id @default(ulid())
  organizationId    String
  purpose           String
  subscriptionId    String?
  bookingId         String?
  amount            Decimal          @db.Decimal(10, 2)
  currency          String           @default("INR")
  status            OpsPaymentStatus @default(PENDING)
  razorpayOrderId   String?          @unique
  razorpayPaymentId String?          @unique
  razorpaySignature String?
  paidAt            DateTime?
  refundedAt        DateTime?
  refundReason      String?
  refundedById      String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@index([organizationId])
  @@index([status, createdAt])
  @@map("ops_payments")
}
```

### 5.4 Later Tables

These are designed now but can be migrated later:

- `PricingConfig`
- `ContestBooking`
- `FeatureFlag`
- `OpsMessageLog`

Decision made on Razorpay Route linked-account metadata (previously listed here as an open question): ops does **not** own a shadow copy of onboarding status. `OrganizationPayoutAccount` and `PaymentRouteTransfer` live only in the main app DB, same treatment as `Payment` — ops reads and performs the narrow writes listed in Section 3, nothing more. See `ops-dashboard-backend-payouts-guide.md` and `api-payouts.md`.

## 6. Data Flow: Platform Overview

```txt
client dashboard
→ GET /api/v1/ops/overview/stats
→ route.ts
→ overview.controller
→ overview.service
→ cache lookup
→ overview.repository raw SQL on mainDbPool
→ service formats response
→ envelope response
```

Source: main DB only.

Cache:

- TTL 30-60 seconds.
- Invalidate on suspend/reactivate and subscription mutations that affect org counts/status.

## 7. Data Flow: Organization List

```txt
client
→ GET /api/v1/ops/organizations?page=1&search=...
→ organizations.service
→ organizations.repository reads main DB orgs + counts
→ subscriptions.repository reads ops DB subscriptions for page org IDs
→ service merges by organizationId
→ response
```

Sources:

- Main DB: organization identity, owner, counts, activity.
- Ops DB: plan subscription, notes summary if needed, latest suspension metadata.

## 8. Data Flow: Organization Detail

Reads are split by tab:

- Profile: main DB `Organization`, `OrganizationProfile`.
- Members: main DB `OrgMember` joined to `Admin`.
- Contests: main DB `Contest`, `PaymentConfig`, participant/payment aggregates.
- Participants: main DB `Contact`, `Participant`, `Payment`.
- Payments: main DB `Payment` joined to contest/contact/participant.
- Notes: ops DB `OrganizationNote`.
- Subscription: ops DB subscription/plan/overrides plus main DB usage queries.

## 9. Data Flow: Suspend Organization

```txt
POST /api/v1/ops/organizations/:orgId/suspend
→ validate reason
→ verify platform admin role SUPER_ADMIN
→ read main DB organization
→ update main DB organizations.isActive = false
→ insert ops DB OrganizationSuspension
→ insert ops DB PlatformAuditLog
→ invalidate caches
→ response
```

There is no transaction across the two databases. The enforced state in the main app commits first. If the ops history write fails after the main DB update, the org remains safely suspended and reconciliation/admin repair can fill history later.

Main app dependency:

- Contest creation already checks `Organization.isActive`.
- Public registration must also check the contest organization is active.

## 10. Data Flow: Add Organization Note

```txt
POST /api/v1/ops/organizations/:orgId/notes
→ validate body/tags
→ verify org exists in main DB
→ insert OrganizationNote in ops DB
→ write audit org.note_added
→ response
```

Source of truth for notes is ops DB.

## 11. Data Flow: Plan Edit

```txt
PATCH /api/v1/ops/plans/:planId
→ validate update
→ update SubscriptionPlan in ops DB
→ find active subscriptions on plan
→ recompute effective limits for each subscription
→ bulk update main DB Organization plan cache fields
→ write audit plan.updated with before/after
→ invalidate caches
→ response
```

The main app reads only:

- `Organization.planSlug`
- `Organization.planStatus` or current typo `planStaus`
- `Organization.planLimitsCache`

## 12. Data Flow: Change Organization Plan

```txt
POST /api/v1/ops/organizations/:orgId/subscription/change-plan
→ verify org exists in main DB
→ verify plan exists in ops DB
→ upsert/update OrganizationSubscription
→ insert SubscriptionChangeLog
→ recompute effective limits
→ update main DB Organization plan cache
→ write audit subscription.plan_changed
→ response
```

## 13. Data Flow: Subscription Usage

Usage is computed live from the main DB for Phase 2:

- Contests created during current subscription period.
- Peak participants among contests in the period.
- Current org member count.
- Optional: questions per contest for question-limit checks.

This avoids a new usage snapshot table in Phase 2.

## 14. Data Flow: Customer Subscription Checkout

The main app sends an organization admin to an ops-hosted billing page.

Recommended handoff:

```txt
main app org admin clicks plan
→ main app backend creates short-lived signed billing handoff token
→ browser redirects to ops URL /billing/checkout?token=...
→ ops validates token and org context
→ ops displays selected plan/payment page
→ ops creates Razorpay order for subscription
→ ops payment webhook marks OpsPayment paid
→ ops creates/updates OrganizationSubscription
→ ops writes main DB plan cache
→ user returns to main app/org billing view
```

Do not use platform-admin auth for customer billing pages.

## 15. Data Flow: Contest Registration Payments

Contest registration payments stay in the main app.

Current main app behavior:

- `Payment.amount` is stored in paise.
- `Payment.status = SUCCESS` means captured/paid.
- Razorpay webhook is source of truth.
- On captured payment, participant moves from `PENDING_PAYMENT` to `REGISTERED`.

Razorpay Route flow (shipped in the main app ahead of Phase 3, not a Phase 1/2 item):

```txt
payment.captured webhook
→ mark main app Payment SUCCESS
→ confirm participant registration
→ create Razorpay transfer to org linked account (payments.transfer, payment-bound)
→ store PaymentRouteTransfer row (gross/fee/transfer amounts, status)
```

Ops's role here is read/support only — see Section 17.

## 16. Reconciliation

Phase 2 must include a nightly reconciliation sweep:

1. Load every `OrganizationSubscription`.
2. Recompute canonical plan cache.
3. Compare against main DB `Organization` cache columns.
4. Update drifted rows.
5. Audit `system.cache_reconciled` with drift counts.

This makes cross-database consistency self-healing.

## 17. Data Flow: Organization Payout Management

Prerequisite milestone before Phase 3. Full detail in `ops-dashboard-backend-payouts-guide.md` and `api-payouts.md`; summarized here for consistency with the rest of this document.

```txt
GET /api/v1/ops/organizations/:orgId/payout-account
→ payouts.repository reads main DB organization_payout_accounts + payment_route_transfers aggregates
→ response
```

```txt
PATCH /api/v1/ops/organizations/:orgId/payout-account/link
→ verify operator role SUPER_ADMIN or BILLING_ADMIN
→ read main DB organization_payout_accounts, 404 if none
→ update main DB: status = ACTIVE, razorpayLinkedAccountId, activatedAt = now()
→ insert ops DB PlatformAuditLog org.payout_account_linked
→ response
```

```txt
PATCH /api/v1/ops/organizations/:orgId/payout-account/status
→ verify operator role SUPER_ADMIN or BILLING_ADMIN
→ update main DB organization_payout_accounts.status
→ insert ops DB PlatformAuditLog org.payout_account_status_changed
→ response
```

Same no-cross-DB-transaction caveat as Section 9 (Suspend Organization): the main DB write commits first, and an ops-side audit-insert failure does not roll back an already-correct payout account state.

Non-goals for this milestone: ops does not create Razorpay Linked Accounts via API, does not retry `FAILED`/stuck-`PENDING` transfers, and does not process refunds or reversals — those are Phase 3 billing-depth items.
