# Operational Dashboard — Multi-Org Payout Visibility

Repo: `quizbuzz-ops-next`
Audience: engineer implementing this in the internal ops tool.

## Context

Confirmed workflow this dashboard supports: an org submits a payout setup request (name/email/phone) from their Settings tab. Billing/super admins here see that request land in the **Payout Account Onboarding Queue**, call the org to collect KYC/bank details, manually create the Razorpay Linked Account, and record the linked-account ID + flip status to `ACTIVE` in this dashboard — that's what unlocks paid contests for that org. After that, transfers start flowing and get recorded per-payment.

This dashboard already has the onboarding queue, a cross-org transfer ledger, and a per-org detail tab — all of that is live and working, scoped correctly (mutations require `SUPER_ADMIN`/`BILLING_ADMIN`, everyone else read-only). This doc covers the gaps: fee breakdown isn't shown anywhere, there's no platform-wide summary, and there's no queue-level (BullMQ) visibility distinct from row status. It does not touch the onboarding queue or account-linking flow, which already works correctly.

## 1. Backend changes (`server/features/payouts/`)

**`payouts.types.ts`**
Add the two missing fields to the existing transfer item type:
```ts
export interface PaymentRouteTransferItem {
  // ...existing fields
  gatewayFeeAmount: number;
  gstAmount: number;
}

export interface PlatformTransferSummary {
  processedCount: number;
  pendingCount: number;
  failedCount: number;
  totalGrossPaise: number;
  totalCommissionPaise: number;
  totalGatewayFeePaise: number;
  totalGstPaise: number;
  totalTransferredPaise: number;
  currency: string;
}
```

**`payouts.repository.ts`**
- `getOrganizationRouteTransfers` and `getPlatformRouteTransfers`: add `prt."gatewayFeeAmount"`, `prt."gstAmount"` to both SELECT lists (columns already exist on `payment_route_transfers` in the main app's DB — no schema work needed here, this repo just isn't selecting them).
- Add `getPlatformTransferSummary()`:
```ts
async getPlatformTransferSummary(): Promise<any> {
  const rows = await queryMainDb(`
    SELECT
      COUNT(CASE WHEN status = 'PROCESSED' THEN 1 END)::int as "processedCount",
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int as "pendingCount",
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END)::int as "failedCount",
      COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "grossAmount" ELSE 0 END), 0)::bigint as "totalGrossPaise",
      COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "platformFeeAmount" ELSE 0 END), 0)::bigint as "totalCommissionPaise",
      COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "gatewayFeeAmount" ELSE 0 END), 0)::bigint as "totalGatewayFeePaise",
      COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "gstAmount" ELSE 0 END), 0)::bigint as "totalGstPaise",
      COALESCE(SUM(CASE WHEN status = 'PROCESSED' THEN "transferAmount" ELSE 0 END), 0)::bigint as "totalTransferredPaise"
    FROM payment_route_transfers prt
    JOIN organizations o ON prt."organizationId" = o.id
    WHERE o."isDeleted" = false
  `);
  return rows[0];
}
```
This is a full-table aggregate — wrap the call in the existing ops cache layer (`server/cache/`) with a short TTL (e.g. `config.payouts.summaryCacheTtlSeconds`, default ~60s) so it isn't recomputed on every dashboard refresh. Don't hardcode the TTL inline.

