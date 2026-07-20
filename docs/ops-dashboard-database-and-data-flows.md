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

## 3. Main App Fields Ops May Write

Ops should have a restricted database role. In Phase 1 and Phase 2, allowed main DB writes are intentionally narrow:

| Table | Column | Reason |
|---|---|---|
| `organizations` | `isActive` | Suspend/reactivate org |
| `organizations` | `planSlug` | Current plan cache |
| `organizations` | `planStaus` or `planStatus` | Current subscription status cache |
| `organizations` | `planLimitsCache` | Effective entitlement cache |

The main app currently has `planStaus` misspelled. Before Phase 2 implementation, choose one path:

1. Fix the main app schema/migration to `planStatus`, preferred.
2. Keep writing `planStaus` and document the compatibility debt.

Do not silently assume `planStatus` exists.

## 4. Suggested Main DB Role Grants

Example shape, adjusted to exact production table names and ownership:

```sql
CREATE ROLE quizbuzz_ops_reader LOGIN PASSWORD '...';

GRANT CONNECT ON DATABASE quizbuzz TO quizbuzz_ops_reader;
GRANT USAGE ON SCHEMA public TO quizbuzz_ops_reader;

GRANT SELECT ON
  organizations,
  organization_profiles,
  org_members,
  admins,
  contests,
  payment_configs,
  contacts,
  participants,
  payments,
  submissions,
  leaderboard_entries,
  certificates,
  proctoring_events,
  proctoring_scores,
  message_logs,
  scheduled_jobs,
  contest_analytics_snapshots
TO quizbuzz_ops_reader;

GRANT UPDATE ("isActive", "planSlug", "planStaus", "planLimitsCache")
  ON organizations TO quizbuzz_ops_reader;
```

If the typo is migrated to `planStatus`, update the grant accordingly.

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
- Razorpay Route linked-account metadata, if ops owns onboarding status.

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

Later Razorpay Route flow:

```txt
payment.captured webhook
→ mark main app Payment SUCCESS
→ confirm participant registration
→ create Razorpay transfer to org linked account
→ store route/transfer metadata
```

This is not Phase 1 or Phase 2.

## 16. Reconciliation

Phase 2 must include a nightly reconciliation sweep:

1. Load every `OrganizationSubscription`.
2. Recompute canonical plan cache.
3. Compare against main DB `Organization` cache columns.
4. Update drifted rows.
5. Audit `system.cache_reconciled` with drift counts.

This makes cross-database consistency self-healing.
