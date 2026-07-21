# QuizBuzz Ops — Billing & Revenue and Audit Log Implementation Plan

Covers the two remaining nav items from the current build: **Billing & Revenue** (tagged
`phase 2` in the sidebar, corresponds to PRD §5.6 + the already-shipped payout milestone) and
**Audit Log** (tagged `phase 3`, corresponds to the read-only slice of PRD Phase 3). Written
2026-07-21 after auditing the real state of both repos — `quizbuzz-ops-next` (this repo) and
`ysmsoftware/Quizbuzz-new` (main app, checked out at `../Quizbuzz-new`).

Sources checked: `docs/ops-dashboard-prd.md`, `docs/ops-dashboard-database-and-data-flows.md`,
`docs/api-payouts.md`, `docs/ops-dashboard-backend-payouts-guide.md`,
`Quizbuzz-new/razorpay-route-payout-spec.md`, and the actual code in both repos (`server/features/*`,
`app/api/v1/ops/**`, `components/views/BillingView.tsx`, `components/views/AuditLogView.tsx`,
`Quizbuzz-new/backend/src/modules/payout/*`, `Quizbuzz-new/backend/src/modules/payment/*`,
`Quizbuzz-new/backend/prisma/schema.prisma`).

Explicitly out of scope for this plan (separate, larger items, not what was asked for): impersonation,
2FA enforcement, pricing calculator/bookings (Phase 4), infra monitoring (Phase 5).

**2026-07-21 update:** decided the onboarding model is human-mediated ("Approach A" — see §2.1).
Main-app-side UX/messaging work this decision requires is tracked in a companion doc in the other
repo: `Quizbuzz-new/payout-manual-onboarding-ux-plan.md`. This doc's §3.2 now includes the ops-side
half of that same decision (the request queue).

---

## 1. Current State Audit

### 1.1 What's real today

- Phase 1 (Overview, Organizations) and Phase 2 (Subscription Plans) are fully wired to real
  backends: `server/features/{overview,organizations,plans,subscriptions,platform-auth}/*`,
  Prisma models in `quizbuzz_ops`, raw-SQL reads against `quizbuzz` via `queryMainDb`, and
  `writeAuditLogEntry()` (`server/audit/audit-writer.ts`) already firing on every Phase 1/2
  mutation (`org.suspended`, `org.reactivated`, `org.note_added`, plan/subscription changes, etc.).
  This means **`platform_audit_logs` already has real rows** — Audit Log's data source exists,
  only the read surface is missing.
- The main app has shipped Razorpay Route payout distribution exactly as documented in
  `razorpay-route-payout-spec.md`: `OrganizationPayoutAccount`, `PaymentRouteTransfer` Prisma
  models, `backend/src/modules/payout/*`, org-facing `/payout-accounts/{setup,account,link,transfers}`
  endpoints, and a `PayoutsTabContent` in `frontend/app/org/settings/page.tsx`. Verified this is
  real, working code, not a stub.
- `api-payouts.md` and `ops-dashboard-backend-payouts-guide.md` already fully spec the ops-side
  payout surface (routes, data flows, DB grants, audit actions). Nothing to redesign there — it's
  ready to implement as written. This plan folds it in as §3.2 rather than re-deriving it.

### 1.2 What's mocked (needs real backend)

- `components/views/BillingView.tsx`, `lib/api/billing.ts`, `lib/hooks/useBilling.ts` — 100% mock,
  backed by `lib/data/db.ts` (localStorage-style fake DB). Computes "Total Revenue" and "MRR"
  client-side from mock `organizations`/`plans` arrays. No `server/features/billing/` module
  exists. No `app/api/v1/ops/billing/**` or `app/api/v1/ops/payouts/**` routes exist yet.
- `components/views/AuditLogView.tsx`, `lib/api/auditLog.ts`, `lib/hooks/useAuditLogs.ts` — same
  mock pattern. No `server/features/audit-log/` module or `app/api/v1/ops/audit-log` route exists.
  The mock `writeAuditLogEntry()` in `lib/api/auditLog.ts` is dead code from before the real
  `server/audit/audit-writer.ts` was built for Phase 1/2 — the two are unrelated and only one is
  real.

