# QuizBuzz Ops Dashboard PRD

## 1. Purpose

QuizBuzz Ops is the internal operational dashboard for the already-running QuizBuzz main application. It is used by YSM software, support, sales, billing, and operations teams to observe platform activity, support organizations, manage subscriptions, and perform controlled administrative actions across all organizations.

This is not a high-traffic customer-facing application. The expected active user base is small, roughly 10-15 internal operators. Because of that, the product should remain a single full-stack Next.js application: the existing frontend dashboard plus backend API route handlers and server modules in the same codebase.

The dashboard must not replace the main QuizBuzz app. It should act as a platform control plane:

- Read platform-wide data from the main app database.
- Own platform-admin identity and ops-only records in an ops database.
- Perform narrow, auditable writes back to the main app database where needed.
- Host subscription checkout/billing flows that main app users can be redirected to.
- Preserve a clean module boundary so this can become a separate backend later if scale or team ownership requires it.

## 2. Existing Context

The main app repo is `ysmsoftware/Quizbuzz-new`.

The main app has:

- `backend/`: Express, Prisma, PostgreSQL, Redis, BullMQ, Razorpay.
- `frontend/`: Next.js customer and organization-facing application.
- `Organization` as the tenant root.
- `organizationId` on all important domain tables.
- Org admin auth through `Admin` and `OrgMember`.
- Participant/contact auth through OTP-style flows.
- Contest registration payments collected via Razorpay.
- Onboarding fields and `OrganizationProfile` already added.
- Plan cache fields already added on `Organization`, currently named `planSlug`, `planStaus`, and `planLimitsCache`.

The ops dashboard repo already has the frontend views, hooks, and mock `lib/api/*` modules. Backend implementation should progressively replace those mocks with calls to real `/api/v1/ops/*` endpoints while leaving most React components and hooks intact.

## 3. Product Principles

1. **Internal-first, low operational friction**  
   Keep the app deployable as one Next.js service unless there is a real need to split it.

2. **Layered backend, not route-handler sprawl**  
   Next.js `route.ts` files are only the routing layer. Business logic lives in controllers, services, repositories, validators, and shared server utilities.

3. **Main app DB is not owned by ops**  
   Ops can read main app tables and perform a tiny set of explicit updates. It must not run migrations against the main app database.

4. **Ops DB owns ops state**  
   Platform admins, notes, audit logs, subscriptions, plans, pricing configs, bookings, and subscription payments live in `quizbuzz_ops`.

5. **Every sensitive write is audited**  
   Suspension, reactivation, plan changes, overrides, refunds, impersonation, and billing actions write audit entries.

6. **Subscription enforcement is cache-driven in the main app**  
   Ops owns subscription truth. The main app reads cached effective entitlement fields from `Organization`.

7. **Customer money paths stay boring and explicit**  
   Contest registration payments remain in the main app. Subscription payments are ops-owned. Razorpay Route for contest-fee distribution comes later.

## 4. User Roles

### SUPER_ADMIN

Full access. Can manage platform admins, organizations, plans, subscriptions, overrides, suspensions, refunds, pricing, bookings, feature flags, and impersonation.

### SUPPORT

Read-heavy support role. Can inspect organizations, contests, participants, payments, and notes. Can add notes and use approved support tooling. Cannot edit pricing, plans, refunds, or destructive org state unless explicitly allowed later.

### BILLING_ADMIN

Billing and commercial operations role. Can manage plans, subscriptions, overrides, invoices/payments/refunds, pricing configuration, and billing views. Cannot impersonate or perform high-risk support actions unless explicitly granted.

## 5. Core Product Areas

### 5.1 Access and Auth

New platform-admin auth, separate from main app `Admin`.

Capabilities:

- Login with email/password.
- Refresh/logout.
- `GET /me`.
- Role-based authorization.
- 2FA support should be designed from day one and can be required before production usage.
- Platform-admin tokens must not be accepted by the main app, and main app org-admin tokens must not be accepted by ops APIs.

### 5.2 Platform Overview

Home screen for high-level platform health and business activity.

Widgets:

- Total organizations, active/suspended/deleted.
- New organizations over time.
- Contest counts by status.
- Total participants.
- Revenue from main app contest payments.
- Live contests.
- Upcoming contests.
- Recent organizations.
- Later: infra mode and cost summary.

### 5.3 Organizations Management

Primary support workflow.

List view:

- Organization name, slug, owner, member count, contest count, participant count, current plan, status, created date.
- Search/filter/sort.

Detail view:

- Org profile and onboarding profile.
- Members.
- Contests.
- Participants/contacts.
- Payment history.
- Subscription and usage.
- Notes/tags.
- Suspension/reactivation.
- Later: impersonation.

### 5.4 Contest Analytics

Platform-wide contest analytics, mostly read-only.

Capabilities:

