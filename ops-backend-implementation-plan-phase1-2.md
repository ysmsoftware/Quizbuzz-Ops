# QuizBuzz Ops Backend — Implementation Plan (Phase 1 & Phase 2)
### Database Design · API Documentation · Data Flows · Payment Routing Decision

**Scope of this document:**
1. Complete `quizbuzz_ops` database design (ALL phases — designed once, migrated incrementally)
2. Cross-boundary read layer — how the ops backend pulls data from the main application's database
3. Phase 1 API documentation (Platform Overview + Organizations Management)
4. Phase 2 API documentation (Subscription & Plan Management)
5. Folder structure — strict routes → controller → service → repository layering per the QuizBuzz Engineering Guidelines
6. Payment routing decision — our-Razorpay-with-wallet vs. client-connected Razorpay (with recommendation)

Conventions match the main app: standard response envelope `{ success, message, data, requestId }`, standard error envelope, same HTTP status code table, ULID primary keys, soft deletes where relevant.

---

# 1. Complete Database Design — `quizbuzz_ops`

A **separate logical database on the existing RDS/Aurora instance** (`CREATE DATABASE quizbuzz_ops`). The ops backend's Prisma schema owns these tables exclusively — its migration history never touches the main `quizbuzz` database. Everything below is written as Prisma models since that's the migration source of truth for this repo.

> Phases 1–2 need only a subset of these tables (marked per model). Design the whole schema now, migrate only what each phase needs — this prevents Phase 3/4 from forcing awkward retrofits onto Phase 1/2 tables.

## 1.1 Enums

```prisma
enum PlatformAdminRole {
  SUPER_ADMIN      // full control: plans, pricing, refunds, impersonation, flags
  SUPPORT          // read + impersonation; no billing/pricing writes
  BILLING_ADMIN    // plans, pricing, refunds; no impersonation
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

enum BookingStatus {          // Phase 4
  QUOTED
  PAID
  PROVISIONED
  COMPLETED
  CANCELLED
}

enum OpsPaymentStatus {       // Phase 3/4 — payments collected ON the ops side
  PENDING                     // (subscriptions, bookings). Contest registration
  PAID                        // payments remain in the MAIN app's Payment table.
  FAILED
  REFUNDED
}

enum OpsMessageStatus {       // Phase 3+ — billing/reminder emails sent from ops
  QUEUED
  SENT
  DELIVERED
  FAILED
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
```

## 1.2 Auth & Identity — **Phase 1**

```prisma
model PlatformAdmin {
  id            String            @id @default(ulid())
  email         String            @unique
  passwordHash  String
  firstName     String
  lastName      String?
  role          PlatformAdminRole @default(SUPPORT)
  isActive      Boolean           @default(true)
  twoFaSecret   String?           // TOTP secret (encrypted at rest via app-level crypto)
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
```

## 1.3 Organization Shadow Data — **Phase 1**

The ops DB deliberately does **not** copy `Organization` rows. It stores only ops-owned *annotations* keyed by the main app's `organizationId` (a plain string here — no FK is possible across databases, and that's fine; referential integrity for these IDs is enforced at the service layer by verifying the org exists via the cross-boundary read before writing).

```prisma
model OrganizationNote {
  id             String   @id @default(ulid())
  organizationId String   // main-app Organization.id (no cross-DB FK)
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
  suspendedById  String    // PlatformAdmin.id
  suspendedAt    DateTime  @default(now())
  liftedById     String?
  liftedAt       DateTime?

  @@index([organizationId])
  @@map("organization_suspensions")
}
```

> Why a suspension table when `Organization.isActive` lives in the main DB? The *flag* (what the main app enforces) lives in the main DB; the *history and reason* (who, why, when, when lifted) is ops-owned audit data. Suspend = one cross-boundary `UPDATE organizations SET "isActive" = false` + one local `OrganizationSuspension` insert + one `PlatformAuditLog` insert.

## 1.4 Subscription & Plans — **Phase 2**

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

  // Limits — null means unlimited
  maxContestsPerCycle       Int?
  maxParticipantsPerContest Int?
  maxQuestionsPerContest    Int?
  maxOrgMembers             Int?

  // Feature flags per plan
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
  organizationId     String             @unique  // one active subscription per org
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
  @@index([status, currentPeriodEnd])   // renewal/expiry sweeps
  @@map("organization_subscriptions")
}