### 1.3 Real gap discovered: no refund capability anywhere

Checked `Quizbuzz-new/backend/src/modules/payment/*` directly (`payment.controller.ts`,
`payment.service.ts`, `payment.routes.ts`) — **there is no refund endpoint or refund logic in the
main app at all.** `Payment.status = REFUNDED` exists as a schema enum value but nothing ever sets
it. `BillingView.tsx`'s mock refund button (`refundPayment`, `refundBillingRecord`) has no real
counterpart to call.

This means refund actions cannot be wired to anything real without first building refund handling
in the main app (Razorpay refund API call + `Payment.status` update + route-transfer reversal
consideration, since a refunded payment whose Route transfer already processed needs the org's
share pulled back too). That is main-app backend work, out of this repo, and out of what was asked
for. **Recommendation: ship Billing & Revenue without a working refund action this round** — keep
the button hidden or disabled with "Refunds not yet supported" rather than wiring it to a
no-op, and track main-app refund support as a separate prerequisite item.

---

## 2. Razorpay Linked Account — field-completeness check

You asked whether the linked-account creation is implemented correctly with all fields Razorpay
requires, and whether linking will work smoothly once ops is added. Checked
`Quizbuzz-new/backend/src/modules/payout/{payout.types.ts,payout.validator.ts,payout.service.ts}`
and `providers/razorpay.provider.ts` directly against the Route "Create a Linked Account" docs you
pasted.

**Short answer: correct for the mode you're actually using (`MANUAL`), not correct for `API` mode
if you ever switch to it.**

- `config.payout.onboardingMode` defaults to `MANUAL` (`RAZORPAY_ROUTE_ONBOARDING_MODE` env var,
  default `"MANUAL"` per the spec and confirmed in `payout.service.ts`). In this mode the app never
  calls `POST /v2/accounts` at all — a human creates the Linked Account directly in the Razorpay
  Dashboard (where Razorpay's own UI collects `legal_business_name`, `business_type`, `profile`,
  `legal_info.pan/gst`, registered address, etc.), and only the resulting `acc_...` id gets pasted
  back via `PATCH /payout-accounts/link` → `attachLinkedAccount()`, which just does
  `UPDATE organization_payout_accounts SET status='ACTIVE', razorpayLinkedAccountId=..., activatedAt=now()`.
  Nothing about linking in this mode is broken — the app doesn't need to know PAN/GST/address
  because Razorpay's dashboard collects them directly. **This is what ops will be plugging into
  (§3.2), and it works correctly as designed.**

- If `onboardingMode` is ever flipped to `API`, `payout.service.ts:setupPayoutAccount()` calls
  `razorpayProvider.createLinkedAccount()` with a real gap against the docs you pasted:
  - `business_type: "individual"` is **hardcoded**, not derived from the org's actual business type.
  - `profile.category: "education"` / `profile.subcategory: "coaching"` are **hardcoded** for every
    org, not read from anything org-specific.
  - `profile.addresses.registered` — **entirely absent**. Razorpay's own docs mark this mandatory
    under `profile.addresses`; the current call would either be rejected outright or (worse) create
    malformed accounts, since nothing in `SetupPayoutAccountInput` even has an address field.
  - `legal_info` (`pan`, `gst`) — **entirely absent**, not in `SetupPayoutAccountInput`,
    `setupPayoutAccountSchema`, or the API call. Depending on the KYC requirement tier Razorpay
    applies to the account, this could block activation.
  - `phone: input.contactNumber` — `contactNumber` is **optional** in the input/validator, but
    `phone` is mandatory per Razorpay's docs. An org submitting without a phone would send
    `phone: undefined` to the SDK.
  - `contact_name: input.accountName` reuses the same string as `legal_business_name`, which is
    semantically wrong (one is a person, one is a company) though not something Razorpay's API
    would reject.

  This is a real bug, but it's dormant — it only executes if `RAZORPAY_ROUTE_ONBOARDING_MODE=API`
  is set, which the main app's own spec explicitly recommends against until Partner-level Route API
  access on the Razorpay account is confirmed (`razorpay-route-payout-spec.md` §8, "Open questions").

