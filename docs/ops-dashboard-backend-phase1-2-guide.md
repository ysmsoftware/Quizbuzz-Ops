# QuizBuzz Ops Backend Implementation Guide: Phase 1 and Phase 2

## 1. Architecture Decision

Build the ops backend inside this existing Next.js application.

Do not create a separate Express backend for Phase 1 or Phase 2. The app is internal, low traffic, and the frontend already exists in this repo. The backend should use Next.js route handlers as the HTTP routing layer, while preserving controller/service/repository separation in server modules.

```txt
Next.js app
├── app/dashboard/*                 existing frontend pages
├── app/api/v1/ops/*                backend route handlers
├── app/billing/*                   later customer-facing billing pages
├── server/features/*               backend modules
├── server/db/*                     database clients
├── server/http/*                   envelope, errors, auth helpers
├── prisma/*                        ops DB schema/migrations
└── lib/api/*                       frontend API clients replacing mocks
```

## 2. Layering Rules

### Route Handler

Location: `app/api/v1/ops/**/route.ts`

Responsibility:

- Export HTTP methods.
- Call controller.
- No business logic.
- No database calls.

### Controller

Responsibility:

- Read params/query/body.
- Call validator.
- Call one service method.
- Return standard envelope.
- No business logic.

### Service

Responsibility:

- Business rules.
- Cross-database orchestration.
- Cache invalidation.
- Audit writes.
- Effective-limit computation.
- Permission-sensitive decisions.

### Repository

Responsibility:

- Prisma queries for ops DB.
- Parameterized raw SQL for main DB.
- No business branching beyond query construction.

### Validator

Responsibility:

- Zod schemas for params/query/body.
- Shared inferred input types.

## 3. Target Folder Structure

```txt
app/
├── api/
│   └── v1/
│       └── ops/
│           ├── health/route.ts
│           ├── auth/
│           │   ├── login/route.ts
│           │   ├── verify-2fa/route.ts
│           │   ├── refresh/route.ts
│           │   ├── logout/route.ts
│           │   ├── me/route.ts
│           │   └── setup-2fa/route.ts
│           ├── overview/
│           │   ├── stats/route.ts
│           │   ├── org-growth/route.ts
│           │   ├── upcoming-contests/route.ts
│           │   └── recent-orgs/route.ts
│           ├── organizations/
│           │   ├── route.ts
│           │   └── [orgId]/
│           │       ├── route.ts
│           │       ├── members/route.ts
│           │       ├── contests/route.ts
│           │       ├── participants/route.ts
│           │       ├── payments/route.ts
│           │       ├── notes/route.ts
│           │       ├── suspend/route.ts
│           │       ├── reactivate/route.ts
│           │       └── subscription/
│           │           ├── route.ts
│           │           ├── change-plan/route.ts
│           │           ├── usage/route.ts
│           │           └── overrides/
│           │               ├── route.ts
│           │               └── [overrideId]/route.ts
│           └── plans/
│               ├── route.ts
│               └── [planId]/
│                   ├── route.ts
│                   ├── impact/route.ts
│                   └── deactivate/route.ts
│
├── billing/
│   └── checkout/page.tsx            Phase 2 customer-facing billing page
│
server/
├── config/
│   ├── env.ts
│   ├── auth.config.ts
│   ├── db.config.ts
│   └── cache.config.ts
│
├── db/
│   ├── ops-prisma.ts
│   └── main-db-pool.ts
│
├── http/
│   ├── envelope.ts
│   ├── errors.ts
│   ├── parse-request.ts
│   ├── request-context.ts
│   ├── auth-guard.ts
│   ├── require-role.ts
│   └── validation.ts
│
├── cache/
│   └── cache.ts
│
├── audit/
│   └── audit-writer.ts
│
├── jobs/
│   ├── override-expiry.job.ts
│   └── subscription-reconciliation.job.ts
│
└── features/
    ├── platform-auth/
    │   ├── platform-auth.controller.ts
    │   ├── platform-auth.service.ts
    │   ├── platform-auth.repository.ts
    │   ├── platform-auth.validator.ts
    │   └── platform-auth.types.ts
    │
    ├── overview/
    │   ├── overview.controller.ts
    │   ├── overview.service.ts
    │   ├── overview.repository.ts
    │   └── overview.types.ts
    │
    ├── organizations/
    │   ├── organizations.controller.ts
    │   ├── organizations.service.ts
    │   ├── organizations.repository.ts
    │   ├── organizations.validator.ts
    │   └── organizations.types.ts
    │
    ├── plans/
    │   ├── plans.controller.ts
    │   ├── plans.service.ts
    │   ├── plans.repository.ts
    │   ├── plans.validator.ts
    │   └── plans.types.ts
    │
    └── subscriptions/
        ├── subscriptions.controller.ts
        ├── subscriptions.service.ts
        ├── subscriptions.repository.ts
        ├── subscriptions.validator.ts
        └── subscriptions.types.ts

prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

## 4. Shared Backend Foundation

### 4.1 Environment Variables

```txt
OPS_DATABASE_URL
MAIN_DATABASE_URL
MAIN_DB_POOL_MAX
MAIN_DB_STATEMENT_TIMEOUT_MS
REDIS_URL
OPS_JWT_ACCESS_SECRET
OPS_JWT_REFRESH_SECRET
OPS_ACCESS_TOKEN_TTL_MINUTES
OPS_REFRESH_TOKEN_TTL_DAYS
OPS_COOKIE_DOMAIN
OPS_ALLOWED_ORIGINS
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