model SubscriptionOverride {
  id             String    @id @default(ulid())
  subscriptionId String
  field          String    // "maxContestsPerCycle" | "maxParticipantsPerContest" | ...
  value          Int?      // null = unlimited
  reason         String    // required — this is audit-relevant
  createdById    String    // PlatformAdmin.id
  expiresAt      DateTime? // null = no expiry
  removedAt      DateTime? // soft-removed; history preserved
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
  changedById    String?  // null when change came from the billing portal (customer self-serve)
  changedVia     String   // "OPS_DASHBOARD" | "BILLING_PORTAL" | "SYSTEM_RENEWAL"
  createdAt      DateTime @default(now())

  subscription OrganizationSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId])
  @@map("subscription_change_logs")
}
```

## 1.5 Billing (ops-side payments), Bookings, Pricing — **Phase 3/4** (design now, migrate later)

```prisma
model OpsPayment {
  id               String           @id @default(ulid())
  organizationId   String
  purpose          String           // "SUBSCRIPTION" | "BOOKING"
  subscriptionId   String?
  bookingId        String?
  amount           Decimal          @db.Decimal(10, 2)
  currency         String           @default("INR")
  status           OpsPaymentStatus @default(PENDING)
  razorpayOrderId  String?          @unique
  razorpayPaymentId String?         @unique
  razorpaySignature String?
  paidAt           DateTime?
  refundedAt       DateTime?
  refundReason     String?
  refundedById     String?          // PlatformAdmin.id
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([organizationId])
  @@index([status, createdAt])
  @@map("ops_payments")
}

model PricingConfig {
  id                      String   @id @default(ulid())
  isCurrent               Boolean  @default(true)   // versioned: old rows kept, one current
  currency                String   @default("INR")
  baseBookingFee          Decimal  @db.Decimal(10, 2)
  perParticipantCost      Decimal  @db.Decimal(10, 4)
  perQuestionCost         Decimal  @db.Decimal(10, 4)
  perInstanceHourCost     Decimal  @db.Decimal(10, 2)
  participantsPerInstance Int
  cachePerDayCost         Decimal  @db.Decimal(10, 2)
  addonProctoringFlat     Decimal  @db.Decimal(10, 2)
  addonCertPerParticipant Decimal  @db.Decimal(10, 4)
  addonSupportFlat        Decimal  @db.Decimal(10, 2)
  marginMultiplier        Decimal  @db.Decimal(4, 2)
  updatedById             String
  createdAt               DateTime @default(now())

  @@index([isCurrent])
  @@map("pricing_configs")
}

model ContestBooking {
  id                String        @id @default(ulid())
  status            BookingStatus @default(QUOTED)
  organizationId    String?       // null when quoting for a not-yet-created org
  prospectOrgName   String?
  prospectEmail     String?
  contestName       String
  durationMinutes   Int
  questionCount     Int
  participantCount  Int
  addonProctoring   Boolean       @default(false)
  addonCertificates Boolean       @default(false)
  addonSupport      Boolean       @default(false)
  pricingBreakdown  Json          // FROZEN snapshot at quote time
  pricingConfigId   String        // which config version priced this
  desiredStartTime  DateTime?
  createdById       String        // PlatformAdmin (admin-assisted in v1)
  quotedAt          DateTime      @default(now())
  paidAt            DateTime?
  provisionedAt     DateTime?
  provisionedContestId String?    // main-app Contest.id once created
  cancelledAt       DateTime?
  cancelReason      String?

  @@index([status])
  @@index([organizationId])
  @@map("contest_bookings")
}
```

## 1.6 Audit, Flags, Messaging — **Phase 3/5** (design now)

```prisma
model PlatformAuditLog {
  id          String          @id @default(ulid())
  actorId     String?         // null for SYSTEM actions (renewal sweeps, reconciliation)
  actorLabel  String          // denormalized "Jane (SUPER_ADMIN)" — survives admin deletion
  action      String          // "org.suspended", "plan.updated", "override.added", ...
  targetType  AuditTargetType
  targetId    String
  targetLabel String          // denormalized human-readable name
  metadata    Json?           // before/after diff or details
  createdAt   DateTime        @default(now())

  actor PlatformAdmin? @relation(fields: [actorId], references: [id])

  @@index([actorId])
  @@index([targetType, targetId])
  @@index([action, createdAt])
  @@map("platform_audit_logs")
}

model FeatureFlag {
  id            String   @id @default(ulid())
  key           String   @unique
  label         String
  description   String?
  isEnabled     Boolean  @default(false)
  updatedById   String?
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())

  @@map("feature_flags")
}

model OpsMessageLog {
  id             String           @id @default(ulid())
  organizationId String
  template       String           // "RENEWAL_REMINDER" | "INVOICE" | "PAYMENT_FAILED" | ...
  recipient      String
  subject        String?
  status         OpsMessageStatus @default(QUEUED)
  sentAt         DateTime?
  failureReason  String?
  createdAt      DateTime         @default(now())

  @@index([organizationId])
  @@index([status, createdAt])
  @@map("ops_message_logs")
}
```

## 1.7 The three cache columns added to the MAIN app's `Organization` table

The only schema change to the main `quizbuzz` database (a normal migration in the **main app's** repo — the ops repo never migrates the main DB):

```prisma
// In the MAIN app's schema.prisma — added to model Organization:
  planSlug         String?
  planStatus       String?   // "active" | "past_due" | "cancelled"
  planLimitsCache  Json?     // effective limits: plan + active overrides, flattened