**Recommendation:** no action needed in this repo — ops only needs to support `MANUAL` mode per the
existing `api-payouts.md` design, and that path is correctly implemented end-to-end. Flag the `API`
mode gap to whoever owns `Quizbuzz-new/backend/src/modules/payout/payout.service.ts` as a
follow-up, but don't let it block this plan; it's not reachable with current config.

### 2.1 Onboarding model decision: three approaches considered

Discussed and decided 2026-07-21. Three ways the Razorpay Linked Account can come into existence:

| | **A — Manual, human-mediated** | **B — API, self-serve** | **C — Razorpay-hosted redirect** |
|---|---|---|---|
| Who enters KYC/bank data | Billing admin, into Razorpay's own Dashboard, after collecting it from the org out-of-band (phone/email) | Org admin, into a form in QuizBuzz's own app, which forwards it to Razorpay's API server-side | Org admin, directly on a Razorpay-hosted page after being redirected out of QuizBuzz |
| Does KYC/bank data ever transit QuizBuzz's servers | No — never | Yes — in request bodies, even if never persisted to a DB | No — never |
| Self-serve / instant | No | Yes | Yes |
| Available today | **Yes** — this is what's built (`onboardingMode: MANUAL`) | Code exists but has real field gaps (§2) and is one call short of complete (no Stakeholder-API integration for bank details) | **Unconfirmed** — requires Razorpay "Technology Partner" approval (a formal, on-request partner-program application, not self-serve registration), same underlying approval gate as Partner-level API access already flagged as an open question in `razorpay-route-payout-spec.md` §8 |
| Regulatory/liability posture | Cleanest — QuizBuzz never processes the data, so DPDP "processing" exposure and RBI PA/PG KYC-conduit concerns are minimized | Real exposure — QuizBuzz's servers become a transit point for PAN/GST/bank data, which is broadly "processing" under DPDP 2023, and platform-level KYC relay sits close to territory RBI intends the licensed PA (Razorpay) to own directly | Same clean posture as A, but self-serve — the best of both, if approval is granted |

**Decision: build Approach A now** (already the shipped `onboardingMode: MANUAL` default; this plan
and the companion main-app doc close the remaining UX/queue gaps around it). **Do not build B.**
**Flag C as a follow-up worth pursuing with Razorpay directly** — if QuizBuzz can get Technology
Partner status approved, C removes the human-mediation bottleneck of A without taking on B's data-
transit risk. That's a business-development conversation with Razorpay's Partnerships team
(`partners@razorpay.com`), not an engineering task, and isn't scoped into this plan.

---

## 3. Billing & Revenue

### 3.1 Contest payment rollups (main app `payments` table)

Read-only, mirrors the existing `overview.repository.ts:getRevenueStats()` pattern (already proven:
`payments` table, `status = 'SUCCESS'`, amounts in paise, `queryMainDb`).

New `server/features/billing/billing.repository.ts`:

```ts
listPlatformPayments(params: { page, limit, status?, search?, orgId?, dateFrom?, dateTo? })
  // JOIN payments -> organizations, contests, contacts
  // same join shape as organizations.repository.ts:getOrganizationPayments, minus the orgId filter
getPlatformRevenueSummary()
  // total (all-time, this month), by status breakdown, top orgs by revenue
  // reuse overview.repository.ts:getRevenueStats query shape, extend with GROUP BY status
```

No new tables. `payments` is already granted `SELECT` to `quizbuzz_ops_reader` (used by Overview
and Organizations today).

### 3.2 Payouts tab — build exactly as specced

`api-payouts.md` and `ops-dashboard-backend-payouts-guide.md` are implementation-ready; no redesign
needed. Build as documented:

```
server/features/payouts/
  payouts.controller.ts
  payouts.service.ts
  payouts.repository.ts   -- raw SQL on organization_payout_accounts + payment_route_transfers
  payouts.validator.ts
  payouts.types.ts

app/api/v1/ops/payouts/accounts/route.ts              GET  platform list
app/api/v1/ops/payouts/transfers/route.ts              GET  platform list
app/api/v1/ops/organizations/[orgId]/payout-account/route.ts              GET
app/api/v1/ops/organizations/[orgId]/payout-account/link/route.ts         PATCH
app/api/v1/ops/organizations/[orgId]/payout-account/status/route.ts       PATCH
app/api/v1/ops/organizations/[orgId]/payout-account/transfers/route.ts    GET
```

