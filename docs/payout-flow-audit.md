# Payment → Payout Flow Audit

Scope: full trace from a participant paying for a contest through to the org and ops dashboards showing that money. Code read directly (not assumed) across `Quizbuzz-new/backend` (payment + payout modules, webhook handler, queue, worker) and `quizbuzz-ops-next` (payouts feature). The visibility features from the last round are implemented correctly and match the earlier plan docs. This audit goes one layer deeper: correctness and safety of the money-movement logic itself.

**Bottom line up front:** one critical bug can permanently strand a transfer with no automatic recovery (§3.1) and one gap means a transient Redis blip can silently drop a transfer forever (§4.1). Neither loses the participant's money or double-charges anyone — but both can leave an org's payout stuck with no system-generated signal that anything is wrong, which is exactly the failure mode you asked me to hunt for. Everything else below is real but lower severity.

## 0. The flow, as implemented

1. Participant registers for a paid contest → `PaymentService.createOrder` creates a Razorpay order + a `Payment` row (`status: CREATED`).
2. Participant pays via Razorpay checkout. Frontend polls `GET /payments/:participantId/status` (`checkPaymentStatus`) — this is a read-only reflection of DB state, it does not itself confirm payment. Correct design: the frontend never trusts the client-side "payment succeeded" callback alone.
3. **Razorpay webhook is the actual source of truth** (`PaymentService.handleWebhook`): signature-verified, looks up the `Payment` by `razorpayOrderId`, cross-checks `amount` against what Razorpay reports, then on `payment.captured`: marks the payment `SUCCESS`, confirms the participant's registration, enqueues a confirmation email, and enqueues a `route-transfer-queue` job (delayed by `config.payout.transferDelayMs`, jobId = `route-transfer-{paymentId}`).
4. `RouteTransferWorker` picks up the job → `PayoutService.createRouteTransferForPayment`: computes the fee breakdown (commission / gateway fee / GST / net), checks the org has an `ACTIVE` payout account with a linked Razorpay account, writes a `PENDING` `PaymentRouteTransfer` row, calls Razorpay's Transfer API, then updates the row to `PROCESSED` or `FAILED`.
5. Org sees this in their new Payout History tab (`GET /payout-accounts/transfers`, `/summary`). Ops sees it platform-wide in the Route Transfers ledger and per-org in the org detail tab, plus the account-linking queue and (new) queue-health card.

This is a sound design — webhook-as-source-of-truth, queue-based transfer with a safety delay, idempotency keys, DB as the durable record. The issues below are in the edges, not the shape.

## 1. Perspective walkthroughs

**Participant (payer):** unaffected by anything in this audit — the payment capture path (steps 1–3) is the "tried and tested" system you said is already solid, and nothing here changes it. One adjacent observation in §4.3 is worth your attention regardless, since it touches the same webhook handler.

