# Payout Visibility — Implementation Plan

Scope: give organizations and the ops team visibility into the Razorpay Route "reserve → org account" payout flow (accounts, transfers, fee breakdown, queue/failure state). Covers `Quizbuzz-new` (main app, org-facing) and `quizbuzz-ops-next` (internal ops dashboard).

## 1. Current state — this is more built than it looks

Before proposing new work, here's what already exists. This changes the shape of the task from "build a payout dashboard" to "close specific visibility gaps in an existing system."

**Data model** (`Quizbuzz-new/backend/prisma/schema.prisma`)
- `OrganizationPayoutAccount` — one row per org, tracks Razorpay linked-account id, status (`PENDING/ACTIVE/VERIFICATION_FAILED/DISABLED`), onboarding mode.
- `PaymentRouteTransfer` — one row per payment, already stores the full breakdown: `grossAmount`, `platformFeeAmount` (commission), `gatewayFeeAmount` (Razorpay TDR), `gstAmount` (GST on the gateway fee), `transferAmount` (net to org), `status` (`PENDING/PROCESSED/FAILED/REVERSED`), `razorpayTransferId`, `failureReason`, `processedAt`.

**Backend flow** (`backend/src/modules/payout/*`, `backend/src/workers/route-transfer.worker.ts`)
- Fee math already lives in `payout.service.ts` (`computeFeeBreakdown`) — config-driven percentages, no magic numbers.
- Transfers are already queued: `route-transfer-queue` (BullMQ) → `RouteTransferWorker`, with retry/backoff and a scheduling delay before funds leave the reserve account. This is the "reserve routes" flow you described — it's live.
- Org-facing API already exists: `GET /payout-accounts/account`, `GET /payout-accounts/transfers`, `POST /payout-accounts/setup`, `PATCH /payout-accounts/link` — all scoped correctly (`organizationId` comes from `req.user`, never from the request), so no cross-org leakage risk.

**Ops dashboard** (`quizbuzz-ops-next`) — this is the bigger surprise: a payouts feature already exists at `/dashboard/payouts`, reading the main app's Postgres directly (`server/db/main-db-pool.ts`, via `queryMainDb`) rather than over HTTP:
- **Payout Account Onboarding Queue** tab — every org's linked-account status, search, status filter, pending-transfer count.
- **Route Transfers** tab — a cross-org ledger of every `PaymentRouteTransfer` row, paginated, filterable by status.
- **Org detail → Payout tab** (`OrgPayoutAccountTab.tsx`) — per-org account status + a transfer summary (processed/failed/pending counts, total transferred) + the org's own transfer ledger.
- Role gating is already in place: `SUPER_ADMIN`/`BILLING_ADMIN` can mutate (attach linked account, change status); everyone else is read-only (the UI literally says so).

**What's actually missing:**