### 4.2 Standard Response Envelope

Success:

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "requestId": "req_..."
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": []
  },
  "requestId": "req_..."
}
```

### 4.3 Authentication

Use httpOnly cookies for browser flows:

- access token: short-lived.
- refresh token: longer-lived and hashed in DB.

Bearer token support can be added for scripts, but cookies should drive the dashboard.

### 4.4 Runtime

The ops app should run as a normal Node server/container for production:

```bash
next build
next start
```

Avoid Edge runtime for backend route handlers that use Prisma, `pg.Pool`, cookies, crypto, or background jobs.

Every backend route handler that touches DB should be Node runtime:

```ts
export const runtime = "nodejs";
```

## 5. Phase 1 Implementation

### 5.1 Phase 1 Database

Create `quizbuzz_ops` Prisma schema with:

- `PlatformAdmin`
- `PlatformAdminRefreshToken`
- `OrganizationNote`
- `OrganizationSuspension`
- `PlatformAuditLog`

Seed:

- One `SUPER_ADMIN` created through CLI seed, not public registration.

### 5.2 Health

#### `GET /api/v1/ops/health`

Returns:

```json
{
  "status": "ok",
  "opsDb": "ok",
  "mainDb": "ok"
}
```

Used to verify both database connections.

### 5.3 Auth APIs

#### `POST /api/v1/ops/auth/login`

Public.

Body:

```json
{
  "email": "admin@ysmquizbuzz.com",
  "password": "..."
}
```

Behavior:

- Rate limit by IP and email.
- Verify active platform admin.
- Compare password hash.
- If 2FA enabled, return challenge.
- Otherwise set access/refresh cookies.
- Write `admin.logged_in` audit entry.

#### `POST /api/v1/ops/auth/verify-2fa`

Public.

Body:

```json
{
  "challengeToken": "...",
  "totpCode": "123456"
}
```

#### `POST /api/v1/ops/auth/refresh`

Public with refresh cookie.

Behavior:

- Verify refresh token hash.
- Rotate or issue new access token.
- Reject revoked/expired tokens.

#### `POST /api/v1/ops/auth/logout`

Authenticated.

Behavior:

- Revoke current refresh token.
- Clear cookies.

#### `GET /api/v1/ops/auth/me`

Authenticated.

Returns:

```json
{
  "id": "admin_...",
  "email": "admin@ysmquizbuzz.com",
  "name": "Austin",
  "role": "SUPER_ADMIN",
  "twoFaEnabled": true
}
```

#### `POST /api/v1/ops/auth/setup-2fa`

Authenticated.

Returns TOTP provisioning payload. Confirmation can be added as a follow-up endpoint if needed.

### 5.4 Overview APIs

#### `GET /api/v1/ops/overview/stats`

Returns KPI row:

```json
{
  "organizations": {
    "total": 100,
    "active": 96,
    "suspended": 3,
    "deleted": 1
  },
  "contests": {
    "total": 250,
    "byStatus": {
      "DRAFT": 10,
      "PUBLISHED": 20,
      "LIVE": 2,
      "COMPLETED": 200
    }
  },
  "participants": {
    "total": 50000
  },
  "revenue": {
    "allTime": 2500000,
    "thisMonth": 180000,
    "currency": "INR"
  },
  "computedAt": "2026-07-18T00:00:00.000Z"
}
```

Notes:

- Revenue from main app `payments.status = SUCCESS`.
- Main app payment amounts are paise; convert to rupees for display.

#### `GET /api/v1/ops/overview/org-growth?weeks=12`

Returns weekly organization creation series.

#### `GET /api/v1/ops/overview/upcoming-contests?days=7`

Returns upcoming contests with org and participant count.

#### `GET /api/v1/ops/overview/recent-orgs?limit=5`

Returns recently created organizations.

### 5.5 Organization APIs

#### `GET /api/v1/ops/organizations`

Query:

```txt
page
limit
search
status=active|suspended|deleted|all
planSlug
sort
```

Response:

```json
{
  "organizations": [
    {
      "id": "org_...",
      "name": "Acme Academy",
      "slug": "acme",
      "ownerEmail": "owner@example.com",
      "memberCount": 3,
      "contestCount": 12,
      "participantCount": 3000,
      "status": "ACTIVE",
      "plan": {
        "slug": "growth",
        "name": "Growth",
        "status": "ACTIVE"
      },
      "createdAt": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Source:

- Main DB orgs and counts.
- Ops DB plan/subscription badges.

#### `GET /api/v1/ops/organizations/:orgId`

Returns:

- Organization profile.
- Onboarding profile.
- Counts.
- Current status.
- Current plan badge.
- Latest suspension metadata.

#### `GET /api/v1/ops/organizations/:orgId/members`

Reads main DB `org_members` joined with `admins`.

#### `GET /api/v1/ops/organizations/:orgId/contests`

Query:

```txt
page
limit
status
search
```

Reads main DB contests with participant/revenue aggregates.

#### `GET /api/v1/ops/organizations/:orgId/participants`

Query:

```txt
page
limit
contestId
search
paymentStatus
participantStatus
```

Reads main DB contacts, participants, and payments.

#### `GET /api/v1/ops/organizations/:orgId/payments`

Query:

```txt
page
limit
status
contestId
```

Returns org-level contest registration payment history and summary.

Main app statuses should be mapped:

```txt
SUCCESS  -> PAID in UI
PENDING  -> PENDING
CREATED  -> PENDING/CREATED
FAILED   -> FAILED
REFUNDED -> REFUNDED
```

#### `GET /api/v1/ops/organizations/:orgId/notes`

Reads ops DB notes.

#### `POST /api/v1/ops/organizations/:orgId/notes`

Body:

```json
{
  "body": "Customer asked about annual billing.",
  "tags": ["billing", "sales"]
}
```

Writes:

- `OrganizationNote`
- `PlatformAuditLog` action `org.note_added`

#### `POST /api/v1/ops/organizations/:orgId/suspend`

Role: `SUPER_ADMIN`

Body:

```json
{
  "reason": "Payment dispute under review"
}
```

Writes:

- Main DB `organizations.isActive = false`
- Ops DB `OrganizationSuspension`
- Ops DB audit action `org.suspended`

#### `POST /api/v1/ops/organizations/:orgId/reactivate`

Role: `SUPER_ADMIN`

Body:

```json
{
  "reason": "Issue resolved"
}
```

Writes:

- Main DB `organizations.isActive = true`
- Closes latest open `OrganizationSuspension`
- Audit action `org.reactivated`

### 5.6 Frontend Integration for Phase 1

Replace mock implementations in:

- `lib/api/auth.ts`
- `lib/api/overview.ts`
- `lib/api/organizations.ts`

Keep React Query hooks mostly intact:

- `lib/hooks/useAuth.ts`
- `lib/hooks/usePlatformStats.ts`
- `lib/hooks/useOrganizations.ts`

Where the existing frontend expects old mock shapes, adapt inside `lib/api/*` rather than changing many view components.

## 6. Phase 2 Implementation

### 6.1 Phase 2 Database

Add:

- `SubscriptionPlan`
- `OrganizationSubscription`
- `SubscriptionOverride`
- `SubscriptionChangeLog`
- `OpsPayment` if subscription checkout is implemented in this phase.

Seed initial plans:

- Starter/Free
- Growth
- Scale
- Enterprise

Backfill all existing organizations to a default plan.

### 6.2 Plan APIs

#### `GET /api/v1/ops/plans`

Query:

```txt
includeInactive=true|false
```

Returns all plans with organization count.

#### `GET /api/v1/ops/plans/:planId`

Returns single plan detail.

#### `POST /api/v1/ops/plans`

Roles: `SUPER_ADMIN`, `BILLING_ADMIN`

Body:

```json
{
  "name": "Growth",
  "slug": "growth",
  "description": "For growing organizations",
  "price": 2999,
  "currency": "INR",
  "billingCycle": "MONTHLY",
  "limits": {
    "maxContestsPerCycle": 15,
    "maxParticipantsPerContest": 500,
    "maxQuestionsPerContest": 30,
    "maxOrgMembers": 5
  },
  "features": {
    "proctoring": false,
    "certBranding": true,
    "prioritySupport": false,
    "analyticsExport": true,
    "customDomain": false
  }
}
```

Writes:

- `SubscriptionPlan`
- Audit `plan.created`

#### `PATCH /api/v1/ops/plans/:planId`

Roles: `SUPER_ADMIN`, `BILLING_ADMIN`

Critical behavior:

1. Update plan in ops DB.
2. Find active subscriptions on plan.
3. Recompute effective limits for each org.
4. Bulk update main DB org cache fields.
5. Audit `plan.updated`.

#### `GET /api/v1/ops/plans/:planId/impact`

Returns:

```json
{
  "organizationCount": 27,
  "organizations": [
    { "id": "org_...", "name": "Acme Academy" }
  ]
}
```

Used before global plan edits.

#### `POST /api/v1/ops/plans/:planId/deactivate`

Soft-deactivates a plan.

Existing subscribers keep the plan. New assignments cannot use it.

### 6.3 Subscription APIs

#### `GET /api/v1/ops/organizations/:orgId/subscription`

Returns:

```json
{
  "subscription": {
    "id": "sub_...",
    "organizationId": "org_...",
    "status": "ACTIVE",
    "currentPeriodStart": "...",
    "currentPeriodEnd": "..."
  },
  "plan": {
    "id": "plan_...",
    "slug": "growth",
    "name": "Growth"
  },
  "effectiveLimits": {
    "maxContestsPerCycle": {
      "value": 15,
      "planValue": 10,
      "overridden": true
    }
  },
  "usage": {
    "contestsThisCycle": 7,
    "peakParticipantsThisCycle": 640,
    "memberCount": 4
  },
  "overrides": [],
  "changeHistory": []
}
```

#### `POST /api/v1/ops/organizations/:orgId/subscription`

Assigns a plan to an org with no subscription.

Body:

```json
{
  "planId": "plan_...",
  "currentPeriodStart": "...",
  "currentPeriodEnd": "..."
}
```

Writes:

- `OrganizationSubscription`
- Main DB plan cache
- Audit `subscription.created`

#### `POST /api/v1/ops/organizations/:orgId/subscription/change-plan`

Body:

```json
{
  "planId": "plan_..."
}
```

Writes:

- Update subscription.
- `SubscriptionChangeLog`.
- Main DB plan cache.
- Audit `subscription.plan_changed`.

#### `GET /api/v1/ops/organizations/:orgId/subscription/usage`

Computes usage from main DB.

#### `POST /api/v1/ops/organizations/:orgId/subscription/overrides`

Body:

```json
{
  "field": "maxContestsPerCycle",
  "value": 20,
  "reason": "Annual coding festival",
  "expiresAt": "2026-08-15T00:00:00.000Z"
}
```

Writes:

- `SubscriptionOverride`
- Main DB plan cache
- Audit `override.added`

#### `DELETE /api/v1/ops/organizations/:orgId/subscription/overrides/:overrideId`

Body:

```json
{
  "reason": "Temporary allowance no longer needed"
}
```

Soft-removes override:

- `removedAt`
- `removedById`
- `removedReason`
- Main DB plan cache
- Audit `override.removed`

### 6.4 Effective Limit Function

Single source of truth in `subscriptions.service.ts`:

```txt
effectiveLimit(field) =
  latest active override for field
  where removedAt is null
  and (expiresAt is null or expiresAt > now)
  else plan[field]
```

Use for:

- Assign subscription.
- Change plan.
- Edit plan.
- Add override.
- Remove override.
- Override expiry job.
- Reconciliation job.

### 6.5 Main App Cache Shape

`planLimitsCache` should be a flattened JSON object:

```json
{
  "maxContestsPerCycle": 15,
  "maxParticipantsPerContest": 500,
  "maxQuestionsPerContest": 30,
  "maxOrgMembers": 5,
  "features": {
    "proctoring": false,
    "certBranding": true,
    "prioritySupport": false,
    "analyticsExport": true,
    "customDomain": false
  },
  "computedAt": "2026-07-18T00:00:00.000Z"
}
```

Main app enforcement should read this cache locally. It should not call the ops dashboard during contest creation or registration.

### 6.6 Customer Billing Portal APIs

These are not platform-admin APIs. They support main app redirect to ops-hosted subscription checkout.

Proposed route prefix:

```txt
/api/v1/billing-portal/*
```

#### `POST /api/v1/billing-portal/session`

Accepts signed handoff token from the main app and creates a short-lived billing session.

#### `GET /api/v1/billing-portal/plans`

Returns active plans for customer checkout.

#### `POST /api/v1/billing-portal/subscription/order`

Creates Razorpay order for selected subscription plan.

#### `POST /api/v1/billing-portal/subscription/verify`

Optional frontend verification step. Webhook should remain source of truth.

#### `POST /api/v1/billing-portal/razorpay/webhook`

Handles ops-owned subscription payment events.

On success:

- Mark `OpsPayment` paid.
- Create/update `OrganizationSubscription`.
- Write main DB plan cache.

### 6.7 Phase 2 Jobs

#### Override Expiry Job

Frequency: hourly.

Flow:

1. Find active overrides with `expiresAt <= now`.
2. Recompute affected org effective limits.
3. Sync main DB cache.
4. Audit `override.expired`.

#### Subscription Reconciliation Job

Frequency: nightly.

Flow:

1. Load all active subscriptions.
2. Recompute canonical main app cache.
3. Compare to main DB row.
4. Fix drift.
5. Audit `system.cache_reconciled`.

## 7. API Prefix Decision

Use:

```txt
/api/v1/ops/*
```

for internal platform-admin APIs.

Use:

```txt
/api/v1/billing-portal/*
```

for customer-facing subscription checkout APIs.

This separates internal operator access from organization/customer billing flows.

## 8. Implementation Order

### Step 1: Backend Foundation

- Add dependencies.
- Add `prisma/`.
- Add `server/config`.
- Add `server/db`.
- Add envelope/errors/auth helpers.
- Add health route.

### Step 2: Phase 1 Auth

- Add platform auth module.
- Add seed script for initial super admin.
- Replace frontend auth mock.

### Step 3: Phase 1 Reads

- Overview stats.
- Organization list.
- Organization detail.
- Members.
- Contests.
- Participants.
- Payments.

### Step 4: Phase 1 Writes

- Notes.
- Suspend.
- Reactivate.
- Audit writer.

### Step 5: Phase 2 Plans

- Plan schema.
- Plan seed.
- Plan CRUD.
- Plan impact.
- Plan deactivate.
- Replace frontend plan mock.

### Step 6: Phase 2 Subscriptions

- Subscription schema.
- Subscription APIs.
- Usage computation.
- Effective limits.
- Main DB cache write-through.
- Override APIs.
- Replace frontend subscription mocks.

### Step 7: Phase 2 Customer Billing Portal

- Handoff/session design.
- Checkout page wiring.
- Razorpay order + webhook for subscription payments.
- Main app redirect integration.

### Step 8: Jobs and Reconciliation

- Override expiry.
- Nightly cache reconciliation.
- Operational logging.

## 9. Main App Coordination Checklist

Before Phase 2 ships:

- Decide/fix `planStaus` vs `planStatus`.
- Main app redirects plan selection/payment to ops billing page.
- Main app enforces `planLimitsCache` in contest creation.
- Main app enforces participant limits in registration.
- Main app rejects registration when organization is suspended.

Later:

- Add Razorpay Route linked-account support for contest registration payment distribution.

## 10. Testing Strategy

Phase 1:

- Unit test validators.
- Unit test service permission/business rules.
- Repository smoke tests with test DB or mocked pool.
- Route handler integration tests for auth and envelope shape.
- Manual frontend smoke: login, overview, org list/detail, suspend/reactivate.

Phase 2:

- Unit test effective-limit function heavily.
- Test plan edit updates many org caches.
- Test override add/remove/expiry.
- Test reconciliation with intentionally drifted main DB rows.
- Test billing webhook idempotency.

## 11. Notes for Current Frontend

The frontend mock API layer returns shapes designed for the current components. During integration, preserve those shapes in `lib/api/*` adapters even if backend responses are cleaner.

Replace modules progressively:

1. `lib/api/auth.ts`
2. `lib/api/overview.ts`
3. `lib/api/organizations.ts`
4. `lib/api/plans.ts`
5. subscription functions inside `lib/api/organizations.ts`

Do not refactor views until backend behavior is working.