**Organization admin:** before linking a payout account — can create free contests only; any attempt to enable payment on a contest without an `ACTIVE` payout account should be blocked at contest-creation time (worth confirming this check exists in the contest module — not in scope of what I read this pass, flag for a follow-up check). After submitting a setup request — sees `PENDING VERIFICATION` in Settings → Payouts, no transaction data yet (correct, there isn't any). After ops activates the account — contests can now take payment; the new Payout History panel shows each transfer with full breakdown as money comes in. If a transfer fails or gets stuck (§3.1/§4.1), **the org sees nothing different from "processing" — there's no visual distinction between a transfer that's genuinely queued and one that's silently stuck.** That's a real gap from the org's perspective: they have no way to know to complain.

**Ops billing/super admin:** sees the account-linking queue, links accounts, sees the platform-wide ledger with the new fee breakdown and summary KPIs, and now a queue-health card. Can see `FAILED` transfers (Razorpay API errors are correctly surfaced there). **Cannot currently distinguish, from the dashboard alone, a `PENDING` row that's "waiting on the org to link their account" from one that's "stuck because a worker died mid-transfer"** — both render identically. `failureReason` is the only differentiator (`no_active_payout_account` vs. `null`), and it's not surfaced as a filter/segment anywhere in the UI today.

**Read-only ops roles:** correctly cannot mutate (attach/status-change gated by `SUPER_ADMIN`/`BILLING_ADMIN` — confirmed in `payouts.controller.ts`), can view everything platform-wide by design.

## 2. Database query review

No N+1 patterns in the money-movement path. Specifically checked:
- `payout.repository.ts` → `listTransfersByOrgId` uses a Prisma nested `include` (`payment.contest.title`) — this compiles to a single query with a join, not per-row lookups.
- `payouts.repository.ts` (ops) → org note lookups for the account queue are batched with `organizationId: { in: orgIds }`, not looped.
- Both `getPlatformPayoutAccounts` and `getPlatformRouteTransfers` do exactly two round trips each (count + data), which is standard and fine.

Two minor items, not urgent:
- `getPlatformPayoutAccounts`'s `pendingTransferCount` is a correlated subquery per row (`SELECT COUNT(*) FROM payment_route_transfers WHERE organizationId = ... AND status = 'PENDING'`). Fine at current org counts; if the onboarding queue view is ever paginated over thousands of orgs, a composite `(organizationId, status)` index on `payment_route_transfers` would help this specific subquery more than the `(status, createdAt)` index already added.
- Ops's org-note lookup filters `tags: { has: 'payout' }` (array containment) — confirm `OrganizationNote.tags` has a GIN index if that table grows large; not checked this pass.

The `createdAt`-covering indexes from the last round are correctly in the schema and migrated (`20260725090217_update_payout_transfer_indexes` — confirmed the migration file actually drops the old single-column indexes and creates the composite ones, not just additive).

## 3. Race conditions — this is where the real findings are

### 3.1 CRITICAL — FIXED: a crashed worker permanently strands a transfer, and nothing ever retries it

**Status: fixed in `payout.service.ts`.** `createRouteTransferForPayment` no longer treats "a row exists" as automatically terminal. A new `classifyExistingTransfer` helper distinguishes: `PROCESSED`/`REVERSED` (genuinely done), `FAILED` (needs an explicit retry, not an automatic one — see below), `still-no-account` (re-checks current account status rather than trusting the stale row, so a transfer parked before the account was linked now resumes once it's active), `possibly-in-flight` (PENDING, no failure reason, younger than `config.payout.stuckTransferResumeAfterMs` — assume a concurrent attempt is genuinely running, don't touch it), and `resumable` (PENDING, no failure reason, older than that grace window — an interrupted prior attempt, safe to resume using the existing row rather than creating a duplicate). New env var `PAYOUT_STUCK_TRANSFER_RESUME_AFTER_MS` (default 3 minutes) controls the grace window. Verified with `tsc --noEmit` — no type errors.

Also corrected while implementing this: my original read of `queues/index.ts` said `routeTransferQueue` had no `defaultJobOptions` (i.e., no retry-on-failure at all). Re-reading it during the fix, `defaultJobOptions` is in fact present — `attempts: config.queue.retryAttempts` with backoff, same as every other queue. That part of the original finding was wrong; retracting it. What remains true, and is what this fix addresses, is the separate BullMQ mechanism this bug actually exploited: **stalled-job recovery**, not failed-job retry. If a worker process dies while holding a job's lock (crash, OOM, deploy restart) — as opposed to the job throwing an error — BullMQ's stalled-job detection redelivers it independently of the `attempts` setting. That redelivery is what walked straight into the "row exists → already handled" short-circuit. The fix above is what actually closes that gap; the `attempts` config was never the issue.

Original finding text, for reference:

`PayoutService.createRouteTransferForPayment` treats "a `PaymentRouteTransfer` row already exists for this payment" as "already handled" and returns immediately:

```ts
const existingTransfer = await this.payoutRepository.findRouteTransferByPaymentId(payment.id);
if (existingTransfer) {
  logger.info("Payout transfer already exists for payment", ...);
  return existingTransfer;   // <-- returns even if status is still PENDING with no failure reason
}
```

Walk the crash scenario: the worker creates the `PENDING` row (step 3 in the function), then the process dies — OOM kill, deploy restart, container eviction — *while awaiting the Razorpay Transfer API call*, before the `try/catch` around it can write `FAILED`. BullMQ's stalled-job detection (on by default, no custom settings in `route-transfer.worker.ts`) will eventually redeliver that job to another worker. That redelivery calls `createRouteTransferForPayment` again — and the idempotency check above fires, sees the `PENDING` row from the dead attempt, and returns without ever calling Razorpay. **The one mechanism that exists specifically to survive a crash (BullMQ's automatic retry) is neutralized by this idempotency check.** The transfer is now permanently stuck at `PENDING` — no scheduled job, no worker retry, no ops action in the current UI will ever move it forward, because there's no "retry this transfer" button and the automatic path is dead.