**`payouts.service.ts`**
- Map the two new fields through in `getOrganizationRouteTransfers` / `getPlatformRouteTransfers` (they're already doing paise→rupee conversion for the other amount fields — same treatment).
- Add `getPlatformTransferSummary()` wrapping the repo call, converting paise fields to rupees for the response.

**`payouts.controller.ts`**
Add:
```ts
async getPlatformTransferSummary(req: Request) {
  await getSessionAdmin();
  const result = await this.service.getPlatformTransferSummary();
  return okResponse(result, 'Platform transfer summary retrieved.');
}
```
Read-only, so any authenticated ops admin can call it — same pattern as the existing list endpoints (`getSessionAdmin()` only, no `requireRole`).

**Routing** — wire the new controller method to `GET /api/v1/payouts/summary` in whatever router file registers the existing `payouts.controller` routes.

## 2. Queue health (new capability for this dashboard)

The row `status` field (`PENDING/PROCESSED/FAILED/REVERSED`) tells you a transfer's final business outcome. It does **not** tell you the BullMQ queue's live state — how many jobs are currently waiting, actively processing, delayed (behind the reserve-transfer safety window), or sitting in the failed-jobs list after exhausting retries. You asked for "queue state or whatever fail transfer" visibility specifically — this is that.

**New requirement**: `quizbuzz-ops-next` needs a read-only Redis connection to the same Redis instance/prefix the main app's `route-transfer-queue` uses (check `Quizbuzz-new/backend/src/config/redis.ts` and `config.queue.prefix` for the connection details to mirror). If ops-next has no Redis client today, this is the one new piece of infrastructure this doc requires — everything else reuses existing connections.

Add `server/features/payouts/payouts-queue.service.ts`:
```ts
import { Queue } from 'bullmq';
import { redis } from '../../lib/redis'; // add this client if it doesn't exist yet
import { config } from '../../config';

const routeTransferQueue = new Queue('route-transfer-queue', {
  connection: redis,
  prefix: config.queue.prefix, // must match the main app's prefix exactly
});

export async function getRouteTransferQueueHealth() {
  const counts = await routeTransferQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  return counts;
}
```
This is read-only (`getJobCounts` doesn't touch jobs) — ops-next should never call `.add()`, `.retry()`, or `.remove()` on this queue; job mutation stays owned by the main app.

Add `GET /api/v1/payouts/queue-health` → controller → `getRouteTransferQueueHealth()`. Cheap Redis-native counters, safe to poll on an interval (e.g. every 15–30s from the frontend) without load concerns.

## 3. Frontend changes (`components/views/BillingView.tsx`)

**Route Transfers tab (`activeTab === 'transfers'`)** — the cross-org ledger:
- Add **Gateway Fee** and **GST** columns to the existing table (between "Platform Fee" and "Transfer Amount"), using the two new fields now present in `transfersData`.
- Add a **KPI row** above the table (4–5 cards): Total Gross, Total Commission, Total Gateway Fee + GST, Total Net Transferred, fed by a new `usePlatformTransferSummary()` hook calling `/payouts/summary`. Same visual pattern as the KPI cards already built in `OrgPayoutAccountTab.tsx` — reuse that component's card styling rather than inventing new ones.

**New: Queue Health card** — add near the top of the Payouts page (`app/dashboard/payouts/page.tsx` or as a header strip in `BillingView.tsx` when `initialTab === 'payouts'`/`'transfers'`): waiting / active / delayed / failed counts for `route-transfer-queue`, polling `/payouts/queue-health` on an interval. A non-zero `failed` count or a growing `waiting`/`delayed` count is the "backlog or stuck queue" signal ops needs before it becomes a support escalation.

**`lib/api/payouts.ts` / `lib/hooks/usePayouts.ts`**
Add `getPlatformTransferSummary()` and `getRouteTransferQueueHealth()` API functions + corresponding `usePlatformTransferSummary()` / `useQueueHealth()` hooks (React Query, short `staleTime` for the queue-health one given it's meant to be near-live).

No new page or nav entry needed — `/dashboard/payouts` already exists with both tabs; everything here is additive to what's already rendered.

## 4. Migration dependency

The `createdAt`-covering indexes on `payment_route_transfers` (`@@index([organizationId, createdAt])`, `@@index([status, createdAt])`) live in the **main app's** Prisma schema (`Quizbuzz-new/backend/prisma/schema.prisma`), not this repo. This dashboard's queries benefit from that migration but don't own it — coordinate with whoever ships the main-app doc (`main-app-payout-history-tab.md`) so it lands before this dashboard's ledger and summary queries run at meaningful volume. `queryMainDb` here reads the same physical database, so no separate migration is needed on the ops side.

## 5. Scale note specific to this dashboard

This dashboard already queries the main app's Postgres directly via a dedicated connection pool (`server/db/main-db-pool.ts`) rather than over HTTP — that's the existing, intentional pattern here, not something this doc changes. Two things worth tracking as payout volume grows:
- The new `getPlatformTransferSummary()` aggregate is a full-table scan without the cache layer — make sure the caching described in §1 actually ships with it, not as a "later" item.
- As more ops admins have this dashboard open (polling queue-health, refreshing the ledger), that's additional concurrent load on `main-db-pool` against the same primary database serving live payment/quiz traffic. Keep an eye on `MAIN_DB_POOL_MAX` headroom; a read replica for ops traffic is the long-term answer if this becomes a contention point, but isn't required to ship this feature.

## 6. Acceptance criteria

- A billing/super admin can see, for any organization, every processed/pending/failed transfer with commission, gateway fee, GST, and net amount broken out separately.
- The platform-wide ledger shows aggregate totals (gross, commission, gateway fee + GST, net) without a full-page load spike — confirm the cache is hit on repeated loads within its TTL.
- The queue health card correctly reflects a manually-induced backlog (e.g. pause the worker in a staging environment, enqueue a few jobs, confirm `waiting` count updates) and a manually-induced failure (force a job to exhaust retries, confirm `failed` count updates).
- Read-only ops roles can view all of the above; only `SUPER_ADMIN`/`BILLING_ADMIN` can still perform the existing mutations (attach account, change status) — no regression to that boundary.

## 7. Out of scope for this doc

The org-facing payout history tab in the main app — see the companion doc `main-app-payout-history-tab.md`. The account-linking request queue and manual-link flow already work today and aren't touched by this doc.
