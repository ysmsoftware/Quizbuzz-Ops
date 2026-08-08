# Billing Portal — Lifecycle & Business Logic Implementation Plan

Status: **Plan only, nothing implemented.** Follows the read-only audit already in this conversation (payment-capture mechanics — signature verification, webhook idempotency, single-subscription-per-org model — are solid and out of scope here). This plan covers what was left: duplicate-purchase prevention, proration, expiry enforcement, pay→assign→sync robustness, the broken redirect env var, and two small residual items. All work is contained to `quizbuzz-ops-next`; the main app (`Quizbuzz-new`) is not touched anywhere in this plan.

One correction from the earlier audit, made before planning around it: the claim that a failed cross-DB entitlements sync is unrecoverable "past Razorpay's ~24h retry window" is only half true. `server/jobs/index.ts` already schedules `runSubscriptionReconciliationJob` nightly at 2 AM (`cron.schedule('0 2 * * *', ...)`), and that job re-syncs the cache for every `ACTIVE` subscription unconditionally — so a subscription that was created successfully but whose initial cache write failed self-heals within at most ~24h regardless of Razorpay. The real gap is narrower: no alerting when that happens, and a separate, genuine idempotency bug in the backfill step (detailed in Phase C) that can silently reset an org's paid period on webhook retry. Sized accordingly below.

---

## Phase A — Close the duplicate-purchase gap

**Problem**: `subscription/order/route.ts`'s reuse check (line 87) only matches `status: { in: ['CREATED', 'PENDING'] }`. Nothing stops a second full-price order for a plan+cycle the org is already actively subscribed to and paid for, whether via a replayed 10-minute handoff token or simply reopening the checkout URL from browser history/a bookmark.

**A.1 — Reject or redirect duplicate purchases of an already-active plan** (primary fix, closes the actual money hole)
File: `app/api/v1/billing-portal/subscription/order/route.ts`, right after the plan lookup (~line 51) and before the existing `CREATED/PENDING` reuse check (~line 81).
Add a lookup of the org's current subscription (`subscriptionsService.getSubscription(organizationId)` or a direct `prisma.organizationSubscription.findUnique`). If one exists, `status === 'ACTIVE'`, `planId` matches the requested plan, `billingCycle` matches the requested cycle, and `currentPeriodEnd` is still in the future, return a `409` with a clear error (`"You already have an active {planName} subscription until {date}"`) instead of proceeding to create a Razorpay order. This is the one check that actually prevents the financial harm, independent of whether the handoff token gets reused.
Open decision: should this also block buying a *different* plan while one is active (forcing "change plan" instead of a second parallel purchase), or only block buying the exact same plan+cycle again? Recommend: block same plan+cycle outright (never a legitimate purchase); for a different plan while active, allow it through to Phase B's proration logic rather than blocking, since that's a legitimate upgrade/downgrade flow.

**A.2 — Handoff token single-use, contained entirely within ops-next**
The token itself (minted in the main app) has no `jti` and a 10-minute TTL — not something to fix here since it means editing the main app, which is out of scope. But ops-next can still make a given token single-use on its own side: hash the raw token (SHA-256) the first time `/session` or `/order` successfully processes it, store that hash with an expiry matching the token's own `exp` claim (a small new table, e.g. `BillingHandoffTokenUse(tokenHash, organizationId, firstUsedAt)`, or a Redis `SETNX` with TTL — Redis is simpler and this repo already depends on Redis for message queues), and reject a repeat call with the same token hash. This is defense-in-depth on top of A.1, not a replacement for it — A.1 is what actually stops the double-charge.

---

## Phase B — Proration

**Problem**: every order is priced as a fresh full cycle. An org upgrading mid-cycle or renewing early gets charged full price with zero credit for unused time on their current plan.

**B.1 — Proration formula**
New function in `lib/pricing/subscriptionPricing.ts`, alongside `calculateSubscriptionPricing`: something like `calculateProratedBase(newPlanBaseAmount, currentSubscription, now)` that computes remaining value on the *current* subscription — `remainingDays = (currentPeriodEnd - now) / oneDay`, `totalPeriodDays = (currentPeriodEnd - currentPeriodStart) / oneDay`, `currentPlanValue = <price the org paid for their current plan+cycle>`, `unusedCredit = round2(currentPlanValue × remainingDays / totalPeriodDays)` — then `proratedBase = max(0, newPlanBaseAmount - unusedCredit)`. Feed `proratedBase` into the existing `calculateSubscriptionPricing()` so gateway fee and GST are computed on the post-credit amount, keeping the "one shared formula, two callers" property the codebase already established for GST/fee.
Note `currentPlanValue` needs a real number to prorate against — since `OrganizationSubscription` doesn't store what was actually paid (only `OpsPayment` does, per-payment), the cleanest source is the org's most recent `PAID` `OpsPayment` for the current subscription (`baseAmount` field, already stored per-payment since the GST/fee work). Fall back to the current plan's live `monthlyPrice`/`annualPrice` × cycle if no matching payment row is found (e.g., a subscription that was ops-admin-assigned rather than paid for).