This looks identical in the dashboard to the legitimate "org hasn't linked a payout account yet" `PENDING` state, *except* for `failureReason`: the no-account case always sets `failureReason: 'no_active_payout_account'`; a crash-orphaned row has `failureReason: null` and no `razorpayTransferId`. That's your diagnostic signal.

**Fix:** don't short-circuit on "row exists" alone. Only treat the transfer as done when `status !== PENDING`, or when it's `PENDING` specifically because of the known no-account case. For a resumable `PENDING` row (no failure reason, no transfer id, account now active), skip re-creating the row and proceed straight to the Razorpay call using the existing row's id. As a monitoring backstop regardless of the code fix: alert on any `PaymentRouteTransfer` in `PENDING` with `failureReason IS NULL` older than a few minutes — that query alone gives ops a way to find every stuck transfer today, before the code fix ships.

### 3.2 FIXED — Payment webhook: concurrent redelivery race on `markSuccess`

`markFailed` guards its update with `status: { in: [CREATED, PENDING] }` — a proper conditional write. `markSuccess` does not:

```ts
async markSuccess(data) {
  return prisma.payment.update({
    where: { razorpayOrderId: data.razorpayOrderId },   // no status guard
    ...
  });
}
```

`handleWebhook` reads the payment's status once, checks it's not already `SUCCESS`/`FAILED`, then calls `markSuccess`. Two concurrent webhook deliveries for the same order (Razorpay does redeliver) can both pass that check before either writes, then both execute `markSuccess`, both call `confirmPaymentRegistration` (idempotent — just re-sets the same status, harmless), and both enqueue the confirmation email (`messagingService.enqueueMessage` has no dedup key visible in `sendMessage` — this likely sends **two confirmation emails** to the participant). The `routeTransferQueue.add` call is protected by its jobId (`route-transfer-{paymentId}`), so no duplicate transfer job — that part's safe.

Net effect: not a money-safety issue, but a real, fixable inconsistency — `markSuccess` should take the same `where: { razorpayOrderId, status: { notIn: [SUCCESS] } }` guard `markFailed` already uses, and the caller should treat "zero rows updated" as "another delivery already won" and skip the side effects, exactly like the transfer-row creation already does with its P2002 handling. That pattern already exists in this codebase (`createTransferRow`) — it just wasn't applied consistently to `markSuccess`.

**Fixed**: `markSuccess`'s WHERE clause now includes `status: { not: SUCCESS }`, matching `markFailed`'s pattern. `handleWebhook` catches the resulting Prisma P2025 ("record not found," i.e. the WHERE matched zero rows) and treats it as "a concurrent delivery already won," logging and returning without re-running the side effects. Verified with `tsc --noEmit`.

### 3.3 Disabling a payout account doesn't abort an in-flight transfer

