# QuizBuzz Ops Backend Implementation Guide: Organization Payout Management

Prerequisite milestone before Phase 3 (`Billing Depth, Audit Read UI, and Impersonation`). The main app (`ysmsoftware/Quizbuzz-new`) has already shipped Razorpay Route payout distribution — `OrganizationPayoutAccount`, `PaymentRouteTransfer`, org-facing `/payout-accounts/*` endpoints, and a contest-publish gate that blocks paid contests until an org's payout account is `ACTIVE`. This guide covers the ops-side half: giving platform operators visibility into payout status platform-wide and the ability to complete manual Linked Account onboarding on an org's behalf.

This is intentionally scoped smaller than a full phase. It reuses the Phase 1/2 architecture (`app/api/v1/ops/**/route.ts` → controller → service → repository, envelope responses, audit writer) with no new architectural decisions.

## 1. Why This Comes Before Phase 3

Phase 3 adds refund actions, transaction rollups, and billing failure/dunning views. Those are meaningless for contest-fee revenue if operators have no way to see which organizations are actually receiving their share, or to unstick an org sitting in `PENDING` because nobody has created its Razorpay Linked Account yet. This milestone gives Phase 3's billing views something real to roll up.

## 2. Scope

In scope:

- Read: payout account status for one org and platform-wide.
- Read: route transfer history for one org and platform-wide (`PaymentRouteTransfer`).
- Write: attach a `razorpayLinkedAccountId` on an org's behalf (manual onboarding completion).
- Write: mark a payout account `VERIFICATION_FAILED` / `DISABLED` / back to `ACTIVE`, with reason.
- Audit entries for both writes.
- Billing & Revenue Desk "Payouts" tab (the view's subtitle already says "manage payouts" — this fills that in).
- New "Payout Account" section on the existing Organization Detail view.

Out of scope (explicitly deferred, do not build here):

- Ops creating Razorpay Linked Accounts via API. Main app's `OrganizationPayoutAccount.onboardingMode` stays `MANUAL` for now — see the main app's own payout spec for why (`accounts.create()` needs Partner-level Razorpay approval that hasn't been confirmed).
- Manually re-triggering a `FAILED` or stuck `PENDING` transfer. Surfacing the failure is this milestone's job; retry tooling is a Phase 3 billing-depth item.
- Refunds/reversals of route transfers. Phase 3.
- Any change to the commission percentage or transfer logic itself — that lives entirely in the main app's `payout.service.ts`.

## 3. Architecture

No new architectural decisions. Same layering as Phase 1/2:

```txt
app/api/v1/ops/payouts/**/route.ts                    routing only
app/api/v1/ops/organizations/[orgId]/payout-account/** routing only
server/features/payouts/
  payouts.controller.ts
  payouts.service.ts
  payouts.repository.ts
  payouts.validator.ts
  payouts.types.ts
```

### Folder Additions

```txt
app/
├── api/
│   └── v1/
│       └── ops/
│           ├── payouts/
│           │   ├── accounts/route.ts              GET  — platform list, api-payouts.md #1
│           │   └── transfers/route.ts              GET  — platform list, api-payouts.md #6
│           └── organizations/
│               └── [orgId]/
│                   └── payout-account/
│                       ├── route.ts                 GET  — api-payouts.md #2
│                       ├── link/route.ts            PATCH — api-payouts.md #4
│                       ├── status/route.ts          PATCH — api-payouts.md #5
│                       └── transfers/route.ts        GET  — api-payouts.md #3
│
server/
└── features/
    └── payouts/
        ├── payouts.controller.ts
        ├── payouts.service.ts
        ├── payouts.repository.ts
        ├── payouts.validator.ts
        └── payouts.types.ts
```

### Repository Responsibility

Same rule as every other Phase 1/2 repository: parameterized raw SQL against `MAIN_DATABASE_URL` for `organization_payout_accounts` and `payment_route_transfers` (reads, plus the two narrow writes below). No Prisma model for these tables in the ops schema — they are not ops-owned data, same treatment as `Payment` today.

## 4. Main App Coordination Checklist

Before this ships:

- Grant `quizbuzz_ops_reader` `SELECT` on `organization_payout_accounts` and `payment_route_transfers`.
- Grant `quizbuzz_ops_reader` `UPDATE` on `organization_payout_accounts` columns `status`, `"razorpayLinkedAccountId"`, `"activatedAt"` — same narrow-write pattern already used for `organizations.isActive` / `planSlug` / `planLimitsCache` in Phase 1/2. See open decision below before committing to this.
- Confirm the main app's contest-publish gate (`ContestService.createContest` / `updateContest` / `publishContest`) reads `OrganizationPayoutAccount.status` live — it does, as of the payout milestone — so an ops-side status flip to `ACTIVE`/`DISABLED` takes effect immediately with no main-app deploy needed.
- No main app schema change needed. `OrganizationPayoutAccount` and `PaymentRouteTransfer` already exist.

### Open Decision: DB Role Write vs. Internal HTTP Call

Two ways for ops to perform the "attach linked account" and "update status" writes:

1. **Direct restricted-role UPDATE** (recommended, matches existing pattern): ops's repository issues `UPDATE organization_payout_accounts SET ...` through its existing `quizbuzz_ops_reader`-style role, now with a slightly wider grant. Consistent with how `isActive`/plan-cache fields already work. No new cross-app coupling.
2. **Internal service-to-service endpoint**: main app exposes a second, non-org-authenticated variant of `PATCH /payout-accounts/:orgId/link` gated by a shared service secret, and ops calls it over HTTP instead of touching the table directly. Keeps all payout business logic (e.g. re-validating the `acc_...` format, setting `activatedAt`) in one place in the main app instead of duplicating it in ops's repository.

Recommendation: option 1, for consistency with everything else in Phase 1/2 and because the write is genuinely narrow (three columns, no derived logic beyond setting a status enum and a timestamp). Revisit if the "narrow write" list keeps growing across phases — at some point a shared internal API surface pays for itself.

## 5. Data Flow: Organization Payout Detail

```txt
client (Organization Detail → Payout Account tab)
→ GET /api/v1/ops/organizations/:orgId/payout-account
→ payouts.controller
→ payouts.service
→ payouts.repository reads organization_payout_accounts + aggregates payment_route_transfers on mainDbPool
→ response
```

## 6. Data Flow: Attach Linked Account

```txt
PATCH /api/v1/ops/organizations/:orgId/payout-account/link
→ validate razorpayLinkedAccountId format (acc_...)
→ verify operator role SUPER_ADMIN or BILLING_ADMIN
→ read main DB organization_payout_accounts row, 404 if none
→ update main DB: status = ACTIVE, razorpayLinkedAccountId, activatedAt = now()
→ insert ops DB PlatformAuditLog action org.payout_account_linked
→ response
```

Same no-cross-DB-transaction caveat as suspend/reactivate: the main DB write commits first; if the audit insert fails, the account is still correctly linked and the audit gap can be reconciled later.

## 7. Data Flow: Platform Payouts List (Billing Desk)

```txt
GET /api/v1/ops/payouts/accounts?status=PENDING
→ payouts.repository reads organization_payout_accounts joined to organizations for name/slug
→ per-account pendingTransferCount via subquery on payment_route_transfers
→ response
```

This is the query that turns "an org quietly stuck in PENDING" into something support sees without being told by the org.

## 8. Audit Actions

Add to `AuditTargetType` usage (enum already has `PAYMENT`; reuse it — a dedicated `PAYOUT_ACCOUNT` target type is optional and can be added if audit filtering by payout specifically becomes a real need):

```txt
org.payout_account_linked
org.payout_account_status_changed
```

Both follow the existing `PlatformAuditLog` shape: `actorId`, `actorLabel`, `action`, `targetType`, `targetId` (organizationId), `targetLabel` (org name), `metadata` (before/after status, reason).

## 9. Frontend Integration

- `components/views/BillingView.tsx`: add a "Payouts" tab. The subtitle copy already promises this ("Monitor platform transactions, MRR value, and manage payouts") — no other view currently backs it.
- Organization Detail: add a "Payout Account" section using the same tab pattern as Members/Contests/Payments/Subscription.
- New `lib/api/payouts.ts` — no mock currently exists for this domain (unlike auth/overview/organizations/plans), so this can be written directly against the real response shapes in `api-payouts.md` rather than adapting an existing mock shape.
- New `lib/hooks/usePayouts.ts` (platform list) and an addition to the existing organization-detail hook for the per-org payout account + transfers.

## 10. Implementation Order

1. Main DB role grants (SELECT + narrow UPDATE) — coordinate with main app team/infra, not a code change in this repo.
2. `server/features/payouts/` module: repository → service → controller.
3. Org-scoped routes: `GET .../payout-account`, `GET .../payout-account/transfers`, `PATCH .../payout-account/link`, `PATCH .../payout-account/status`.
4. Platform-wide routes: `GET /payouts/accounts`, `GET /payouts/transfers`.
5. Audit writer calls on both write endpoints.
6. Frontend: `lib/api/payouts.ts`, `usePayouts` hook, BillingView "Payouts" tab, Organization Detail "Payout Account" section.

## 11. Testing Strategy

- Repository smoke tests against a seeded main DB with orgs in each of the four payout statuses.
- Service test: attaching a linked account when no `OrganizationPayoutAccount` row exists returns 404, does not create one (creation is the org's own `/payout-accounts/setup` call in the main app, not ops's job).
- Service test: status update to `DISABLED` does not touch the organization's own `isActive` — these are independent flags. Suspending an org and disabling its payouts are two different actions with two different audit actions.
- Route handler test: both write endpoints reject `SUPPORT` role with 403.
- Manual smoke: link an account, confirm the main app's Settings → Payouts tab (built in the payout milestone) reflects `ACTIVE` immediately, confirm a subsequent paid-contest-publish attempt in the main app is no longer blocked.