Follow the `organizations.controller.ts` / `organizations.service.ts` suspend/reactivate pattern
exactly: `requireRole([SUPER_ADMIN, BILLING_ADMIN])` on both PATCH routes, main-DB write commits
first, then `writeAuditLogEntry()` with actions `org.payout_account_linked` and
`org.payout_account_status_changed` (reuse `AuditTargetType.PAYMENT` — no schema change needed, per
the guide's own note that a dedicated `PAYOUT_ACCOUNT` target type is optional).

Validator for `razorpayLinkedAccountId`: same regex already proven in the main app,
`/^acc_[a-zA-Z0-9]+$/` (copy from `Quizbuzz-new/backend/src/modules/payout/payout.validator.ts`
rather than re-deriving it, so both sides accept exactly the same format).

### 3.2.1 Manual onboarding request queue (Approach A — pending work)

Per §2.1, the Payouts tab isn't just a status list — it's the **work queue** a billing admin
actually uses to run the manual onboarding process end to end. This is the piece that was missing
before, and it's what makes Approach A operationally viable rather than "check the DB by hand."

Additions on top of the base build in §3.2:

- **Queue framing on `GET /api/v1/ops/payouts/accounts`**: default sort is oldest-first within
  `status = PENDING` and `razorpayLinkedAccountId IS NULL` — these are the actionable items. Add a
  `hasContactInfo` computed flag (always true today since `accountName`/`accountEmail` are required
  at submission) so the queue reads as "N organizations waiting on manual KYC collection," not just
  a generic filtered list.
- **"Contacted" workflow, reusing `OrganizationNote` (already built in Phase 1)** — there's no need
  for a new DB column or a new sub-status enum value. A billing admin who calls the org and starts
  collecting KYC adds a note via the existing `POST /api/v1/ops/organizations/:orgId/notes` endpoint
  (tag it `payout` or similar), which:
  - Shows up in the existing Organization Detail → Notes tab, no new UI surface needed there.
  - Gives the Payouts queue a "last contacted" signal — `payouts.repository.ts`'s platform-list
    query can `LEFT JOIN` the most recent `organization_notes` row tagged `payout` per org and
    surface it as `lastContactedAt` / `lastContactNote` in the list response, so a billing admin
    opening the queue can tell at a glance who's already been called versus who's untouched.
  - Costs nothing new in the audit trail — note creation already writes `org.note_added`.
  - This deliberately keeps the *contents* of what was discussed (bank details, PAN, etc.) **out**
    of the note body — the note should record that contact happened and what's outstanding
    ("called 2026-07-22, waiting on GST copy"), never the actual KYC values, to preserve the
    "sensitive data never enters QuizBuzz's systems" property §2.1 is built on. Worth a one-line
    warning in the Notes UI itself when the `payout` tag is selected, so this isn't just a
    convention nobody enforces.
- **Reason surfaced on `VERIFICATION_FAILED`/`DISABLED`**: `PATCH .../payout-account/status` already
  takes a `reason` (§api-payouts.md #5) and logs it to `PlatformAuditLog.metadata`. That's enough
  for ops's own record, but the org itself currently has **no way to see why** their account was
  rejected — the main app's `OrganizationPayoutAccount` row has no column for it (only `status`,
  `razorpayLinkedAccountId`, `activatedAt` are in the ops write-grant, per
  `ops-dashboard-database-and-data-flows.md` §3). See the main-app companion doc for the schema
  change this needs (`statusReason` column) — without it, "why did this fail" stays a phone-call-only
  answer, which is acceptable for now but worth fixing once the main app work below ships.

### 3.3 Ops subscription revenue (`OpsPayment`)

`OpsPayment` (ops DB) exists in the schema but is unpopulated — nothing writes to it yet, because
the customer-facing subscription checkout handoff (PRD §5.5, data flow §14 in
`ops-dashboard-database-and-data-flows.md`) hasn't been built. That's a distinct, larger piece
(billing handoff token, checkout page, Razorpay order creation for subscriptions, webhook) — not
part of this plan and not what was asked for.

**Recommendation for this round:** compute "MRR" for the Billing & Revenue view from real data that
already exists — `OrganizationSubscription` joined to `SubscriptionPlan.price`, summed for
`status = ACTIVE` — instead of the mock's client-side estimate from fake `organizations`/`plans`
arrays. This is a real number today, just not derived from actual payment events yet (no org has
paid for a subscription through ops because checkout doesn't exist). Show `OpsPayment`-derived
figures as `0` / empty state rather than fabricating them, and note in the UI that subscription
billing events will populate once checkout ships. Do not build the checkout flow as part of this
work — flag it as the next logical milestone after this one if/when needed.

### 3.4 Refunds

Per §1.3: leave disabled this round, main app has no refund capability to call. If you want refund
UI to appear "coming soon" rather than removed, that's a one-line frontend change; wiring it live
requires main-app work first.

### 3.5 API surface

```
GET  /api/v1/ops/billing/payments            platform payment list, filters: status/search/orgId/date range
GET  /api/v1/ops/billing/summary              revenue rollup (contest payments + subscription MRR)
GET  /api/v1/ops/payouts/accounts             (§3.2)
GET  /api/v1/ops/payouts/transfers            (§3.2)
GET/PATCH  .../organizations/:orgId/payout-account[...]   (§3.2)
```

### 3.6 Frontend wiring

- `lib/api/billing.ts`: replace mock functions with real `fetch` calls against the routes above,
  same shape as `lib/api/organizations.ts` (already real).
- `lib/hooks/useBilling.ts`: keep the hook's external shape (`payments`, `isPaymentsLoading`,
  `refundPayment`) so `BillingView.tsx` needs minimal changes — swap `refundPayment` for a disabled
  no-op per §3.4.
- New `lib/api/payouts.ts`, `lib/hooks/usePayouts.ts` per the guide's §9.
- `BillingView.tsx`: add "Payouts" tab (subtitle already promises this per the guide).
- `OrganizationDetailView.tsx` / `components/views/organization-detail/tabs/`: add a "Payout
  Account" tab alongside the existing Members/Contests/Payments/Subscription tabs, same component
  pattern as `OrganizationSubscriptionTab.tsx`.

---

## 4. Audit Log

This is the lighter of the two — the data already exists and is already being written correctly by
every Phase 1/2 mutation. Only a read API and frontend wiring are missing.

### 4.1 New backend module

```
server/features/audit-log/
  audit-log.controller.ts
  audit-log.service.ts
  audit-log.repository.ts   -- prisma.platformAuditLog.findMany, ops DB only, no main-DB join needed
  audit-log.types.ts

app/api/v1/ops/audit-log/route.ts   GET
```

Repository: straightforward Prisma query against `platform_audit_logs`, filters on
`action`/`targetType`/`targetId`/`actorId`/date range, paginated, `orderBy: { createdAt: 'desc' }`.
Join `PlatformAdmin` for actor display name (already denormalized as `actorLabel` at write time, so
no join is strictly required — `actorLabel` alone is enough for the list view).

Role: read-only, allow all three roles (`SUPER_ADMIN`, `SUPPORT`, `BILLING_ADMIN`) — audit log
visibility is not itself a sensitive write, and SUPPORT needs to see suspension/note history for
their own workflow.

### 4.2 API surface

```
GET /api/v1/ops/audit-log?page=1&limit=20&action=org.suspended&targetType=ORGANIZATION&targetId=...&from=...&to=...
```

Response shape matches the mock's `AuditLogEntry` closely enough that `AuditLogView.tsx`'s
rendering logic (`formatActionName`, `getLogDetailsString`, the action-name switch statement)
carries over almost unchanged — just point it at real `action` strings, which already match what's
being written (`org.suspended`, `org.reactivated`, `org.note_added`, plan/subscription actions, and
the two new `org.payout_account_*` actions from §3.2). Add the payout actions to
`getLogDetailsString`'s switch statement.

### 4.3 Frontend wiring

- `lib/api/auditLog.ts`: replace mock with real fetch; **delete** the dead
  `writeAuditLogEntry()` export from this file (it was never the real one —
  `server/audit/audit-writer.ts` is) so nothing accidentally imports the mock writer again.
- `lib/hooks/useAuditLogs.ts`: same external shape, real query function.
- `AuditLogView.tsx`: mostly unchanged; verify `targetType` values from Prisma's `AuditTargetType`
  enum (`ORGANIZATION`, `PLAN`, `SUBSCRIPTION`, `OVERRIDE`, `PAYMENT`, ...) line up with what the
  component's filter dropdown expects (currently lowercase strings in the mock type
  `'organization' | 'plan' | 'payment' | ...` — needs a small mapping or a switch to the real enum
  casing).