`createRouteTransferForPayment` reads `payoutAccount.status` once near the top of the function and doesn't re-check it immediately before calling Razorpay's Transfer API. If an ops admin sets an org's status to `DISABLED` (say, for a fraud hold) in the window between that read and the actual Razorpay call completing, the transfer can still go through — the code already committed to proceeding based on a snapshot that's now stale. The window is small (one function's execution time, typically sub-second to a couple seconds depending on Razorpay API latency) but non-zero, and this is precisely the scenario — "we need to freeze this org's payouts *now*" — where a small window is unacceptable. Low likelihood, high consequence if it ever lines up. Recommend re-checking `payoutAccount.status === ACTIVE` immediately before the Razorpay call (a cheap extra `findPayoutAccountByOrgId`), not just at function entry.

### 3.4 Attaching a linked account has no pre-check for reuse

Ops's `attachLinkedAccount` (raw SQL `UPDATE ... WHERE organizationId = $2`) never checks whether `razorpayLinkedAccountId` is already attached to a *different* org before writing it. The DB's unique constraint (`organization_payout_accounts_razorpayLinkedAccountId_key`) will reject a genuine duplicate — so this can't silently corrupt data — but the failure surfaces as a raw Postgres unique-violation error rather than a clear "this Razorpay account is already linked to Org X" message to the billing admin who just fat-fingered a copy-paste during a phone call. Worth noting: `payout.repository.ts` (main app) already has an unused `findPayoutAccountByLinkedAccountId` method — nobody calls it. Wiring that into the ops attach flow as a pre-check turns a cryptic DB error into a clear conflict message, which matters given this is a manual, human-driven step by design.

## 4. Failure tolerance — what breaks, where, and how you'd know

### 4.1 CRITICAL — FIXED: a Redis blip at the exact moment of webhook processing silently drops the transfer forever

**Status: fixed via a reconciliation job + an ops "chain of events" view.** Two parts:

1. `PaymentService.reconcileStuckTransfers()` (new, `payment.service.ts`) runs every `PAYOUT_RECONCILIATION_INTERVAL_MINUTES` (default 15) as a BullMQ repeatable job on `route-transfer-queue` (same pattern the analytics worker already uses for its snapshot job). It finds SUCCESS payments with no transfer row at all past `PAYOUT_RECONCILIATION_GRACE_PERIOD_MS` (default 10 min) and re-enqueues them, and finds PENDING transfers with no failure reason past the same window and re-enqueues those too — both go through the exact same queue/worker path a normal webhook-driven transfer does, just with a fresh jobId (the original `route-transfer-{paymentId}` jobId may already be sitting in BullMQ's completed/failed set, where jobId dedup would silently no-op a re-add).
2. The ops dashboard's new **Investigate** tab (§ chain-of-events, below) surfaces exactly this gap as a "NO TRANSFER RECORD" item in the Needs Attention list, so it's visible before the next sweep even runs, and an admin can manually trigger a retry.

### Chain of events / audit trail (closes §5's core gap)

New **Investigate** tab in the ops Payouts page (`components/views/PayoutInvestigationPanel.tsx`), backed by:
- `GET /api/v1/payouts/timeline?search=` — look up any payment by internal id, Razorpay order id, or Razorpay payment id, and get back the full ordered chain: order created → payment captured/failed → transfer enqueued → transfer processed/failed/stuck, each with a timestamp and the relevant amounts/ids/failure reason.
- `GET /api/v1/payouts/needs-attention` — the discovery view: everything currently in a "missing transfer" or "stuck pending" state, without needing to already know a payment id.
- `POST /api/v1/payouts/transfers/:paymentId/retry` — explicit, human-triggered retry (SUPER_ADMIN/BILLING_ADMIN only, audit-logged), which sets `forceRetry: true` on the job payload. This is what lets an admin act on "this payment wasn't transferred, retry it" directly from the chain-of-events view — refuses outright if the transfer already shows PROCESSED, to make double-paying an org structurally impossible from this path.

This doesn't add a separate event-log table — it's assembled from the existing `Payment` and `PaymentRouteTransfer` rows (both already carry the timestamps and status needed), which is also why it required no new migration.

In `handleWebhook`, after `markSuccess` succeeds, the transfer enqueue is wrapped defensively:

```ts
try {
  await routeTransferQueue.add(...);
} catch (err) {
  logger.error(`[payment] Failed to enqueue route transfer: ...`, { paymentId: payment.id });
}
```

That catch is good practice for keeping the webhook fast and non-blocking — but it means if Redis is briefly unreachable at that exact instant, the payment is `SUCCESS`, the participant is registered, the confirmation email goes out — and **no `PaymentRouteTransfer` row is ever created, and no queue job exists.** The only trace is one log line. Because the webhook handler swallows the error and the controller (§4.3) always returns 200 to Razorpay, there is no retry path: not from Razorpay (it thinks delivery succeeded), not from BullMQ (no job was ever created to retry), not from the idempotency check in §3.1 (nothing to find — there's no row at all). This is functionally identical in severity to §3.1 but with a different trigger (transient infra blip vs. process crash) and, unlike §3.1, it leaves *zero* DB trace — not even a stuck `PENDING` row to query for.

**Recommendation:** this is the strongest argument for a periodic reconciliation job (mentioned in the earlier plan doc, worth prioritizing now given this finding): scan `Payment` rows with `status = SUCCESS` older than N minutes with no matching `PaymentRouteTransfer` row at all, and re-enqueue them. `createRouteTransferForPayment` is already idempotent by payment id (once §3.1 is fixed), so this job is safe to run repeatedly.

### 4.2 CLOSED — not a reachable failure mode: amount mismatch is prevented at order creation, not just checked at the webhook

**Status: verified, no fix needed.** Re-read `PaymentService.createOrder`: the amount used to create the Razorpay order — and the amount stored in `Payment.amount` — both come from `contest.paymentConfig.amount`, a value the org configured and we already trust, never from the client's request body. Razorpay's checkout flow doesn't let a payer complete a different amount than the order specifies. So the webhook's `payment.amount !== paymentEntity.amount` check (below) can only fire for actual signature-level tampering — already blocked separately by the signature verification earlier in the same function — or an internal bug, not for any normal user flow. Leaving the check in place is correct defense-in-depth; it just isn't a reachable gap that needs a recovery path.

Original finding, for reference:

```ts
if (payment.amount !== paymentEntity.amount) {
  logger.error("Amounr mismatch in webhook", {...});
  return;   // payment stays whatever status it was — no transition, no alert
}
```

This is a legitimate anti-tampering check (also worth noting: [sic] typo in the log message — cosmetic, but greppability matters when this is your only trace of a real incident). If this branch ever fires for a real payment (config drift, currency rounding edge case, a bug elsewhere), the payment just stays `CREATED`/`PENDING` indefinitely — participant paid, Razorpay confirms it, and our system never marks it, never registers the participant, never queues a transfer. Nothing pages anyone; it's a single `logger.error` call in a log file with 14-day retention. Given this is the one branch that represents "money moved but we refused to record it," it deserves an actual alert, not just a log line.

### 4.3 The webhook controller always returns 200, even on internal failure

```ts
handleWebhook = async (req, res, next) => {
  try {
    ...
    return res.status(200).json({ status: "ok" });
  } catch (err) {
    logger.error("Webhook error", { err });
    return res.status(200).json({ status: "received" });   // 200 even on error
  }
}
```

This is a defensible choice to avoid Razorpay's retry storm turning a transient error into duplicate processing — but the consequence is that **Razorpay's own webhook redelivery, which is the platform's only built-in safety net for a failed webhook, is unconditionally disabled for every failure mode**, not just the ones you've explicitly handled. If `markSuccess` itself throws (DB briefly unavailable, connection pool exhausted under load), that event is gone — Razorpay believes it was delivered successfully and will never resend it. Combined with §4.1, this means the system currently has no automatic recovery path for *any* transient failure during webhook processing. This reinforces §4.1's recommendation: a reconciliation job isn't just nice-to-have for the transfer step specifically, it's the only safety net for the whole webhook pipeline as currently designed.

### 4.4 Razorpay Transfer API failure — this path is actually handled well

Worth stating explicitly since it's the "does the happy-path-failure work" question: if `razorpayProvider.createPaymentTransfer` throws (Razorpay API error, network timeout to Razorpay, insufficient reserve balance, etc.), the `catch` block correctly transitions the row to `FAILED` with `failureReason` set, which is immediately visible in both the org and ops ledgers with the actual error message. This is the one failure mode in the whole flow that's fully observable today without any additional work. No action needed here — flagging it so you know this specific case is already covered, in contrast to §3.1/§4.1.

### 4.5 Historical data will display incorrect fee breakdowns for pre-migration transfers

Confirmed by reading the migration history directly: `gatewayFeeAmount`/`gstAmount` columns didn't exist on `payment_route_transfers` until migration `20260725120000_add_gateway_fee_gst_to_route_transfers`, added with `DEFAULT 0`. Any `PROCESSED` transfer from before that migration will now display **Gateway Fee: ₹0, GST: ₹0** in both the new org Payout History panel and the ops ledger — which is misleading, not accurate. The actual net amount that landed in the org's account for those historical transfers (`transferAmount`) is presumably still correct (that column existed from day one), but the breakdown shown alongside it for old rows implies no gateway fee/GST was ever deducted, which wasn't true. Recommend either backfilling real historical figures if they're reconstructable (from Razorpay's transfer/settlement API using the stored `razorpayTransferId`) or, more simply, having the UI show "breakdown not tracked for transfers before [date]" instead of a bare ₹0 for rows where `gatewayFeeAmount === 0 && gstAmount === 0 && createdAt < migration date` — a flat zero reads as "we charged nothing," which is a worse story to accidentally tell an organization about their own money than "we didn't track this level of detail yet."

## 5. Audit trail / traceability

**What's solid today:**
- Ops mutations (`attachLinkedAccount`, `updatePayoutStatus`) write structured audit log entries via `writeAuditLogEntry`, capturing actor, previous status, new status, and reason — genuinely useful for "who changed what, when, why" on the account-linking side.
- Every transfer row carries `failureReason` and (on success) `razorpayTransferId` and the full Razorpay API response in `metadata` — enough to reconstruct what happened for any transfer that *did* get processed or *did* fail cleanly.
- Structured JSON logging in production with request-scoped context (`paymentId`, `organizationId`, etc.) throughout the payment and payout services.

**What's missing:**
- No equivalent audit-log entries for the money-movement decision points themselves (payment marked SUCCESS, transfer enqueued, transfer processed/failed) — those exist only as application logs, not as queryable audit records tied to an organization or payment. If you need to answer "show me everything that happened to payment X" six months from now, today you'd be grepping expired log files (§5, retention below) rather than querying a table.
- Log retention is 14 days (`winston-daily-rotate-file`, `maxFiles: "14d"`) with no external sink. For a payments feature, the log lines are frequently the *only* evidence of a transient failure (§4.1, §4.2) — once they roll off, that evidence is gone even though the underlying money question ("why didn't org X get paid for a specific contest") might not surface until later.
- No alerting layer at all for the failure branches identified above — everything degrades to "someone happens to notice" or "the org calls asking where their money is."

**Recommendation, in priority order:** (1) fix §3.1's idempotency check — this is a correctness bug, not just an observability gap; (2) add the reconciliation job from §4.1 — it's the single highest-leverage fix, closing both §4.1 and acting as a backstop for §3.1 and §4.3; (3) add alerting (even a simple Slack webhook) on: transfer `FAILED` status, `PENDING` transfers older than a threshold with no `failureReason`, and the amount-mismatch branch in §4.2; (4) extend retention or ship error-level logs to a durable sink for anything touching `payment_route_transfers`/`payments`, since these logs are your incident forensics for real money.

## 6. Summary table

| # | Finding | Severity | Category |
|---|---|---|---|
| 3.1 | Idempotency check on transfer creation blocks legitimate retries after a crash — permanently stuck PENDING | Critical | **Fixed** — see §3.1 |
| 4.1 | Redis blip during webhook = transfer silently never created, zero DB trace, no retry path | Critical | **Fixed** — reconciliation job + Needs Attention view, see §4.1 |
| 4.3 | Webhook always returns 200, disabling Razorpay's own redelivery safety net for all internal errors | High | Open — intentional per Razorpay's own guidance; reconciliation job (4.1) is the actual safety net now |
| 3.3 | Disabling an org's payout account doesn't abort a transfer already past the eligibility check | Accepted | Confirmed intended behavior — no change |
| 4.2 | Amount-mismatch webhook branch strands a payment silently with only a log line | N/A | **Closed** — verified not reachable, see §4.2 |
| 4.5 | Pre-migration transfers show ₹0 gateway fee/GST — misleading, not just incomplete | N/A | Dismissed — pre-launch, DB will be reset before go-live |
| 3.2 | `markSuccess` lacks the status-guard `markFailed` already has — duplicate confirmation emails on webhook redelivery race | Low | **Fixed** — see §3.2 |
| 3.4 | No pre-check before linking a Razorpay account to an org — relies solely on a raw DB error surfacing | Accepted | One-time manual step, uniqueness owned by Razorpay — no change |
| §2 | Correlated subquery for pending-transfer counts; unindexed `tags` array filter on org notes | Low | Open |
| §5 | No audit-log rows (only logs) for money-movement events; 14-day log retention; no alerting | Medium | **Substantially addressed** — chain-of-events timeline + Needs Attention view + retry audit logging, see §4.1. Log retention/external alerting still open. |

## 7. New capability added this round: forced retry

`PayoutService.createRouteTransferForPayment` now accepts `{ forceRetry?: boolean }`. Automatic paths (webhook, reconciliation sweep) never set it, and it only ever changes behavior for a `FAILED` transfer — `PROCESSED`/`REVERSED` remain terminal unconditionally, even on a forced retry, so this can't be used to double-pay an org. The ops "Investigate" tab's retry action is the only caller that sets it, and only for a human-reviewed, explicitly-requested case.

Nothing here indicates money has actually been lost or duplicated in production — the design's core safeguards (idempotent transfer creation by payment id, signature verification, amount cross-check, unique constraints) are doing their job. The findings are about what happens in the unlucky-timing and infrastructure-blip cases, which is exactly the right thing to pressure-test before this scales past manual, occasional monitoring.

## 8. Enhancement: trace by registration, not just payment ID

The original chain-of-events view (§4.1) was payment-anchored: you had to already know an internal payment id, Razorpay order id, or Razorpay payment id to look anything up. Real support contact never arrives that way — an org or participant reports "registration failed," "the transfer for this contest never came through," or gives an email/phone number, not a payment id. Requiring ops to first go find the payment id elsewhere before they could even open the timeline was a real gap in the tool's usability for its actual job.

**What changed:**
- `findPaymentForTimeline` (single-row, payment-anchored) replaced with `findRegistrationsForTimeline` (array, participant-anchored) in `payouts.repository.ts`. The query now starts from `participants` and LEFT JOINs out to `contacts`, `contests`, `payments`, and `payment_route_transfers`, matching on: participant id, registration reference, contact email (case-insensitive), contact phone, or any of the existing payment/order/Razorpay ids. A free contest, or a paid contest where the participant hasn't started payment yet, now still returns a match — just with no payment/transfer legs.
- `getPaymentTimeline` in `payouts.service.ts` now branches three ways: zero matches → not found; exactly one match → full timeline; more than one match → returns a `matches` pick-list instead of guessing. Multiple matches happen legitimately when the same contact registers for more than one contest — email/phone search can't be unambiguous by design, so the API surfaces the ambiguity rather than resolving it silently.
- The timeline itself now starts one step earlier: `PARTICIPANT_REGISTERED`, before `ORDER_CREATED`. For a free contest it stops there with `NO_PAYMENT_REQUIRED`. For a paid contest where payment hasn't started, it stops with `PAYMENT_NOT_STARTED` (flagged `problem` severity if the participant's own status shows `PENDING_PAYMENT`, since that's a participant who tried and got stuck before a payment record even exists). Everything downstream of `ORDER_CREATED` is unchanged from §4.1.
- Ops **Investigate** tab (`PayoutInvestigationPanel.tsx`) search box and copy updated to reflect this — placeholder now shows a registration reference and email/phone alongside the existing payment/order id examples. A new pick-list renders when a search is ambiguous, showing participant name, contest, org, registration ref, and contact info per match; clicking one re-searches by that exact `participantId` to resolve to a single timeline.

No new table, no new migration — same as §4.1, this is assembled from data already sitting in `Participant`/`Contact`/`Contest`/`Payment`/`PaymentRouteTransfer`. Verified with `tsc --noEmit -p tsconfig.json` across the whole ops project (backend + frontend): 0 errors.

This closes the actual gap in how support tickets arrive versus how the tool expected to be searched — arguably more load-bearing day to day than the payment-id search it replaces, since ops will rarely have a payment id on hand before they've already found the registration.