```

Written by the ops backend on every subscription mutation; read locally by the main app's `ContestService`/`RegistrationService` for limit enforcement with zero runtime dependency on Island B.

---

# 2. Cross-Boundary Read Layer — How Ops Pulls Main-App Data

## 2.1 Two connections, two trust levels

| Connection | Target | Client | Postgres role | Rights |
|---|---|---|---|---|
| `prisma` | `quizbuzz_ops` DB | Prisma Client | `quizbuzz_ops_owner` | Full DDL/DML on ops tables; migrations run here |
| `mainDbPool` | `quizbuzz` DB | raw `pg.Pool` | `quizbuzz_ops_reader` | See grants below |

**Role setup (run once against the main DB):**

```sql
CREATE ROLE quizbuzz_ops_reader LOGIN PASSWORD '...' CONNECTION LIMIT 10;

GRANT SELECT ON organizations, org_members, admins, contests, participants,
                contacts, payments, contest_questions, leaderboard_entries,
                contest_analytics_snapshots TO quizbuzz_ops_reader;

-- The ONLY writes ops may make into the main DB:
GRANT UPDATE (isActive, planSlug, planStatus, "planLimitsCache")
  ON organizations TO quizbuzz_ops_reader;
```

`CONNECTION LIMIT 10` is enforced by Postgres itself — a runaway ops query can queue ops requests but can never starve the customer-facing app's pool (the direct lesson from incident-log Bug #18). App-side, `mainDbPool` is configured with `max: 8` (below the role cap, leaving headroom for a psql debugging session) and a `statement_timeout` of 10s set per-connection, so no ad-hoc aggregate can hold a connection hostage.

## 2.2 Query pattern

Repositories that touch main-app data contain **only parameterized raw SQL** against `mainDbPool` — no logic, matching the repository rule. Aggregations (counts, sums, GROUP BY) are pushed into SQL, not computed in Node over huge row sets. Where a page needs both cross-boundary data and ops data (e.g. org list with plan badges), the **service layer** performs the merge: one SQL query to the main DB, one Prisma query to the ops DB, joined in memory on `organizationId`. This is deliberate — the coupling stays visible in TypeScript rather than hidden in DB-level plumbing (no `postgres_fdw`).

## 2.3 Caching

Aggregate-heavy endpoints (platform stats, org list) cache their results in the local Redis container with short TTLs (30–60s), keyed as `ops:cache:{endpoint}:{paramsHash}`. Redis here is disposable — flushing it at any time loses nothing but a few seconds of query savings. Mutations that affect cached aggregates (suspend, plan change) delete the relevant `ops:cache:*` keys on success.

---

# 3. Folder Structure — Strict Layering

```
ops-backend/
├── prisma/
│   ├── schema.prisma                  # quizbuzz_ops tables ONLY
│   └── migrations/
├── src/
│   ├── config/
│   │   ├── index.ts                   # single typed export, Zod-validated at startup
│   │   ├── app.config.ts              # PORT, NODE_ENV, CORS origins
│   │   ├── db.config.ts               # OPS_DATABASE_URL, MAIN_DATABASE_URL,
│   │   │                              #   MAIN_DB_POOL_MAX, MAIN_DB_STATEMENT_TIMEOUT
│   │   ├── redis.config.ts            # local redis host/port, cache TTLs
│   │   ├── auth.config.ts             # ops JWT secrets/TTLs (distinct from main app),
│   │   │                              #   handoff-token public key (Phase 3+)
│   │   └── queue.config.ts            # scaffolded; unused until a real async need
│   │
│   ├── shared/
│   │   ├── db/
│   │   │   ├── prisma.ts              # PrismaClient → quizbuzz_ops
│   │   │   └── main-db-pool.ts        # pg.Pool → quizbuzz (readonly role)
│   │   ├── middleware/
│   │   │   ├── auth-guard.ts          # verifies ops JWT, attaches admin to req
│   │   │   ├── require-role.ts        # requireRole('SUPER_ADMIN', 'BILLING_ADMIN')
│   │   │   ├── error-handler.ts       # AppError → envelope, requestId always
│   │   │   ├── request-id.ts
│   │   │   └── rate-limiter.ts        # redis-backed; login endpoints especially
│   │   ├── errors/AppError.ts
│   │   ├── cache/redis-cache.ts       # get/set/invalidate helpers with key prefixing
│   │   ├── audit/audit-writer.ts      # writeAudit(actor, action, target, metadata)
│   │   │                              #   — called from services, never controllers
│   │   └── types/envelope.ts          # ok()/fail() response builders
│   │
│   ├── modules/
│   │   ├── platform-auth/             # ═══ PHASE 1 ═══
│   │   │   ├── platform-auth.routes.ts
│   │   │   ├── platform-auth.controller.ts
│   │   │   ├── platform-auth.service.ts
│   │   │   ├── platform-auth.repository.ts     # Prisma: PlatformAdmin, refresh tokens
│   │   │   ├── platform-auth.validator.ts      # Zod schemas per endpoint
│   │   │   └── platform-auth.types.ts
│   │   │
│   │   ├── overview/                  # ═══ PHASE 1 ═══
│   │   │   ├── overview.routes.ts
│   │   │   ├── overview.controller.ts
│   │   │   ├── overview.service.ts             # merges main-DB aggregates + cache
│   │   │   ├── overview.repository.ts          # raw SQL aggregates on mainDbPool
│   │   │   └── overview.types.ts
│   │   │
│   │   ├── organizations/             # ═══ PHASE 1 ═══
│   │   │   ├── organizations.routes.ts
│   │   │   ├── organizations.controller.ts
│   │   │   ├── organizations.service.ts
│   │   │   ├── organizations.repository.ts     # SPLIT INTERNALLY:
│   │   │   │                                   #   main-db reads (raw SQL) +
│   │   │   │                                   #   ops-db notes/suspensions (Prisma)
│   │   │   ├── organizations.validator.ts
│   │   │   └── organizations.types.ts
│   │   │
│   │   ├── plans/                     # ═══ PHASE 2 ═══
│   │   │   ├── plans.routes.ts
│   │   │   ├── plans.controller.ts
│   │   │   ├── plans.service.ts
│   │   │   ├── plans.repository.ts             # Prisma only
│   │   │   ├── plans.validator.ts
│   │   │   └── plans.types.ts
│   │   │
│   │   ├── subscriptions/             # ═══ PHASE 2 ═══
│   │   │   ├── subscriptions.routes.ts
│   │   │   ├── subscriptions.controller.ts
│   │   │   ├── subscriptions.service.ts        # owns the planLimitsCache write-through
│   │   │   ├── subscriptions.repository.ts     # Prisma (subs/overrides) +
│   │   │   │                                   #   one raw-SQL write (Organization cache cols)
│   │   │   ├── subscriptions.validator.ts
│   │   │   └── subscriptions.types.ts
│   │   │
│   │   ├── billing/                   # Phase 3 (scaffold only for now)
│   │   ├── bookings/                  # Phase 4
│   │   ├── pricing/                   # Phase 4
│   │   ├── audit-log/                 # Phase 3 read API (audit-writer ships in Phase 1)
│   │   ├── feature-flags/             # Phase 5
│   │   ├── observability/             # Phase 5
│   │   └── billing-portal/            # Phase 3+ (public, handoff-token auth)
│   │
│   ├── app.ts                         # express app assembly, middleware order
│   └── server.ts                      # boot, config validation, graceful shutdown
```

**Layer responsibilities (restating the rulebook as applied here):**
- **routes** — path definitions, middleware binding (`authGuard`, `requireRole`, validator) only
- **controller** — parse validated input, call one service method, shape the envelope; zero business logic
- **service** — all business logic, all cross-source merging, all audit writes, all cache invalidation
- **repository** — parameterized queries only (Prisma or raw SQL); no branching logic beyond query construction
- **validator** — Zod schemas; every endpoint's body/query/params validated before the controller runs

Note: `audit-writer.ts` ships in **Phase 1**, not Phase 3 — Phase 1's suspend/note mutations must write audit rows from day one so the Phase 3 audit-log *read* API opens onto real history, not an empty table.

---

# 4. Phase 1 — API Documentation

Base URL: `https://ops.ysmquizbuzz.com/api/v1` · All routes below require the ops access-token (httpOnly cookie or Bearer) unless marked public. Token strategy mirrors the main app: 30-min access, 7-day refresh, hashed refresh tokens.