1. **Org-side payout history UI doesn't exist.** `frontend/app/org/settings/page.tsx` has a "Payouts" tab, but it only renders account setup/status — the `transfersQuery` in `use-payout.ts` is fetched and never rendered. An org admin today can see "payouts are active" but cannot see a single transaction, amount, or breakdown. This is the core gap in your description.
2. **Fee breakdown isn't surfaced anywhere**, despite being computed and stored. Neither `payouts.types.ts` (ops) nor the org-facing transfer list exposes `gatewayFeeAmount`/`gstAmount` — only gross, commission ("platform fee"), and net. So even the ops ledger can't currently show "why" a transfer is less than gross beyond commission.
3. **No platform-wide summary/KPIs** on the ops Route Transfers tab (the org-detail tab has summary cards; the cross-org ledger doesn't) — no total volume, total commission earned, total gateway fee + GST pass-through at a glance.
4. **No queue-level observability.** The DB `status` field tells you a transfer's final business outcome, but nothing surfaces BullMQ's queue state (waiting/active/delayed/failed job counts, retry attempts in flight) for `route-transfer-queue`. You explicitly asked for "queue state or whatever fail transfer" visibility — that's a distinct signal from the row status and isn't exposed today.
5. **Org-facing transfer list has no pagination/filtering.** `listTransfersByOrgId` takes a flat `limit = 50` with no status filter or paging — fine today, won't hold up once an org has thousands of contests.
6. **Missing DB indexes for scale.** `payment_route_transfers` only has `@@index([organizationId])` and `@@index([status])` — no index covering `createdAt`, which every list view sorts by. Fine at current volume; will show up as slow queries once the table grows.

## 2. Data model changes

`Quizbuzz-new/backend/prisma/schema.prisma`, `PaymentRouteTransfer`:
```prisma
@@index([organizationId, createdAt])
@@index([status, createdAt])
```
Replaces the two existing single-column indexes (keep `status` for the ops-wide status filter, but composite with `createdAt` since every query filters-then-sorts). Migration is additive and safe to run online.

No other schema changes needed — the fee breakdown columns already exist; this is purely a visibility/API problem, not a data problem.

## 3. Backend — Quizbuzz-new (org-facing)

Extend the payout module following the existing module structure (routes/controller/service/repository/types/validator, per your engineering guidelines):

- `payout.repository.ts` → `listTransfersByOrgId` gains `{ page, limit, status? }` params, returns `{ rows, total }` (mirror the pattern already proven in ops-next's `payouts.repository.ts` — same shape, same idempotent style).
- `payout.validator.ts` → add a query schema (Zod) for `page`/`limit`/`status`, with `limit` bounded by `config.payout.maxPageSize` (new config key, not a hardcoded number, per your config-agnostic rule).
- `payout.service.ts` → `listTransfers` returns the full `FeeBreakdown` shape per row (gross, commission %, commission amount, gateway fee %, gateway fee amount, GST %, GST amount, total deducted, net transfer) — the computation already exists in `computeFeeBreakdown`; just stop discarding it before it reaches the API response.
- `payout.controller.ts` / `payout.routes.ts` → `GET /payout-accounts/transfers` accepts the new query params, still scoped by `req.user.organizationId` (no change to the auth model — it's already correct).
- Add `GET /payout-accounts/summary` — processed/pending/failed counts + total transferred, same shape as ops's `getOrganizationTransferSummary`, so the org UI can render KPI cards without pulling every row.

## 4. Backend — quizbuzz-ops-next

- `payouts.types.ts` → add `gatewayFeeAmount`, `gstAmount` to `PaymentRouteTransferItem`.
- `payouts.repository.ts` → `getOrganizationRouteTransfers` / `getPlatformRouteTransfers` SELECT the two extra columns (already in the table — no query restructuring, just add them to the SELECT list).
- Add `getPlatformTransferSummary()` — aggregate query (`SUM`/`COUNT` grouped by status, `SUM` of each fee column) for the new platform-wide KPI cards. Cache this behind the existing ops cache layer (`server/cache/`) with a short TTL (config-driven, e.g. `config.payouts.summaryCacheTtlSeconds`) so it's not a full aggregate scan on every dashboard load.
- Add a queue-health read endpoint, e.g. `GET /api/v1/payouts/queue-health`, using BullMQ's `Queue.getJobCounts()` against `route-transfer-queue` (waiting/active/delayed/failed/completed). This requires ops-next to hold a BullMQ `Queue` client pointed at the same Redis instance/prefix as the main app's queue — read-only, no job mutation from ops. If `quizbuzz-ops-next` doesn't already have Redis connectivity, this is the one new piece of infrastructure this plan requires; everything else reuses existing connections (`main-db-pool`, ops Prisma).

## 5. Frontend — org-facing (Quizbuzz-new)

Build the missing "Payout History" panel inside the existing Payouts settings tab (`app/org/settings/page.tsx` → `PayoutsTabContent`), directly below the account status card:

- KPI row: total received, processed count, pending count, failed count (from the new `/summary` endpoint).
- Ledger table: date, contest, gross amount, commission, gateway fee, GST, **net amount transferred**, status, transfer ID — i.e. the full breakdown described in your ask, not just the net figure.
- Status filter + pagination, matching the pattern already built and proven in `OrgPayoutAccountTab.tsx` on the ops side — this is a near-direct port of an existing, working table component, not new UI design.
- Failed/pending rows show `failureReason` in plain language (e.g. "no active payout account on file" instead of the raw enum).

This is the highest-value, lowest-risk piece of the whole plan: the API groundwork mostly exists, the UI pattern already exists on the ops side, and it directly closes the gap you led with.

## 6. Frontend — ops dashboard (quizbuzz-ops-next)

- Route Transfers ledger (`BillingView.tsx`, `transfers` tab): add Gateway Fee and GST columns; add a KPI row above the table (total gross, total commission, total gateway fee + GST pass-through, total net transferred) fed by `getPlatformTransferSummary()`.
- Add a small "Queue Health" card on the payouts page (waiting/active/delayed/failed counts for `route-transfer-queue`, refreshed on an interval) so ops can see backlog or a stuck queue before it shows up as a support ticket.
- No new page/nav needed — `/dashboard/payouts` already exists and already has org-scoped and platform-scoped views; this is additive to what's there, not a new surface.

## 7. Access control (no changes needed, just confirming the boundary)

- Org side: already correctly scoped — `organizationId` is read from the authenticated session (`req.user`), never from client input, so one org can never query another's transfers. The new `/summary` endpoint should follow the same middleware (`authenticatedOrgMiddleware`).
- Ops side: already role-gated — mutations require `SUPER_ADMIN`/`BILLING_ADMIN`; all other authenticated ops roles get read-only access to the platform-wide ledger by design (that's the intended "operational dashboard sees everyone" behavior you described — it already works this way). No org-level restriction applies to ops users, which is correct since ops is inherently cross-tenant.

## 8. Scale considerations

- **Indexing** (above) is the immediate fix — required before any org accumulates more than a few thousand transfer rows, since every list view filters + sorts by `createdAt`.
- **Pagination strategy**: OFFSET/LIMIT (current pattern everywhere) is fine through the tens-of-thousands-of-rows range per org; if a single high-volume org's ledger grows past that, switch that one query to keyset pagination (`WHERE createdAt < :cursor ORDER BY createdAt DESC LIMIT :n`) — flag as a follow-up, not needed for initial ship.
- **Platform-wide aggregates**: don't compute `getPlatformTransferSummary()` live on every page load once transfer volume is large — cache with a short TTL as noted above, or (if it ever becomes a bottleneck) move to a nightly rollup table (`payout_daily_summary`) written by a scheduled job, read by the dashboard. Not needed at current scale; worth designing the summary query so this swap is a drop-in replacement later.
- **Cross-database coupling**: ops-next already queries the main app's Postgres directly via a separate connection pool (`main-db-pool.ts`) instead of over the main app's API. This plan keeps that pattern for consistency (rewriting it to go through HTTP is a much bigger, unrelated change). The scale implication: as ops-side read traffic grows (more orgs, more admins polling the dashboard), that pool competes for connections/IO on the same primary database serving live quiz traffic. Worth tracking `MAIN_DB_POOL_MAX` headroom, and — if ops read load becomes material — pointing `main-db-pool` at a read replica instead of primary. Not a blocker for this feature; a scaling note for later.
- **Redis for queue health**: `Queue.getJobCounts()` is cheap (Redis-native counters, not a scan), safe to poll on an interval from the dashboard without load concerns even at high job volume.

## 9. Rollout order

1. Migration: add the two composite indexes (safe, backwards-compatible, ship first).
2. Backend: extend org-facing `/transfers` with pagination/filter/breakdown + new `/summary` endpoint.
3. Frontend: org-facing Payout History panel (biggest visible win — closes the gap you led with).
4. Backend: ops platform summary endpoint + queue-health endpoint.
5. Frontend: ops ledger gets fee columns + KPI row + queue health card.

Steps 2–3 and 4–5 are independent pairs and can run in parallel if you have two people; on your own, do them in that numeric order since step 3 is the one stakeholders will actually look at first.

## 10. Verification

- Unit test `computeFeeBreakdown` output matches what's rendered in both UIs for a known payment amount (regression guard so gateway fee/GST never silently drift out of the response again).
- Seed a test org with PROCESSED/PENDING/FAILED transfers, confirm the org can only ever see its own rows (negative test: authenticated as Org A, request Org B's data via the summary/list endpoints, expect 403/empty — not just "trust the WHERE clause").
- Confirm ops read-only roles cannot hit the mutation endpoints (`attach`, `status`) — already covered by existing tests if present; extend if not.
- Load-test the paginated org transfer list against a seeded table of ~50k rows for one org to confirm the new index is actually being used (`EXPLAIN ANALYZE`) before shipping to production.
