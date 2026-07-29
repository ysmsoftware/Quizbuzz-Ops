# Billing Portal — Audit & Implementation Plan

Status: **Audit complete. No code has been changed.** Every finding below was confirmed by reading the actual file, not inferred. This is a plan for you to review — implementation starts only after you approve it.

Scope: the flow that starts when an org admin clicks "Select Plan" / "Pay" in the main app, hands off to `app/billing/checkout/page.tsx` in this ops dashboard, and ends with a subscription being activated. Covers: `app/billing/checkout/page.tsx`, `app/api/v1/billing-portal/*`, `server/features/subscriptions/*`, `server/features/billing/*`, and the relevant Prisma models.

---

## 0. Headline finding, stated plainly

The webhook is **not** currently the single source of truth. The checkout page's own browser JavaScript calls the exact same endpoint Razorpay is supposed to call, using a JSON field instead of the real HTTP header Razorpay signs, and that endpoint accepts it. Right now, in production, with `RAZORPAY_WEBHOOK_SECRET` unset (which is its default state — see §1.5), anyone with browser dev tools and a valid organization JWT handoff token could call this endpoint directly and activate any plan for free, without ever touching Razorpay. This is the most important thing in this document — everything else is real, but this is the one I'd fix before anything ships publicly.

I've ranked every finding by severity so you can see what's cosmetic vs. what's a live money hole.

---

## 1. Findings

### 1.1 CRITICAL — Client can self-authorize "PAID" with no real verification

**File**: `app/api/v1/billing-portal/razorpay/webhook/route.ts` (lines 20–34, 54–66), called from `app/billing/checkout/page.tsx` (lines 106–127, the `handler` callback).

**Current behavior**: This single route is designed to serve two completely different trust levels:
1. A genuine Razorpay-initiated webhook (server-to-server, signs the raw body, sends `x-razorpay-signature` header).
2. The checkout page's own browser code, which calls the *same URL* after the Razorpay checkout.js `handler` fires, sending `{ action: 'capture', razorpayOrderId, razorpayPaymentId, razorpaySignature, planSlug, ... }` as a JSON body field — not a header.

The route's signature check is:
```ts
const signature = req.headers.get('x-razorpay-signature');
if (webhookSecret && signature) {
  // verify...
}
```
Since the browser call never sets the `x-razorpay-signature` header (it puts `razorpaySignature` in the JSON body instead, which the route never reads for verification — only stores it), `signature` is `null` for every client-initiated call. `webhookSecret && signature` is therefore always false, and verification is silently skipped. The route then finds the `OpsPayment` by `razorpayOrderId` and sets `status: 'PAID'` unconditionally — no check that the amount matches, no check that a real payment ever happened.

**Root cause**: conflating "the thing Razorpay calls" and "the thing our own frontend calls" into one endpoint, and treating the JSON body as trustworthy on both paths.

**Fix**: split into three endpoints with three different trust levels (full design in §3). The genuine webhook becomes the only writer of `PAID`, full stop — no `action` field, no body-supplied "capture" trust.

**Outcome**: a browser can no longer mark itself paid. The only way `status` becomes `PAID` is a signed callback that actually originated from Razorpay's servers.

---

### 1.2 CRITICAL — Hardcoded fallback secret for the checkout handoff token

**Files**: `app/api/v1/billing-portal/session/route.ts:21`, `app/api/v1/billing-portal/subscription/order/route.ts:21`, `server/config/env.ts:18`.

**Current behavior**: all three places resolve the JWT secret used to verify the main-app-to-ops handoff token the same way:
```ts
const secret = process.env.BILLING_HANDOFF_SECRET || env.BILLING_HANDOFF_SECRET || 'billing_handoff_secret_shared_key_998877';
```
`env.ts` itself *also* defaults `BILLING_HANDOFF_SECRET` to that exact literal string if the env var isn't set. So if this variable is ever missing in production — which is easy to miss since nothing fails loudly, the app just boots fine — anyone who knows (or finds, since it's sitting in this repo's `env.ts`) that literal string can mint their own valid handoff JWT for any `organizationId` and `planSlug`, land directly on `/billing/checkout`, and walk through checkout as if the main app had legitimately sent them.