---

## 5. Main App / DB Coordination Checklist

Already fully specified in `ops-dashboard-backend-payouts-guide.md` §4 — restating here so it's not
missed as a blocker before §3.2 ships:

- [ ] Grant `quizbuzz_ops_reader` `SELECT` on `organization_payout_accounts`, `payment_route_transfers`.
- [ ] Grant `quizbuzz_ops_reader` `UPDATE` on `organization_payout_accounts` columns `status`,
      `"razorpayLinkedAccountId"`, `"activatedAt"` only.
- [ ] No grant changes needed for `payments` — already granted (used by Overview/Organizations today).
- [ ] No main app schema changes needed for either Billing or Audit Log — everything read here
      already exists.

---

## 6. Implementation Order

1. **Audit Log first** — smallest, lowest-risk, no main-DB coordination needed (ops DB only), and
   validates the read-API pattern cleanly before touching payout/billing writes.
2. DB role grants for payout tables (§5) — coordinate with infra, not a code change in this repo.
3. `server/features/payouts/` — repository → service → controller → routes, in the org-scoped
   routes first (`GET .../payout-account`, `GET .../transfers`), then the two writes
   (`link`, `status`), then the platform-wide list routes, then the queue framing and note-join
   from §3.2.1.
4. `server/features/billing/` — payments rollup + revenue summary (read-only, no coordination
   needed).