## 4.1 Auth — `/auth`

| Method & Path | Purpose | Roles |
|---|---|---|
| `POST /auth/login` | Email + password → if 2FA enabled, returns `{ twoFaRequired: true, challengeToken }`; else sets cookies | public |
| `POST /auth/verify-2fa` | `{ challengeToken, totpCode }` → sets access+refresh cookies | public |
| `POST /auth/refresh` | Refresh-token cookie → new access token | public (cookie) |
| `POST /auth/logout` | Revoke current refresh token | any |
| `GET  /auth/me` | Current admin profile + role | any |
| `POST /auth/setup-2fa` | Returns TOTP provisioning URI/QR payload; confirmed via verify | any |

**Data flow (login):** controller → `platform-auth.service.login()` → repository fetch by email → bcrypt/argon2 compare → 2FA branch → issue tokens (refresh hash persisted) → audit `admin.logged_in`. Rate-limited per-IP and per-email via Redis (`rate-limiter.ts`) — 5 attempts / 10 min, mirroring the main app's OTP limits.

## 4.2 Platform Overview — `/overview`

| Method & Path | Purpose |
|---|---|
| `GET /overview/stats` | The KPI row: org counts (active/suspended), contest counts by status, total participants, revenue totals (all-time + this month) |
| `GET /overview/org-growth?weeks=12` | New orgs per week — chart series |
| `GET /overview/upcoming-contests?days=7` | Contests with `startTime` in window, joined with org name/participant counts |
| `GET /overview/recent-orgs?limit=5` | Most recently created orgs |