**Root cause**: a `.default()` value on a secret that should have no default. This is the same category of issue as the seeded super-admin password removed in the last cleanup pass — a real, working credential baked into source.

**Fix**: remove the literal fallback entirely everywhere it appears. `env.ts` should require `BILLING_HANDOFF_SECRET` with no default (same pattern already used for `OPS_JWT_ACCESS_SECRET`'s intent, even though that one currently also has a default — worth revisiting together, but at minimum this one should fail fast in production if unset, consistent with `parseEnv()`'s existing "throw in production if invalid" behavior).

**Outcome**: an unset or misconfigured secret becomes a boot-time error instead of a silent, exploitable default.

---

### 1.3 HIGH — Live "test mode" fake-payment path in production code

**File**: `app/billing/checkout/page.tsx:148–166`.

**Current behavior**:
```ts
if (typeof window !== 'undefined' && window.Razorpay && keyId && !keyId.includes('stubKey')) {
  // real Razorpay flow
} else {
  // "Fallback for test environment without active live Razorpay Key"
  setTimeout(async () => {
    await fetch('/api/v1/billing-portal/razorpay/webhook', { ...action: 'capture'... });
    window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`;
  }, 1200);
}
```
This branch isn't gated by `NODE_ENV`. It triggers purely based on whether `RAZORPAY_KEY_ID` happens to be unset or contains the word "stub" — which is exactly what happens if the env var is simply missing in a real deployment. In that state, clicking "Pay" auto-completes a full fake subscription purchase after a 1.2s delay, no card, no Razorpay involved at all.

**Root cause**: same demo-shortcut pattern flagged and removed from the login page last time, just relocated to the payment flow, where the stakes are financial rather than authentication.

**Fix**: remove this branch from the component entirely, or if a genuine local test mode is still wanted, gate it explicitly behind `process.env.NODE_ENV !== 'production'`, matching the convention already established for the OTP dev-console-log fallback in `platform-auth.service.ts`.

**Outcome**: a misconfigured production deployment fails loudly (Razorpay checkout won't open, clear error) instead of silently granting free subscriptions.

---

### 1.4 HIGH — No GST/gateway-fee calculation anywhere; displayed tax is hardcoded

**Files**: `app/billing/checkout/page.tsx:292` (`<span>₹0.00</span>` for "Tax (GST)"), `app/api/v1/billing-portal/subscription/order/route.ts:45` (`const amountInPaise = Math.round(Number(plan.price) * 100);`).

**Current behavior**: the amount actually charged via Razorpay is exactly `plan.price` — no fee, no tax. The displayed breakdown matches (both wrong in the same way, so at least they're consistent with each other). There is no calculation function for gateway fee or GST anywhere in the codebase.

**Fix**: see §2 for the exact formula and §3/§4 for where it plugs in. The same computed total must be used for both the Razorpay `amount` sent to the order-creation call and the number shown on screen — right now those two are trivially consistent because both are just the raw price; once a breakdown exists, it's important they stay derived from one shared function rather than calculated twice in two places that could drift.

**Outcome**: what the org is shown and what Razorpay actually charges are always the same number, and that number matches the formula you specified.

---

### 1.5 HIGH — Subscription period is hardcoded to 30 days regardless of billing cycle

**File**: `server/features/subscriptions/subscriptions.service.ts:97–113` (`assignPlan`):
```ts
async assignPlan(orgId: string, planId: string, actor: AuditActor, periodStart?: Date, periodEnd?: Date) {
  ...
  const start = periodStart || now;
  const end = periodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  ...
}
```
`periodStart`/`periodEnd` are optional parameters. The only caller in the payment flow — the webhook handler at `app/api/v1/billing-portal/razorpay/webhook/route.ts:93-97` — calls `assignPlan(opsPayment.organizationId, planToAssign.id, actor)` with **no** period arguments. So every subscription created through checkout today gets exactly a 30-day period, even if the plan being purchased is `billingCycle: ANNUAL`.

I confirmed this is already visibly inconsistent in the admin UI: `components/views/organization-subscription/CurrentPlanCard.tsx:48` renders `{currentPlan?.billingCycle === 'annual' ? 'year' : 'month'}` next to the price — so an annual plan's card would say "/ year" while the actual `currentPeriodEnd` shown three lines below it is only 30 days out. Two pieces of the same card already disagree with each other.

**Root cause**: `assignPlan()` was written generically (for admin-assigned plans, where a period might reasonably default to 30 days as a placeholder) and the payment webhook never overrides that default with the cycle actually purchased — because nothing upstream computes or passes it.

**Fix**: covered in §4 — thread the actually-purchased billing cycle through order creation → `OpsPayment` → the webhook → `assignPlan()`, and compute the real period length (1 month or 12 months) from it instead of a fixed constant.

**Outcome**: `currentPeriodEnd` reflects what was actually paid for, and the admin-facing plan card stops contradicting itself.

---

### 1.6 MEDIUM — No record of what cycle was purchased, or what the price breakdown was, anywhere

**Files**: `prisma/schema.prisma` — `OpsPayment` (line 289), `OrganizationSubscription` (line 166).

**Current behavior**: `OpsPayment.amount` is a single flat `Decimal`. There's no `gatewayFeeAmount`, `gstAmount`, or `baseAmount` column — once a payment happens, there's no stored breakdown to look back at, only the final total. `OrganizationSubscription` has no `billingCycle` or `periodMonths` field of its own; it only has `planId`, so "what cycle did this org actually buy" can only ever be inferred (incorrectly, per §1.5) from the current subscription's dates, or from the plan's own static `billingCycle`, which can change over time independent of what a given org actually paid for historically.

**Fix**: add columns to both models — see §4.

**Outcome**: every payment is a complete, self-contained receipt; every subscription row records the cycle it was actually purchased under, independent of later plan edits.

---

### 1.7 MEDIUM — Plan tier and billing cycle are the same field, not independently selectable

**File**: `prisma/schema.prisma:143` — `SubscriptionPlan.billingCycle BillingCycle @default(MONTHLY)`.

**Current behavior**: billing cycle is a property of the *plan row itself*, not something chosen at checkout. Today, "Growth" is either a monthly plan or an annual plan — never both — because there's exactly one `billingCycle` value per plan. Your requirement ("if they select monthly or yearly, regardless of what plan they select") implies cycle should be an independent choice layered on top of whichever tier they picked, which the current schema can't express without literally duplicating every plan row into a "-Monthly" and "-Annual" pair (workable, but brittle — every plan edit has to be made twice and kept in sync).

**Fix**: see §4 — treat `SubscriptionPlan.price` as the canonical **monthly** price for every plan, and pass `billingCycle` as an explicit parameter through the handoff/order flow rather than baking it into which plan row was selected. Annual price is always computed as `monthlyPrice × 12` plus the same fee/GST formula, never stored as a separate plan.

**Outcome**: one plan definition per tier; cycle is a checkout-time choice, matching what you described.

---

### 1.8 MEDIUM — Webhook processing isn't idempotent

**File**: `app/api/v1/billing-portal/razorpay/webhook/route.ts:69–77`.

**Current behavior**: the update that sets `status: 'PAID'` has no guard — it's an unconditional `prisma.opsPayment.update(...)`. If the same webhook event is delivered twice (Razorpay does retry on non-2xx or timeout), or if both a genuine webhook and a client call land for the same order, the handler re-runs `subscriptionsService.assignPlan(...)` a second time — which, given §1.5, would reset `currentPeriodStart`/`currentPeriodEnd` to "now + 30 days" again, silently shortening or resetting an org's subscription period, and writes a duplicate `billing_portal.payment_succeeded` audit entry.

**Reference pattern** (from the main app, `Quizbuzz-new/backend/src/modules/payment/payment.repository.ts`): its `markSuccess` scopes the `UPDATE` to `WHERE razorpayOrderId = $1 AND status != 'SUCCESS'`. A second delivery matches zero rows, Prisma throws `P2025` (record not found for the conditional update), and that's caught and treated as "a concurrent delivery already won" — a no-op, not an error, and side effects (here: `assignPlan`, audit log) only ever fire once.

**Fix**: adopt the same guarded-update pattern here.

**Outcome**: redelivery-safe; a subscription's period is only ever set once per successful payment, not reset on every retry.

---

### 1.9 MEDIUM — No idempotency on order creation

**File**: `app/api/v1/billing-portal/subscription/order/route.ts` (whole file).

**Current behavior**: every call creates a brand-new Razorpay order and a brand-new `OpsPayment` row with `status: 'PENDING'`. If the org admin double-clicks "Pay", or opens the checkout page in two tabs, or the network hiccups and the frontend retries, you get multiple live Razorpay orders and multiple `PENDING` `OpsPayment` rows for the same org+plan, with no relationship between them.

**Reference pattern**: the main app's `payment.service.ts` looks up any existing payment for that participant before creating a new Razorpay order — reuses an existing non-`FAILED` order with a `razorpayOrderId` instead of creating a duplicate, and only mints a fresh one if none exists or the prior attempt failed. It also has a Redis-backed `Idempotency-Key` header middleware as a second layer.

**Fix**: before creating a new Razorpay order, look up an existing non-terminal (`PENDING`/`CREATED`, not `FAILED`/`REFUNDED`) `OpsPayment` for this organization+plan+purpose and reuse it. The header-based middleware is a nice-to-have on top, not required for correctness at this traffic volume.

**Outcome**: no orphaned duplicate orders; retried clicks are safe.

---

### 1.10 MEDIUM — A failed "notify" call still redirects to the success page

**File**: `app/billing/checkout/page.tsx:106–127`:
```ts
handler: async function (response: any) {
  try {
    await fetch('/api/v1/billing-portal/razorpay/webhook', { ...action: 'capture'... });
    window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`;
  } catch (err) {
    console.error('Webhook notification error:', err);
    window.location.href = `${mainAppUrl}/org/settings?tab=billing&subscription=success`; // same redirect!
  }
},
```
Both the success path and the error path of this try/catch redirect to the exact same "success" URL. If the fetch call itself fails (network blip, 500, timeout), the org admin still gets bounced back to the main app with `subscription=success` in the URL, even though nothing was recorded. Once §1.1/§3 replace this with a real verify-then-poll flow, this class of bug goes away structurally (the redirect only fires once a poll confirms `PAID`), but it's worth naming explicitly since it's a real, reproducible bug today independent of the security fix.

**Outcome of the redesign**: a failed confirmation attempt can no longer present itself to the user as a successful purchase.

---

### 1.11 LOW — HMAC comparison isn't timing-safe

**File**: `app/api/v1/billing-portal/razorpay/webhook/route.ts:30` — `if (expectedSignature !== signature)`.

Plain string comparison instead of `crypto.timingSafeEqual`. Same gap exists in the main app's webhook verifier (confirmed during the reference audit — flagged there too), but the main app's *client-facing* payment-signature check does use `timingSafeEqual` correctly, which is the pattern to copy: length-check first (`timingSafeEqual` throws on mismatched buffer lengths), then compare.

**Outcome**: closes a low-real-world-risk but easy-to-fix timing side channel, and brings both signature checks (webhook + client payment signature, once added — see §3) to the same standard.

---

### 1.12 LOW — Webhook secret silently falls back to the API key secret

**File**: `app/api/v1/billing-portal/razorpay/webhook/route.ts:20` — `const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';`.

Razorpay signs webhooks with a secret you configure specifically for that webhook endpoint in their dashboard — it is not the same value as your API key secret. Falling back to `RAZORPAY_KEY_SECRET` when `RAZORPAY_WEBHOOK_SECRET` is unset doesn't actually let genuine webhooks verify (Razorpay never signed with that value), it just makes the "is a secret configured" check pass, which paradoxically makes §1.1's bypass harder to notice in a code review — the endpoint *looks* protected because `webhookSecret` is truthy. Real Razorpay-sent webhooks would fail verification and get `400`-rejected in this state, while the unauthenticated client-called path (no header at all) sails through regardless, per §1.1.

**Fix**: require `RAZORPAY_WEBHOOK_SECRET` specifically, no fallback; fail closed (reject the request) if it's unset, rather than silently accepting unverified payloads.

---

### 1.13 DESIGN — Checkout page doesn't use the app's design system at all

**File**: `app/billing/checkout/page.tsx` (whole file) vs. `app/globals.css` (the actual theme).

**Current behavior**: every class in the checkout page is a hardcoded Tailwind slate/indigo value — `bg-slate-950`, `text-slate-100`, `bg-indigo-600`, `border-slate-800`, etc. — and the Razorpay checkout widget itself is themed with a hardcoded hex, `theme: { color: '#6366f1' }` (indigo). None of it references the CSS variables the rest of the app is built on: `--background` (warm off-white / warm-dark, not slate), `--primary` (teal, `oklch(0.55 0.15 180)`), `--accent` (warm amber), `--card`, `--border`, or the `Geist`/`Geist Mono` font pair declared in `globals.css`. It also completely ignores the app's light/dark `ThemeToggle` system — it's permanently dark-slate regardless of the admin's or org's theme preference.

Compare to any real screen in this app, e.g. `ContestCalculatorView.tsx`'s estimate card: `bg-card`, `border-border/50`, `text-foreground`, `text-amber-500`/`text-primary` for emphasis, `font-sans` — all theme-token-driven. The checkout page is visually a completely different, unrelated product today.

**Fix**: full redesign spec in §5, rebuilding the page on the same token classes and layout patterns already established (specifically the breakdown-card pattern from the Contest Calculator, since that's the closest existing "line-item price breakdown + total + CTA" component in this app).

**Outcome**: the checkout page an org admin lands on to pay real money looks like it belongs to the same product as the rest of the dashboard, instead of a generic third-party-looking dark checkout template.

---

## 2. GST + gateway-fee formula

As specified: gateway fee is 2% of the base amount; GST is 18% of the *gateway fee*, not of the base amount.

```
gatewayFee = round(baseAmount × 0.02, 2)
gst        = round(gatewayFee × 0.18, 2)
total      = baseAmount + gatewayFee + gst
```

Worked example on ₹100:
```
baseAmount = 100.00
gatewayFee = 100.00 × 0.02 = 2.00
gst        = 2.00 × 0.18   = 0.36
total      = 100.00 + 2.00 + 0.36 = 102.36
```
Matches your "hundred and two something" check.

**Annual** billing cycle: `baseAmount` becomes `monthlyPrice × 12` first, then the same formula applies on top of that annual base (fee and GST scale with the full upfront amount, not per-month).

Example on a ₹999/month plan, annual:
```
baseAmount = 999.00 × 12 = 11,988.00
gatewayFee = 11,988.00 × 0.02 = 239.76
gst        = 239.76 × 0.18    = 43.16 (rounded)
total      = 11,988.00 + 239.76 + 43.16 = 12,270.92
```

This should live as one small, pure, dependency-free function — e.g. `lib/pricing/subscriptionPricing.ts` — exactly the same shape as `calculateBookingEstimate()` in the Contest Calculator work, and imported by both the order-creation route (to compute the real Razorpay `amount`) and the checkout page (to render the identical breakdown). One function, two callers, so display and charge can never drift apart.

---

## 3. Payment integrity redesign — webhook as sole source of truth

Modeled directly on the main app's pattern (full detail in the reference audit your agent ran — see the appendix note at the end of this doc), adapted to this app's simpler needs (no BullMQ queue involved here, no participant-facing retry UI needed yet).

**New `OpsPaymentStatus` value**: add `CREATED` ahead of `PENDING`, matching the main app's `CREATED → PENDING → SUCCESS/FAILED` progression. Today's enum (`PENDING/PAID/FAILED/REFUNDED`) skips straight to `PENDING` at order-creation time, which conflates "order just created, nothing has happened yet" with "user finished the browser checkout step" — two meaningfully different moments worth being able to tell apart in the admin UI and in reconciliation.

**Three endpoints, three trust levels, replacing today's one overloaded route:**

1. **`POST /api/v1/billing-portal/subscription/order`** (creation — this one already exists, gets hardened per §1.9): creates the `OpsPayment` row as `CREATED`, checks for and reuses an existing non-terminal order first. Returns `orderId`, `amount` (computed via §2's formula), `keyId`.

2. **`POST /api/v1/billing-portal/razorpay/webhook`** (Razorpay-only, hardened per §1.1/§1.2/§1.11/§1.12): requires a valid `x-razorpay-signature` header verified against `RAZORPAY_WEBHOOK_SECRET` with `crypto.timingSafeEqual`, no fallback, reject (400) if the header or a configured secret is missing — never silently skip verification. This is the **only** code path permitted to write `status: 'PAID'` or `status: 'FAILED'` from webhook-confirmed events (`payment.captured`, `payment.failed`), guarded by the idempotent `WHERE status NOT IN ('PAID')` update pattern from §1.8. On success, this is also where `assignPlan()` gets called with the real computed period (§4) and where `OpsPayment` gets its `subscriptionId` backfilled so the payment and the subscription it created are linked.

3. **`POST /api/v1/billing-portal/subscription/verify`** (new — client-called, replaces the client's current fake "capture" call): called from checkout.js's `handler` success callback with `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }`. Verifies the **payment signature** (not the webhook signature — this is the other Razorpay HMAC, `HMAC-SHA256(orderId + "|" + paymentId, keySecret)`, compared with `timingSafeEqual`, exactly the main app's correct client-facing pattern). If valid, this endpoint is allowed to move `CREATED → PENDING` only — never `→ PAID`. This is purely "the browser confirms the checkout.js flow completed" as a UX signal; the webhook remains the only authority on whether money actually moved.

4. **`GET /api/v1/billing-portal/subscription/status?paymentId=...`** (new — read-only): returns the current `OpsPayment.status`. This is what the frontend polls.

**Frontend flow rewrite** (`app/billing/checkout/page.tsx`):
- `handler` (checkout.js success): call `verify` (endpoint 3), then start polling `status` (endpoint 4) — e.g. every 2.5s for up to 90s, mirroring the main app's `usePayment.ts` loop exactly. Only redirect to the main app's success URL once a poll returns `PAID`. On timeout, redirect to a neutral "we're still confirming your payment — check back in a few minutes" state, not a success or failure claim.
- `ondismiss` (modal closed without paying): do **not** call any endpoint that changes payment status. The order simply stays `CREATED`/`PENDING`; a lightweight periodic cleanup (or just leaving it — Razorpay orders expire on their own after a window) handles abandonment. This removes the current client-triggered `action: 'fail'` call, which has the same "client claims the outcome" problem as the capture path, just lower stakes.
- Remove the test-mode simulated-payment branch (§1.3) or gate it to non-production.

---

## 4. Billing-cycle & pricing-breakdown data model changes

**`SubscriptionPlan`**: no schema change needed. `price` becomes documented/treated as the canonical *monthly* price for every plan (already effectively true for `MONTHLY` plans; for existing `ANNUAL`-flagged plans, this needs a one-time data decision — see open question in §6).

**`OrganizationSubscription`** — add:
- `billingCycle BillingCycle` — the cycle actually purchased for the *current* period, independent of whatever `SubscriptionPlan.billingCycle` says today.
- `periodMonths Int` — `1` or `12` (kept explicit rather than re-derived from dates, so a UI can show "Yearly" without doing date math).

**`OpsPayment`** — add:
- `baseAmount Decimal`
- `gatewayFeeAmount Decimal`
- `gstAmount Decimal`
- `billingCycle BillingCycle`
- `periodMonths Int`

(`amount` stays as the grand total, now always equal to `baseAmount + gatewayFeeAmount + gstAmount`.)

**`assignPlan()`** (`subscriptions.service.ts`) — stop defaulting `periodEnd` to a fixed 30 days; compute it from the passed `periodMonths` (`addMonths(start, periodMonths)`), and require the webhook handler to pass the real values it now has on the `OpsPayment` row instead of relying on the function's fallback.

**`CurrentPlanCard.tsx`** and the org detail subscription tab — read cycle/dates from the *subscription's own* `billingCycle`/`periodMonths`/dates (now accurate per above) instead of the plan's static `billingCycle`, and add a link/expand to the underlying `OpsPayment` receipt (base/fee/GST/total) so an ops admin can see exactly what an org paid, not just what plan they're on.

---

## 5. UI/UX redesign spec for the checkout page

Rebuilt on the app's actual tokens instead of hardcoded slate/indigo:
- Background/surfaces: `bg-background`, `bg-card`, `border-border/50` — respects light/dark via the existing `ThemeToggle` system rather than being permanently dark.
- Emphasis/brand color: `text-primary` (teal) for primary actions and highlights, replacing indigo throughout, including the Razorpay widget's `theme.color` (pull from the CSS variable's resolved hex, or hardcode the equivalent teal hex to match).
- Typography: `font-sans` (Geist), matching every other screen — the checkout page currently doesn't reference the font at all and falls back to the browser default sans stack.
- Layout pattern: reuse the "line-item breakdown card" shape already established in `ContestCalculatorView.tsx` — header badge, itemized rows (`Subscription (monthly/annual)`, `Payment gateway fee (2%)`, `GST on gateway fee (18%)`, divider, `Total`), instead of the current flat two-row breakdown with a hardcoded ₹0.00 tax line.
- New: an explicit billing-cycle indicator — if cycle selection happens upstream in the main app (passed through the handoff token), display it clearly ("Billing: Monthly" / "Billing: Annual — 12 months charged upfront, no auto-renewal"); if cycle selection instead happens on this page (see open question in §6), add a simple two-option toggle that recalculates the breakdown live using the §2 formula.
- Explicit "no auto-renewal" messaging near the total, since that's a real behavior difference from what users may expect from a subscription checkout, and worth stating plainly rather than leaving implicit.

---

## 6. Open questions before implementation

1. **Where does monthly-vs-annual get chosen** — in the main app (as part of "Select Plan", passed through the JWT handoff payload as an extra `billingCycle` claim) or on this checkout page itself (a toggle here, independent of what the main app sent)? This changes what the handoff token's payload needs to carry and whether the main app needs a small change too. I'd lean toward "chosen in the main app, carried through the token" since that's this app's existing pattern for `planSlug`, but it's your call.
2. **Existing `ANNUAL`-flagged plan rows** — once cycle becomes a checkout-time choice layered on top of a single canonical monthly price (§1.7), do today's dedicated annual plan rows get archived/merged, or kept as-is for now and only new plans follow the new model? Affects whether this needs a one-time data migration on `subscription_plans`.
3. **Abandoned `CREATED`/`PENDING` orders** — the main app doesn't have automatic cleanup for these either (confirmed gap in the reference audit), only a manual cancel endpoint. Worth a lightweight scheduled sweep here, or is "they just sit there, unused" acceptable at this scale? I'd suggest starting without one (matches the reference) and adding it only if it becomes a real annoyance in the admin's bookings/payments list.

---

## 7. Suggested phased order

You asked me to concentrate on design first within this plan, and I have (§5 is fully specified). But for the actual build sequence, I'd recommend security before visuals — shipping a nicer-looking checkout page on top of a forgeable handoff secret and a self-authorizing webhook endpoint just makes the hole more presentable, not smaller.

- **Phase A — close the money hole** (§1.1, §1.2, §1.3, §1.11, §1.12): remove the hardcoded handoff secret fallback, remove/gate the fake test-payment branch, lock the webhook to signature-required-no-bypass with timing-safe comparison and its own dedicated secret.
- **Phase B — payment integrity redesign** (§3): add `CREATED` status, split into the three endpoints, rewrite the frontend's verify-then-poll flow, add webhook idempotency (§1.8) and order-creation idempotency (§1.9).
- **Phase C — pricing & duration model** (§2, §4): shared GST/fee calculation function, schema additions, fix `assignPlan()`'s hardcoded period, decouple cycle from plan tier.
- **Phase D — UI/UX rebuild** (§5): checkout page on real design tokens, full breakdown card, cycle indicator/toggle, admin-facing `CurrentPlanCard` accuracy fix.
- **Phase E — docs**: `docs/api/billing-portal-api.md` documenting the redesigned endpoints, matching the existing `docs/api/*.md` convention (`payouts-api.md`, `organizations-api.md`, etc.).

Nothing in this plan has been implemented. Let me know which phases to proceed with, or if you want any of the open questions in §6 resolved differently first.