5. Frontend: `lib/api/{billing,payouts,auditLog}.ts` and hooks, then wire `BillingView.tsx`
   (Payouts tab), `OrganizationDetailView.tsx` (Payout Account tab), `AuditLogView.tsx`.
6. Disable/hide the refund action per §3.4 rather than leaving it wired to nothing.

## 7. Testing Strategy

- Payouts: reuse the guide's §11 test list (role-based 403 on writes, 404 on attach-without-setup,
  `DISABLED` doesn't touch `organizations.isActive`).
- Billing: revenue summary matches `overview.repository.ts:getRevenueStats()` for the same date
  range (cross-check against an existing proven query rather than trusting a new one blind).
- Audit Log: create a suspend/reactivate/note/plan-change/payout-link action, confirm it's readable
  through the new endpoint with correct filters, confirm pagination ordering is `createdAt desc`.

## 8. Open Questions

- Whether to keep computing MRR from `OrganizationSubscription` × plan price (real but not
  payment-event-driven) or wait for the checkout flow to exist before showing any MRR number at
  all. Recommendation in §3.3 is to show it now with a caveat, but flag if you'd rather show `0`
  until real payment events exist.
- Refund action: confirm you want it hidden/disabled this round rather than scoped in, given it
  needs main-app work first (§1.3, §3.4).
- Whether to invest in getting Approach C (§2.1, Razorpay-hosted redirect onboarding) evaluated with
  Razorpay's Partnerships team in parallel with this build. It doesn't block anything here — Approach
  A ships regardless — but if Razorpay approves Technology Partner status, the request-queue/note
  workflow in §3.2.1 becomes optional rather than the primary path, which is worth knowing sooner
  rather than after the queue UI is fully built out.
- Whether `statusReason` (§3.2.1) is worth a main-app schema change now or can wait — currently the
  only way an org learns why their payout account was rejected is a phone call from a billing admin,
  which is consistent with Approach A's human-mediated design but may feel opaque to the org in the
  meantime.