**B.2 — Wire into order creation**
File: `app/api/v1/billing-portal/subscription/order/route.ts`, where `pricing = calculateSubscriptionPricing(baseAmount)` is computed today (~line 74). If Phase A's active-subscription lookup found an existing active, non-expired subscription (regardless of whether it's the same plan or a different one — this is the upgrade/downgrade/early-renewal case A.1 deliberately lets through), call the new proration function instead of pricing the raw `baseAmount`.

**B.3 — Record what was actually credited**
`prisma/schema.prisma` — add `creditApplied Decimal? @db.Decimal(10, 2)` to `OpsPayment`, alongside the existing `baseAmount`/`gatewayFeeAmount`/`gstAmount`. Populate it in the `opsPayment.create()` call in `order/route.ts` whenever proration applied credit, so the payment row remains a complete, self-contained receipt (matches this codebase's existing convention for the GST/fee breakdown) and the checkout page / admin payment view can show "Credit for unused time: −₹X" as its own line item rather than a mysteriously lower base price.

**B.4 — `assignPlan()` needs no change**
Proration only affects the *price charged*, not the period assigned — the new subscription still gets a full fresh period of the newly purchased plan+cycle starting now, matching the existing "no auto-renewal, one-time charge for the selected period" messaging already on the checkout page. Confirmed by reading `subscriptions.service.ts#assignPlan` (lines 112–147): it takes `billingCycle` and computes the period independently of price, so nothing there needs to know proration happened.

---

## Phase C — Expiry, and the real idempotency edge case

**C.1 — Add an `EXPIRED` status**
`prisma/schema.prisma` — `SubscriptionStatus` currently has only `ACTIVE | PAST_DUE | CANCELLED` (line 17). Add `EXPIRED`. Migration is additive (new enum value), no existing row needs to change.

**C.2 — Detect and transition expired subscriptions**
File: `server/jobs/subscription-reconciliation.job.ts`. Today it only queries `status: 'ACTIVE'` and re-syncs the cache — it never looks at `currentPeriodEnd`. Extend it: before (or as part of) the existing loop, also query `organizationSubscription.findMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: new Date() } } })`, transition each to `status: 'EXPIRED'` via a new repo method (e.g. `subscriptionsRepository.markExpired(orgId)`), write a `subscription.expired` audit log entry per org (reusing `writeAuditLogEntry`, matching the pattern every other subscription mutation in this codebase already follows), then call `syncOrgPlanLimitsCache(orgId)` for that org so `organizations.planStatus` in the main app immediately reflects `'EXPIRED'` rather than waiting for some other trigger.

**C.3 — Scope this honestly: it's a data-correctness fix, not new enforcement**
Per the separate plan-enforcement audit already in this repo (`subscription-enforcement-audit.md`), the main app never actually reads `planStatus` or `planLimitsCache` to gate anything today — it's display-only. So C.1/C.2 make `organizations.planStatus` accurate (an org whose period lapsed will correctly show "Expired" instead of indefinitely showing "Active" with a past date), and give any *future* enforcement work correct data to key off of — but they will not, on their own, change what an expired org can actually do in the product today. If restricting an expired org's access is wanted now rather than later, that requires the main app enforcement work from the other audit, which is out of scope for this plan.
Open decision: should expired limits fall back to a designated free/default plan's numbers, or keep showing the lapsed paid plan's numbers with `status: EXPIRED` alongside them? The schema has no `isDefault` flag on `SubscriptionPlan` today, so "fall back to free tier" would need one added — recommend deferring that until the main app enforcement project actually needs it, and shipping C.1/C.2 as status-only for now.

**C.4 — The actual idempotency bug** (found while re-examining the pay→assign→sync chain for this plan)
File: `app/api/v1/billing-portal/razorpay/webhook/route.ts`, lines 126–149. The "already processed" guard is `if (updatedPayment.subscriptionId) return`. If `assignPlan()` (line 139) fully succeeds — subscription upserted, cache synced — but the very next line's `prisma.opsPayment.update({ data: { subscriptionId: sub.id } })` (line 146) throws for any reason (a transient blip is enough), the `OpsPayment.subscriptionId` never gets backfilled. On Razorpay's next retry delivery, the guarded `PAID` update matches zero rows (already `PAID`), falls into the `P2025` branch (line 109), sees `subscriptionId` is still null, and — correctly, by the existing self-healing design — calls `assignPlan()` again. But `assignPlan()` unconditionally upserts and resets `currentPeriodStart`/`currentPeriodEnd` to "now" every time it runs (line 120: `const start = periodStart || new Date()`), so this retry silently extends the org's paid period by a second full cycle for free, purely because of a transient failure in an unrelated bookkeeping write.
**Fix**: make the "already processed" check independent of the `subscriptionId` backfill succeeding. Before calling `assignPlan()`, look up whether an `OrganizationSubscription` already exists for `updatedPayment.organizationId` with a `currentPeriodStart` at or after the original `paidAt` timestamp (or, more simply, add a `sourcePaymentId` back-reference check — query subscriptions by a new indexed field rather than inferring from the payment side). Simplest concrete version: wrap the `assignPlan()` call and the `subscriptionId` backfill in a single `prisma.$transaction` (both are ops-DB-only writes — `syncOrgPlanLimitsCache`, the cross-DB part, has to stay outside the transaction since it's a different database, but it can run *after* the transaction commits, matching the commit-then-propagate pattern this codebase already uses elsewhere). That way a failure partway through never leaves the "did this payment already create a subscription" question ambiguous — either both ops-DB writes landed, or neither did, and a retry cleanly falls into one deterministic branch instead of re-running `assignPlan`'s side effects.

**C.5 — Failure visibility for the cross-DB sync**
Since `syncOrgPlanLimitsCache` writes to a different Postgres instance than the one any `$transaction` above can cover, a failure there specifically should be logged distinctly (not just swallowed into the generic 500 handler) so an ops admin can tell "payment succeeded, subscription created, cache sync failed, nightly job will retry" apart from a real failure. A minimal version: catch errors from `syncOrgPlanLimitsCache` specifically (in both `assignPlan()` and the nightly job) and write a `subscription.cache_sync_failed` audit log entry with the org id and error message, rather than letting it bubble into an undifferentiated 500/console.error. No new infrastructure needed — this repo already has `writeAuditLogEntry` and an admin-visible audit log view.

---

## Phase D — Fix the broken redirect

File: `.env.production.example`, `docker-compose.prod.yml`, and wherever the real production `.env` is deployed (outside this repo, but flag it).
`NEXT_PUBLIC_MAIN_APP_URL` is read in exactly one place (`app/billing/checkout/page.tsx:49`) and configured nowhere — `.env.production.example` only sets the unrelated server-side `MAIN_APP_FRONTEND_URL`. Add `NEXT_PUBLIC_MAIN_APP_URL` next to `MAIN_APP_FRONTEND_URL` in both `.env.production.example` and the `docker-compose.prod.yml` environment block (same value, `https://ysmquizbuzz.com` per the existing `MAIN_APP_FRONTEND_URL` default), and set it in whatever secret store feeds the real production deployment. Since this is a `NEXT_PUBLIC_*` variable, it's baked in at build time — a rebuild is required after setting it, not just a container restart with a new env value.

---

## Phase E — Two small residual items

**E.1 — Timing-safe JWT signature comparison**
File: `server/utils/jwt.ts`, line 54 — `if (computedSignatureB64 !== signatureB64)`. Every other signature check in this codebase (Razorpay webhook, payment-signature verify) already uses `crypto.timingSafeEqual` with a length check first; this one was missed. Same fix, same pattern: `Buffer.from(...)` both sides, compare lengths before calling `timingSafeEqual` (it throws on mismatched buffer lengths).

**E.2 — Note, not a fix**: the hardcoded handoff-secret fallback (`"billing_handoff_secret_shared_key_998877"`) no longer exists on the ops-next side (`server/config/env.ts` already requires `BILLING_HANDOFF_SECRET` with no default) but is still present in the main app at `Quizbuzz-new/backend/src/config/index.ts:36` and `onboarding.service.ts:206`. Not actioned in this plan since it requires editing the main app, which is explicitly out of scope — recorded here only so it isn't lost.

---

## Suggested order

1. **Phase A** (duplicate-purchase block) — the only item here with direct, ongoing financial exposure; ship first.
2. **Phase C.4** (idempotency fix) — small, precise, closes a real "free extra period on retry" bug.
3. **Phase D** (redirect env var) — trivial, but currently breaks the post-payment UX in production.
4. **Phase E.1** (timing-safe compare) — trivial, bundle with D.
5. **Phase B** (proration) — larger surface (schema column, new pricing function, UI line item), no active exploit, do when there's room for a proper pass including the open decision in B.1.
6. **Phase C.1–C.3, C.5** (expiry status + visibility) — do together since C.5's alerting is most useful once C.2 exists to alert about; lowest urgency since it's a data-correctness/observability improvement rather than a live gap, and its real-world impact is capped by enforcement not existing yet in the main app.

Nothing in this plan has been implemented. Let me know which phases to proceed with.