**Example — `GET /overview/stats` response `data`:**
```json
{
  "organizations": { "total": 14, "active": 12, "suspended": 2 },
  "contests": { "total": 137, "byStatus": { "DRAFT": 21, "PUBLISHED": 18, "LIVE": 1, "RESULTS_OUT": 40, "COMPLETED": 55, "CANCELLED": 2 } },
  "participants": { "total": 48210 },
  "revenue": { "allTime": 2471350.00, "thisMonth": 184200.00, "currency": "INR" },
  "computedAt": "2026-07-16T09:12:00.000Z"
}
```

**Data flow:** service checks Redis (`ops:cache:overview:stats`, TTL 60s) → miss → `overview.repository` runs 4 aggregate SQL queries in parallel on `mainDbPool` (COUNT/SUM/GROUP BY pushed into Postgres) → service assembles, caches, returns. `computedAt` is surfaced so the UI can honestly show data age.

## 4.3 Organizations — `/organizations`

| Method & Path | Purpose | Roles |
|---|---|---|
| `GET  /organizations` | Paginated list. Query: `page, limit, search, status(active\|suspended), planId, sort` | any |
| `GET  /organizations/:orgId` | Header/profile: org fields + member/contest/participant/revenue counts + suspension state + plan badge (Phase 2 join) | any |
| `GET  /organizations/:orgId/members` | OrgMember ⋈ Admin (name, email, role, joined) — read-only | any |
| `GET  /organizations/:orgId/contests` | Paginated contests for org; per-row participant count + revenue | any |
| `GET  /organizations/:orgId/contests/:contestId` | Contest drill-down (drawer view) | any |
| `GET  /organizations/:orgId/participants` | Paginated, filter `contestId`, search name/email/phone. Contact ⋈ Participant ⋈ Payment | any |
| `GET  /organizations/:orgId/payments` | Paginated payment history + summary card (collected/refunded/pending) | any |
| `GET  /organizations/:orgId/notes` | Ops notes list (ops DB) | any |
| `POST /organizations/:orgId/notes` | `{ body, tags[] }` → create note; audit `org.note_added` | any |
| `POST /organizations/:orgId/suspend` | `{ reason }` (required) → cross-boundary `isActive=false` + `OrganizationSuspension` row + audit `org.suspended` | SUPER_ADMIN |
| `POST /organizations/:orgId/reactivate` | `{ reason }` → `isActive=true` + close suspension row + audit `org.reactivated` | SUPER_ADMIN |

**Example — `GET /organizations` response `data`:**
```json
{
  "organizations": [
    {
      "id": "org_01H...", "name": "Acme Academy", "slug": "acme-academy",
      "ownerEmail": "owner@acme.com", "memberCount": 4,
      "contestCount": 12, "participantCount": 3480,
      "status": "active",
      "plan": { "slug": "growth", "name": "Growth", "status": "ACTIVE" },
      "createdAt": "2025-11-02T..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 14, "totalPages": 1 }
}
```

**Data flow (list):** repository runs one main-DB SQL query (orgs + LEFT JOIN lateral counts, filtered/paginated in SQL) → service fetches matching `OrganizationSubscription` rows from ops DB by the page's `organizationId`s → in-memory merge → cache 30s.

**Data flow (suspend) — the canonical cross-boundary write:**
1. Validator: reason required, non-empty
2. Service: verify org exists + not already suspended (main-DB read)
3. `UPDATE organizations SET "isActive" = false WHERE id = $1` via `mainDbPool`
4. Prisma insert `OrganizationSuspension`
5. `writeAudit(actor, 'org.suspended', ORGANIZATION, orgId, orgName, { reason })`
6. Invalidate `ops:cache:overview:*` and `ops:cache:orgs:*`

Steps 3–5 span two databases → no single transaction is possible. Ordering is chosen so the *enforced* state (main DB) commits first; if 4/5 fail, the org is safely suspended with a gap in ops history — logged as an error and repaired by the nightly reconciliation sweep (see §5.4). Never the reverse order, which could show "suspended" in ops while the customer app still allows everything.

**Suspension enforcement note (main-app work, tracked here):** the main backend's `ContestService.create` and registration flow must check `organization.isActive` before allowing writes — the field exists in the schema today but per the API docs nothing reads it. Without this, suspension is cosmetic. Small change; belongs to the main repo; a Phase 1 dependency.

---

# 5. Phase 2 — API Documentation

## 5.1 Plans — `/plans`