- Average contests per org.
- Average/median/largest participants per contest.
- Top organizations by contest count, participants, and revenue.
- Scheduled contest calendar.
- Live contest view.

### 5.5 Subscription and Plan Management

Ops-owned subscription system.

Capabilities:

- Define subscription plans and limits.
- Assign plans to organizations.
- Change plans.
- Add/remove per-org overrides.
- Compute usage vs limits.
- Sync effective plan cache to the main app `Organization` row.
- Host customer-facing subscription checkout pages that main app users are redirected to.

The main app should not own subscription billing data. It should only show current plan and enforce cached limits.

### 5.6 Billing and Revenue

Two distinct payment domains:

1. Main app contest registration payments:
   - Stored in the main app `Payment` table.
   - Status `SUCCESS` means paid.
   - Amount is stored in paise.
   - Later uses Razorpay Route to transfer org shares.

2. Ops subscription and booking payments:
   - Stored in `quizbuzz_ops`.
   - Represent YSM revenue.
   - Used for subscription billing, plan renewals, and pay-per-contest bookings.

### 5.7 Pricing Calculator and Bookings

Admin-assisted first, self-serve later.

Capabilities:

- Calculate a pay-per-contest quote based on participants, duration, questions, infra cost, and add-ons.
- Store quote snapshots.
- Move bookings through `QUOTED -> PAID -> PROVISIONED -> COMPLETED/CANCELLED`.
- Later use paid bookings to pre-warm infra and schedule ops work.

### 5.8 Infra and Cost Monitoring

Later-phase operational view.

Capabilities:

- Current idle/live infra mode.
- ASG instance count.
- ElastiCache status.
- Estimated AWS spend.
- Upcoming go-live windows.

### 5.9 Audit Log

Immutable record of ops actions.

Required for:

- Suspension/reactivation.
- Plan/subscription changes.
- Overrides.
- Refunds.
- Impersonation.
- Pricing changes.
- Feature flag changes.

### 5.10 Feature Flags and Global Settings

Later-phase global controls.

Examples:

- Maintenance mode.
- Disable new registrations.
- Disable paid contest publishing.
- Enable/disable experimental ops features.

## 6. Phasing

### Phase 1: Platform Visibility and Organization Control

Goal: replace mock data for the highest-value support and monitoring workflows with real data.

Scope:

- Platform-admin auth foundation.
- Platform overview.
- Organization list/detail.
- Org members.
- Org contests.
- Org participants/contacts.
- Org payment history.
- Org notes.
- Suspend/reactivate.
- Audit writer for Phase 1 mutations.

Main app dependency:

- Ensure suspended orgs cannot create contests.
- Ensure suspended orgs cannot receive new registrations for existing published contests.

### Phase 2: Subscription and Plan Management

Goal: make ops the source of truth for subscriptions and organization entitlements.

Scope:

- Subscription plan CRUD.
- Plan impact endpoint.
- Organization subscription view.
- Assign/change plan.
- Usage vs limits.
- Per-org overrides.
- Effective limit computation.
- Main app plan cache write-through.
- Subscription checkout handoff design and initial billing portal endpoints.
- Backfill existing organizations to a default plan.
- Override expiry and reconciliation jobs.

Main app dependency:

- Fix or intentionally support `planStaus` typo.
- Enforce `planLimitsCache` in contest creation and participant registration.
- Redirect selected plan/payment flow to the ops-hosted billing page.

### Phase 3: Billing Depth, Audit Read UI, and Impersonation

Scope:

- Platform audit log read API.
- Refund actions for contest payments and ops payments.
- Transaction rollups.
- Impersonation token issuance.
- Stronger 2FA enforcement.
- Billing failure/dunning views.

### Phase 4: Pricing Calculator and Booking Flow

Scope:

- Pricing config.
- Calculator.
- Booking lifecycle.
- Ops-side booking payments.
- Admin-assisted provisioning workflow.

### Phase 5: Infra, Cost Monitoring, and Feature Flags

Scope:

- AWS infra status.
- Cost estimates.
- Feature flag CRUD/toggle APIs.
- Maintenance/global controls.
- Observability panels.

## 7. Non-Goals for Phase 1 and Phase 2

- Rewriting the main app backend.
- Moving main app payments into ops.
- Implementing Razorpay Route immediately.
- Implementing the full pay-per-contest booking lifecycle.
- Building a separate Express service.
- Making a public marketing billing website.
- Hard-coding plan enforcement in the frontend only.

## 8. Success Criteria

Phase 1 is successful when internal users can log in and inspect real organizations, contests, participants, contacts, and payment history across the platform, and can suspend/reactivate an organization with an audit trail.

Phase 2 is successful when every organization has a subscription plan, ops can change plans and overrides, effective limits are synced into the main app, and the main app can enforce those limits without calling the ops dashboard at runtime.