| Method & Path | Purpose | Roles |
|---|---|---|
| `GET   /plans` | All plans + `organizationCount` per plan. Query: `includeInactive` | any |
| `GET   /plans/:planId` | Single plan detail | any |
| `POST  /plans` | Create plan (limits null = unlimited). Audit `plan.created` | SUPER_ADMIN, BILLING_ADMIN |
| `PATCH /plans/:planId` | Update. Response of a prior `GET /plans/:planId/impact` drives the UI's "affects N orgs" confirm. Audit `plan.updated` with before/after metadata | SUPER_ADMIN, BILLING_ADMIN |
| `GET   /plans/:planId/impact` | `{ organizationCount, organizations: [{id,name}] (first 10) }` — powers the confirmation dialog before a global edit | SUPER_ADMIN, BILLING_ADMIN |
| `POST  /plans/:planId/deactivate` | Soft-deactivate: existing subscribers keep it; no new assignments. Audit `plan.deactivated` | SUPER_ADMIN, BILLING_ADMIN |

**Create request body:**
```json
{
  "name": "Growth", "slug": "growth", "description": "...",
  "price": 2999, "currency": "INR", "billingCycle": "MONTHLY",
  "limits": { "maxContestsPerCycle": 10, "maxParticipantsPerContest": 1000,
              "maxQuestionsPerContest": 100, "maxOrgMembers": 5 },
  "features": { "proctoring": true, "certBranding": false,
                "prioritySupport": false, "analyticsExport": true, "customDomain": false }
}
```

**Critical data flow — `PATCH /plans/:planId` (a global limit change):**
1. Update `SubscriptionPlan`
2. Fetch every ACTIVE `OrganizationSubscription` on this plan
3. For each: recompute effective limits (new plan values ⊕ that org's active, unexpired overrides) → batch-update `planLimitsCache`/`planSlug` on the main DB's `organizations` (single bulk `UPDATE ... FROM (VALUES ...)` — the bulk-SQL-over-loops lesson from the seeding incident applies here too)
4. Audit with before/after diff
5. Invalidate plan + org caches

This is why plan edits *must* go through `plans.service` and never as a bare repository call — step 3 is the contract that keeps the main app's enforcement in sync.

## 5.2 Subscriptions — `/organizations/:orgId/subscription`

| Method & Path | Purpose | Roles |
|---|---|---|
| `GET    /organizations/:orgId/subscription` | Current plan, period, status, effective limits, usage-vs-limits, active+historical overrides, change history | any |
| `POST   /organizations/:orgId/subscription` | Assign a plan to an org that has none (also the backfill path for existing orgs). Audit `subscription.created` | SUPER_ADMIN, BILLING_ADMIN |
| `POST   /organizations/:orgId/subscription/change-plan` | `{ planId }` → plan switch; writes `SubscriptionChangeLog(changedVia: OPS_DASHBOARD)`; syncs cache columns. Audit `subscription.plan_changed` | SUPER_ADMIN, BILLING_ADMIN |
| `GET    /organizations/:orgId/subscription/usage` | Usage-vs-limits, computed live (see below) | any |
| `POST   /organizations/:orgId/subscription/overrides` | `{ field, value (null=unlimited), reason (required), expiresAt? }` → create; recompute+sync cache. Audit `override.added` | SUPER_ADMIN, BILLING_ADMIN |
| `DELETE /organizations/:orgId/subscription/overrides/:overrideId` | Requires `{ reason }`. Soft-remove (sets `removedAt`); recompute+sync. Audit `override.removed` | SUPER_ADMIN, BILLING_ADMIN |

**Example — `GET .../subscription` response `data` (abridged):**
```json
{
  "plan": { "id": "...", "slug": "growth", "name": "Growth", "price": 2999, "billingCycle": "MONTHLY" },
  "status": "ACTIVE",
  "currentPeriodStart": "2026-07-01T...", "currentPeriodEnd": "2026-08-01T...",
  "effectiveLimits": {
    "maxContestsPerCycle": { "value": 15, "planValue": 10, "overridden": true },
    "maxParticipantsPerContest": { "value": 1000, "planValue": 1000, "overridden": false },
    "maxQuestionsPerContest": { "value": 100, "planValue": 100, "overridden": false },
    "maxOrgMembers": { "value": 5, "planValue": 5, "overridden": false }
  },
  "usage": { "contestsThisCycle": 7, "peakParticipantsThisCycle": 640, "memberCount": 4 },
  "overrides": [ { "id": "...", "field": "maxContestsPerCycle", "value": 15,
                   "reason": "Diwali contest series", "expiresAt": "2026-08-15T...",
                   "createdBy": "Austin", "status": "active" } ],
  "changeHistory": [ { "from": "starter", "to": "growth", "via": "OPS_DASHBOARD",
                       "by": "Austin", "at": "2026-06-12T..." } ]
}
```

**Usage computation:** not stored. `subscriptions.service.getUsage()` calls a repository method that runs, on `mainDbPool`: contests created in `[currentPeriodStart, now)` for the org; max participant count among that cycle's contests; current member count. Cheap at current scale; the query set is fixed and indexed (`contests(organizationId, status)` and `createdAt` cover it). If it ever gets expensive → snapshot table, but not now.

## 5.3 Effective-limit computation (single source of truth)

One pure function in `subscriptions.service`, used by *every* path that syncs the cache (plan change, plan edit, override add/remove/expire, reconciliation):

```
effectiveLimit(field) =
  latest active override for field (removedAt IS NULL AND (expiresAt IS NULL OR expiresAt > now))
  ?? plan[field]          // null still means unlimited
```

## 5.4 Two background jobs Phase 2 introduces (node-cron in-process; BullMQ unnecessary at this cadence)

1. **Override-expiry sweep (hourly):** find overrides with `expiresAt <= now AND removedAt IS NULL` → recompute + sync `planLimitsCache` for the affected orgs → audit `override.expired` (SYSTEM actor). Without this, an expired override silently keeps inflating a limit in the main app's cache.
2. **Reconciliation sweep (nightly):** for every `OrganizationSubscription`, recompute canonical `{planSlug, planStatus, planLimitsCache}` and compare against the main DB's columns; re-push any drift; audit `system.cache_reconciled` with a drift count. This is the self-healing layer for the cross-database write gap described in §4.3 — same lesson as the Redis migration tooling: dual-store consistency needs a sweep, not just happy-path writes.

---

# 6. Payment Routing — Contest Registration Fees (Decision Section)

**The question:** today, participant registration fees for *client organizations'* contests flow into *your* Razorpay account (single-key setup, webhook pointed at your domain). Two options were on the table: (A) keep collecting centrally + build a wallet/ledger/payout system, or (B) have each org connect their own Razorpay so money lands directly with them.

**The short answer: there is a third option that is better than both, and it's what Razorpay is built for — <cite index="7-1">Razorpay Route, which is designed for exactly this "platform collects, third parties receive" marketplace model: it lets you split incoming funds among multiple third parties, manage linked-account settlements, and handle refunds with automated reversals</cite>. Option A without Route is something you should not build; Option B is a good *later-stage* addition for large orgs. Recommendation: Route now, org-owned keys as an opt-in tier-2 feature later.**

## 6.1 Why Option A (central collection + homemade wallet) should be rejected

Beyond the build cost you already flagged (ledger, payout scheduling, withdrawal flows, reconciliation, failed-payout retries — genuinely a product in itself), there's a harder problem: **holding other businesses' money and settling it to them later is a regulated activity in India.** Collecting funds on behalf of merchants and disbursing on a schedule is the definition of payment aggregation, which RBI requires a PA (Payment Aggregator) authorization for. Razorpay Route exists precisely so platforms don't have to become regulated money-handlers themselves — <cite index="5-1">money movement carries strict compliance requirements and frequent auditing, and Route handles those complexities and regulatory requirements out of the box</cite>. A homemade wallet also concentrates every risk you've been architecting away: your DB becomes a financial ledger requiring exactly-once semantics, and any bug is now a *money* bug. Reject this path; I'd treat it as a hard "no" rather than a deferred option.

## 6.2 The recommended path: Razorpay Route (linked accounts)

How it maps onto QuizBuzz:

1. **Org onboarding** — when an org wants to run paid contests, they complete a one-time "payout setup" (business details + bank account). Your backend calls Razorpay's Linked Account APIs to create the account under your main Razorpay account — <cite index="5-1">onboarding vendors/sellers as linked accounts happens without physical paperwork</cite>. Store `razorpayLinkedAccountId` on `Organization` (one new column in the main DB; onboarding status lives in ops).
2. **Payment flow — almost nothing changes.** Participants still pay through *your* key on *your* checkout, exactly as today. Your webhook stays yours, your signature verification stays yours, `organizationId` in the order notes already disambiguates. The only addition: after `payment.captured`, create a **Transfer** for that payment to the org's linked account, minus your platform commission — <cite index="5-1">for each payment you create as many transfers as needed with complete control over the splitting logic</cite>.
3. **Settlement is Razorpay's problem, not yours.** <cite index="5-1">You control fund movement with flexible settlement plans — periodic settlements, or deferred until business conditions are met</cite>, and <cite index="9-1">transfers can be put on hold indefinitely and released when you allow it</cite> — which maps neatly onto "hold funds until the contest actually completes," a genuinely useful anti-fraud lever for a contest platform.
4. **Orgs get their own visibility for free** — <cite index="6-1">linked accounts can be granted access to a dedicated Razorpay dashboard to see their settlements</cite>, so "where's my money" support queries mostly answer themselves.
5. **Refunds** — <cite index="7-1">Route supports reversing transferred funds and managing customer refunds with automated reversals</cite>, so a contest-cancellation refund pulls back the org's split automatically instead of you chasing them for it.

**Why this wins:** ~90% of the wallet system's *purpose* (orgs get their money, on a schedule, with holds and reconciliation) for ~10% of the build (linked-account onboarding UI + one transfer call in the webhook handler + a transfers view in the ops dashboard). Your commission becomes structural — deducted at split time — rather than an invoicing problem. And it keeps the webhook/key architecture you already have intact.

**What it costs:** Route charges a fee per transfer (check current pricing — it's typically a small percentage; price it into your commission), settlements to linked accounts are T+n rather than instant-to-org, and orgs must complete KYC-ish onboarding before their first paid contest (gate "publish paid contest" on `linkedAccountStatus = active`; free contests need nothing).

## 6.3 Option B (org-owned Razorpay keys) — real, but a tier-2 feature, and your webhook concern is solvable

You're right that the naive version is messy: storing each org's `key_id`/`key_secret` (encrypted, KMS-wrapped — a real secrets-handling responsibility), and your webhook concern is valid — the webhook must be registered *on the org's Razorpay account* pointing back at your domain. That part is actually mechanical: Razorpay lets webhooks be created programmatically, so during connect you'd register `https://ysmquizbuzz.com/api/payments/webhook/org/{organizationId}` on their account with a per-org webhook secret you generate and store — the org never touches webhook config themselves, which answers your "client can't set up the webhook" point. The smoother "sign-in style" version you described is Razorpay's **Partner/OAuth onboarding** (org clicks "Connect Razorpay," authorizes your app, you receive scoped tokens instead of raw keys — the Stripe-Connect-style flow). It exists, but it means a partner-program relationship, token refresh management, per-org webhook secret handling, and a second payment code path in the main backend that must coexist with the default path forever.

That's why it's tier-2: offer it later as an enterprise-ish option for orgs that insist money must land in their account with zero platform intermediation (some institutions will). Don't make it the default — Route gives every small org the same outcome with none of that per-org integration surface.

## 6.4 What this means for the codebases (summary of changes)

**Main app (Island A):**
- `Organization`: add `razorpayLinkedAccountId String?` (+ the 3 plan-cache columns from §1.7)
- Webhook handler: on `payment.captured` for a contest with `registrationFee > 0` and an org with an active linked account → create Transfer (commission % from config, per your rulebook — `PLATFORM_COMMISSION_PERCENT` env, no magic numbers). Feature-flag the transfer step so rollout is reversible.
- Publish-contest validation: block paid contests until linked-account onboarding is complete.

**Ops backend (Island B) — new module, Phase 3-adjacent (`payouts/` or folded into `billing/`):**
- Linked-account onboarding status per org (initiate/track; the Route account-creation calls can live here since ops owns "commercial relationship" concerns)
- Transfers/settlements read view per org (Razorpay fetch APIs) — this becomes a "Payouts" tab on the org detail page
- Commission reporting: platform revenue = subscription income (`OpsPayment`) + Route commission retained — one honest revenue dashboard across both streams

**Ops dashboard subscription/booking payments (billing portal):** unaffected by all of this — those are *your* revenue, collected on your key directly, stored in `OpsPayment`. Route only concerns *client orgs'* contest-registration money.

---

# 7. Implementation Order (Phase 1 → Phase 2)

**Phase 1 (build in this order):**
1. Bootstrap: `CREATE DATABASE quizbuzz_ops`, roles + grants (§2.1), repo scaffold, config layer, error/envelope/request-id middleware
2. `platform-auth` module + seed script for the first SUPER_ADMIN (CLI seed, not an open register endpoint — this surface never gets self-signup)
3. `shared/audit/audit-writer.ts` (before any mutation exists)
4. `overview` module (read-only — proves the cross-boundary layer + caching end-to-end with zero write risk)
5. `organizations` module: reads first (list → detail → sub-tabs), then notes, then suspend/reactivate
6. Main-app dependency: `isActive` enforcement checks in `ContestService`/registration (small PR in the main repo)

**Phase 2:**
1. Prisma migration: plans/subscriptions/overrides/change-log tables
2. Main-app migration: the 3 cache columns on `Organization`
3. `plans` module (CRUD + impact endpoint)
4. `subscriptions` module: effective-limit function first (pure, unit-tested), then endpoints, then the cache write-through
5. Backfill: assign every existing org a default plan (seed script) so `GET /organizations` never has plan-less rows
6. The two cron sweeps (override expiry, nightly reconciliation)
7. Main-app dependency: `ContestService`/`RegistrationService` read `planLimitsCache` and enforce limits (feature-flagged so enforcement can be turned on org-by-org or globally once backfill is verified)

Frontend integration point: each module above replaces the corresponding mock file in the ops dashboard's `/src/api/` folder — hooks and components untouched, exactly as the mock architecture was designed for.

---
*Prepared against: current `schema.txt`, `quizbuzz-api-docs.md`, the two-island architecture agreed in this thread, and the QuizBuzz Engineering Guidelines (config-agnostic logic, strict module layering, no in-memory state, idempotency on payment paths). Razorpay Route capabilities cited from Razorpay's current documentation — verify current Route pricing before committing to commission percentages.*
