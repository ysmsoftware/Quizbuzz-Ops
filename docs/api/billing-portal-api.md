# Billing Portal API Specification

The Billing Portal API covers everything outside ops that talks to ops about money:
- the checkout page at `/billing/checkout`;
- the main app's owner Billing page, through the main app's relay;
- the main app's "Talk to sales" form;
- a public Event Pass quote;
- the Razorpay webhook.

**Only the Razorpay webhook can mark online money as received.** Every other endpoint does one of three things: reads data, creates an order or mandate that still has to be paid, or acts on the org named in a signed token.

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## Base Path
`/api/v1/billing-portal`

---

## Tokens

Every endpoint except the webhook, the quote and the plan list takes a JWT. The main app signs it with `BILLING_HANDOFF_SECRET` and ops verifies it, so the secret must be the same on both apps. In production, ops refuses billing calls with `503 GATEWAY_NOT_CONFIGURED` if the secret is missing, shorter than 16 characters, or the published default.

| Token | Signed by | Life | Claims | Used by |
|---|---|---|---|---|
| Handoff | Main app `POST /onboarding/handoff` (owner only) | 10 min | `organizationId, adminId, adminEmail, adminName, planSlug` | `session`, `subscription/order`, `subscription/autodebit`, `subscription/schedule` |
| Billing account | Main app `/billing/*` relay (owner only) | 1 min | `organizationId, adminEmail, purpose: "billing_account"` | `account` |
| Lead | Main app `POST /onboarding/contact-sales` | 1 min | `organizationId, name, email, phone, organization, message, learners, source` | `leads` |

An invalid or expired token returns `401 UNAUTHENTICATED`.

## Trust model

| Endpoint | Caller | Can write |
|---|---|---|
| `GET /plans` | Anyone | nothing |
| `POST /event-pass/quote` | Anyone | nothing |
| `POST /session` | Checkout page | audit log only |
| `POST /subscription/order` | Checkout page | `OpsPayment` `CREATED` |
| `POST /subscription/verify` | Razorpay checkout callback in the browser | `OpsPayment` `CREATED → PENDING` only |
| `GET /subscription/status` | Checkout page (polling) | nothing |
| `POST /subscription/autodebit` | Checkout page | a Razorpay subscription waiting for authorisation |
| `POST /subscription/schedule` | Checkout page | a scheduled plan change (no money) |
| `POST /account` | Main app relay | owner actions on their own org: cancel, resume, stop auto-debit, keep plan, pay links |
| `POST /leads` | Main app | a `SalesLead` |
| `POST /razorpay/webhook` | **Razorpay only**, signed | payments `PAID` / `FAILED`, invoices settled, mandates, plan assignment |

---

## Endpoints

### 1. List plans on sale
`GET /api/v1/billing-portal/plans`

Lists public plans that are on sale: active, sellable and not private to one org, ordered by price.

**Response `data`:** an array of
`{ id, name, slug, description, currency, allowsMonthly, allowsHalfYearly, allowsAnnual, audience, monthlyPrice, halfYearlyPrice, annualPrice, maxContestsPerCycle, maxParticipantsPerContest, maxQuestionsPerContest, maxOrgMembers, maxLearners, maxCandidatesPerMonth, aiCreditsPerMonth, features: string[], featureFlags: { proctoring, certBranding, prioritySupport, analyticsExport, customDomain } }`

- Prices are in rupees, before GST. A `null` price means the plan doesn't offer that cycle.
- A `null` limit means unlimited.
- `audience` is `ORGANIZER`, `EDUCATION`, `BUSINESS` or `null`.

---

### 2. Verify checkout session
`POST /api/v1/billing-portal/session`

**Body:** `{ "token": "<handoff token>" }`

Checks the token and the plan, and returns what the checkout page shows. Two rules decide who can buy a plan:
- a private plan can only be bought by its own org;
- a plan that isn't on sale can only be bought by an org already on it.

Writes `billing_portal.checkout_started` to the audit log.

**Response `data`:**

```json
{
  "session": { "organizationId": "…", "organizationName": "ABC College", "organizationSlug": "abc", "adminId": "…", "adminEmail": "…", "adminName": "…" },
  "currentSubscription": {
    "planId": "…", "planName": "Pro 500", "billingCycle": "MONTHLY",
    "currentPeriodStart": "2026-11-08T00:00:00.000Z", "currentPeriodEnd": "2026-12-08T00:00:00.000Z",
    "lastPaidBaseAmount": 2999
  },
  "autoDebit": { "available": true, "firstChargeAt": "2026-12-08T00:00:00.000Z", "current": null },
  "change": { "scheduledCycles": ["MONTHLY"], "on": "2026-12-08T00:00:00.000Z", "currentPlanName": "Pro 500" },
  "plan": { "id": "…", "name": "Basic", "slug": "basic", "description": "…", "currency": "INR", "allowsMonthly": true, "allowsHalfYearly": true, "allowsAnnual": true, "monthlyPrice": 999, "halfYearlyPrice": 5499, "annualPrice": 9999, "features": ["…"] }
}
```

- `currentSubscription`: set only while the current subscription is ACTIVE and not yet expired. The page uses it for the proration estimate. `lastPaidBaseAmount` is the last amount actually paid, which is the most an upgrade can credit.
- `autoDebit.available`: the platform-wide flags `razorpay_gateway_active` and `auto_debit` are both on. `auto_debit` is on by default and has no per-organization setting.
- `autoDebit.firstChargeAt`: when the first automatic charge would happen. It is the end of the paid period if more than 15 minutes of a paid plan are left. If it is `null`, the charge happens at authorisation.
- `autoDebit.current`: set when the org already pays by auto-debit. Choosing auto-debit again then changes the payment method.
- `change.scheduledCycles`: the cycles for which this purchase would be a **downgrade**, or a shorter cycle on the same plan, and so takes effect only at `on`. For those cycles the page offers "Switch to X on date" (`/subscription/schedule`) instead of payment.

**Errors:** `400 VALIDATION_ERROR` (no token, bad payload) · `401` · `404 NOT_FOUND` (plan missing, inactive or not buyable by this org) · `503 GATEWAY_NOT_CONFIGURED`.

---

### 3. Create a one-time payment order
`POST /api/v1/billing-portal/subscription/order`

**Body:** `{ "token": "<handoff token>", "billingCycle": "MONTHLY" | "HALF_YEARLY" | "ANNUAL" }`

Creates an `OpsPayment` (status `CREATED`) and a Razorpay order. Ops works out the amount itself; nothing in the body sets it.

**Pricing:**
```
base  = plan price for the cycle − credit for unused time on the current plan (upgrades only)
gst   = round(base × 0.18, 2)
total = base + gst                      (no gateway-fee line)
```

- The credit for unused time is never more than the amount last paid.
- A retry reuses an open (`CREATED` or `PENDING`) order for the same plan and cycle (message: `Existing payment order reused.`), but only if its amount is still today's and it's under 30 minutes old. The credit for unused time shrinks daily, so an older open order is marked `FAILED` and a new one is made. A late payment on a closed order is still honoured: the webhook accepts any order that isn't already `PAID`.
- An 8-second lock per org, plan and cycle stops two orders being created at once.

**Response `data`:**

```json
{
  "paymentId": "01J…",
  "orderId": "order_…",
  "amount": 117882,
  "currency": "INR",
  "keyId": "rzp_live_…",
  "planName": "Pro 500",
  "pricing": { "baseAmount": 999, "gatewayFeeAmount": 0, "gstAmount": 179.82, "totalAmount": 1178.82, "creditApplied": 2000 },
  "billingCycle": "MONTHLY"
}
```
`amount` is in **paise**, for Razorpay checkout. `pricing` is in rupees.

**Errors:**

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | No token, bad `billingCycle`, or the plan doesn't offer that cycle |
| 401 | `UNAUTHENTICATED` | Bad token |
| 403 | `FEATURE_DISABLED` | `razorpay_gateway_active` off for this org |
| 404 | `NOT_FOUND` | Plan missing or not buyable by this org |
| 409 | `SCHEDULE_INSTEAD` | A downgrade or shorter cycle: nothing is charged now. `details.on` is the date. Use `/subscription/schedule` |
| 409 | `CREDIT_COVERS_PRICE` | The credit for unused time covers the whole price (under ₹1 to pay), e.g. yearly Basic to monthly Pro. Razorpay can't take it and a free switch isn't a checkout: the org should contact us |
| 409 | `ALREADY_SUBSCRIBED` | Already on this plan and cycle with paid time left |
| 429 | `CONFLICT` | Another order for this plan is being created right now |
| 502 | `GATEWAY_ERROR` | Razorpay refused or didn't answer |
| 503 | `GATEWAY_NOT_CONFIGURED` | No Razorpay keys, or no handoff secret |

If the org is on auto-debit, paying once stops the mandate when the payment lands, so the same period is never charged twice.

---

### 4. Verify payment signature
`POST /api/v1/billing-portal/subscription/verify`

**Body:** `{ "razorpayOrderId": "…", "razorpayPaymentId": "…", "razorpaySignature": "…" }`

Checks Razorpay's checkout signature: `HMAC_SHA256(orderId|paymentId, RAZORPAY_KEY_SECRET)`, compared timing-safe. If it's valid, the order moves from `CREATED` to `PENDING` so the page can show "confirming". **This never marks anything paid.** If the webhook has already updated the order, nothing changes and the call still succeeds.

**Response `data`:** `{ "verified": true }`
**Errors:** `400 VALIDATION_ERROR` · `400 INVALID_SIGNATURE` · `503 GATEWAY_NOT_CONFIGURED`.

---

### 5. Poll status
`GET /api/v1/billing-portal/subscription/status?paymentId=<id>`
`GET /api/v1/billing-portal/subscription/status?subscriptionId=<id>`

- **One-time order:** `{ "paymentId", "status": "CREATED" | "PENDING" | "PAID" | "FAILED", "paidAt" }`.
- **Auto-debit:** `{ "subscriptionId", "status" }`, using Razorpay's subscription status (`created`, `authenticated`, `active`, `pending`, `halted`, `cancelled`, `completed`…). Setup is done once it's `authenticated` or `active`.

**Errors:** `400` (neither parameter) · `404`.

---

### 6. Set up auto-debit
`POST /api/v1/billing-portal/subscription/autodebit`

**Body:** `{ "token": "<handoff token>", "billingCycle": "MONTHLY" | "HALF_YEARLY" }`

Creates a Razorpay subscription that the owner then authorises in Razorpay's checkout, by UPI AutoPay, card or eMandate. There is one Razorpay plan per combination of our plan, cycle and amount, so a price change creates a new one. A mandate runs for up to 5 years.

When the first charge happens:
- **No paid time left:** charged at authorisation.
- **Paid time left:** the first charge is on the current end date; nothing is charged today.
- **Already on auto-debit** (changing the payment method): the new mandate starts at the end date. The old one is cancelled once the new one is authorised.
- **Moving to a cheaper plan:** the mandate starts at the period end and shows as the scheduled change. Its first charge switches the plan.

**Response `data`:**
```json
{ "subscriptionId": "sub_…", "keyId": "rzp_live_…", "planName": "Pro 500", "amount": 3538.82, "firstChargeAt": "2026-12-08T00:00:00.000Z" }
```
`amount` is per charge, in rupees, including GST. The hourly job cancels mandates that haven't been authorised within 24 hours.

**Errors:** `400` (yearly isn't offered on auto-debit) · `401` · `403 FEATURE_DISABLED` (`auto_debit` or `razorpay_gateway_active` off) · `404` · `502 GATEWAY_ERROR` · `503`.

---

### 7. Schedule a downgrade
`POST /api/v1/billing-portal/subscription/schedule`

**Body:** `{ "token": "<handoff token>", "billingCycle": "MONTHLY" | "HALF_YEARLY" | "ANNUAL" }`

For a downgrade, or a shorter cycle on the same plan. Nothing is charged, and the change takes effect at the end of the current period. It's stored on the subscription as `scheduledPlanId` and `scheduledBillingCycle`, and the owner gets a `SUBSCRIPTION_CHANGE_SCHEDULED` email.

**Response `data`:** `{ "on": "2026-12-08T00:00:00.000Z" }`
**Errors:** `409 PAY_INSTEAD` (the change starts now: an upgrade, or no paid time left) · `400` · `401` · `404`.

**Timing rule** (`server/features/subscriptions/plan-timing.ts`):
- Plans are compared on their monthly rate.
- A higher rate starts now and is prorated.
- A lower rate, or the same plan on a shorter cycle, waits for the period end.
- With no paid time left (Free or lapsed), every change starts now.

---

### 8. Owner billing account
`POST /api/v1/billing-portal/account`

Only the main app's `/api/v1/billing/*` relay calls this, after checking the caller is the org's OWNER.

**Body:** `{ "token": "<billing account token>", "action"?: string, "invoiceId"?: string, "paymentId"?: string, "creditNoteId"?: string, "credits"?: number }`

| `action` | What it does | Returns |
|---|---|---|
| *(none)* | Nothing | Billing summary |
| `cancel` | Cancels a self-serve plan at the end of the period and stops auto-debit. Sends the `SUBSCRIPTION_CANCELLED` email | Summary |
| `resume` | Undoes a cancel; the status goes back to what the dates say. Does **not** restart auto-debit | Summary |
| `stop_autodebit` | Cancels the mandate at Razorpay immediately | Summary |
| `cancel_scheduled_change` | Drops a pending downgrade | Summary |
| `buy_ai_credits` | Issues an invoice for an AI credit pack (`credits` is 500, 2000 or 10000) | `{ url }`, the pay link |
| `pay` | Reuses the invoice's live pay link, or creates one. An overdue invoice always gets a new link, valid for 7 days; its due date doesn't change | `{ url }` |
| `pdf` | Invoice PDF (`invoiceId`) | `application/pdf` |
| `receipt` | Receipt PDF (`invoiceId`, `paymentId`) | `application/pdf` |
| `credit_note` | Credit note PDF (`creditNoteId`) | `application/pdf` |

Every lookup is limited to the org in the token. The summary's fields are described in §1 of the main app's `backend/docs/billing_api.md`.

**Errors:** `401` · `404 NOT_FOUND` · `409 CONFLICT` (account-managed plan; invoice paid by bank transfer; online payment unavailable) · `403 FEATURE_DISABLED` (`ai_top_ups` off) · `400` (not a credit pack).

---

### 9. Record a sales lead
`POST /api/v1/billing-portal/leads`

**Body:** `{ "token": "<lead token>" }`

Creates a `SalesLead` with status `NEW`, shown on the ops Leads page.

**Response `data`:** `{ "id": "…" }`
**Errors:** `400 VALIDATION_ERROR` · `401` · `503 GATEWAY_NOT_CONFIGURED`.

---

### 10. Event Pass quote (public)
`POST /api/v1/billing-portal/event-pass/quote`

Uses the same formula that ops bookings charge (`lib/pricing/event-pass.ts`), so a landing-page calculator shows real prices. No auth.

**Body:**

| Field | Type | Notes |
|---|---|---|
| `participants` | int, 1–1,000,000 | required |
| `extraContests` | int, 0–5 | +25% of the base price each |
| `aiQuestionsHundreds` | int, 0–100 | AI questions, priced per 100 |
| `whatsapp` | boolean | priced per participant |
| `engineer` | boolean | an engineer on the day |
| `entryFee` | number or null | if set, the revenue-share alternative is also returned |

**Response `data`** (real output for `{ "participants": 1000, "entryFee": 100 }`):
```json
{
  "participants": 1000, "basePrice": 8999, "extraContestsPrice": 0, "aiQuestionsPrice": 0, "whatsappPrice": 0, "engineerPrice": 0,
  "price": 8999, "gst": 1619.82, "total": 10618.82, "perHead": 9,
  "talkToUs": false, "soloIsCheaper": false,
  "revenueShare": { "percent": 15, "netPerRegistration": 97.64, "sharePerRegistration": 14.65, "payoutPerRegistration": 82.99, "estimatedShare": 14646, "breakEvenRegistrations": 615 }
}
```
- `price` is before GST. It's interpolated between the tier sheet's participant anchors and rounded up to the next price ending in 99.
- `talkToUs`: over 25,000 participants, we quote by hand.
- `revenueShare`: `null` without an `entryFee`. Our share is 15% of the net fee (after the gateway fee and its GST), at least ₹5 per registration. `estimatedShare` assumes every participant registers. Above `breakEvenRegistrations`, paying upfront is cheaper for the customer. Revenue-share bookings themselves are on hold.

**Errors:** `400 VALIDATION_ERROR`.

---

### 11. Razorpay webhook
`POST /api/v1/billing-portal/razorpay/webhook`

Called server to server, by Razorpay only. This is the only place that decides whether online money arrived.

- **Signature:** the `x-razorpay-signature` header holds an HMAC-SHA256 of the raw body, keyed with `RAZORPAY_WEBHOOK_SECRET` (never `RAZORPAY_KEY_SECRET`) and compared timing-safe. A missing secret returns `503`; a missing or wrong signature returns `400`.
- **Each event runs once:** events are stored by `x-razorpay-event-id` in `RazorpayWebhookEvent`. An event that was already processed is acknowledged and skipped. A failed attempt stays unprocessed, so Razorpay's retry runs it again.
- **Payments that aren't ours** get `200`, never `400`. That covers another app on the same Razorpay account, and auto-debit charges, which have no order of ours. A `400` would make Razorpay retry and then disable the webhook after a day.

| Event | Effect |
|---|---|
| `payment.captured` (our order) | The amount is checked against the order; a mismatch is logged and the payment isn't marked paid. Otherwise the payment becomes `PAID`, a tax invoice and receipt are issued and emailed, and the plan is assigned from the order's `planId` and cycle, never from the request. If an earlier delivery stopped halfway, this one finishes the work |
| `payment.failed` (our order) | Payment becomes `FAILED` |
| `payment.failed` (an auto-debit charge) | Matched to its subscription through Razorpay's invoice. Records the failure reason in our own wording and sets the status to Past due. Emails the owner on the first failure |
| `payment_link.paid`, `payment_link.partially_paid` | Settles the linked invoice in full or in part, issues the receipt, and applies its access and any AI credits |
| `payment_link.expired`, `payment_link.cancelled` | Updates the invoice's link status |
| `subscription.*` (`authenticated`, `activated`, `charged`, `pending`, `halted`, `cancelled`, `completed`, `paused`, `resumed`, `updated`) | Re-reads the subscription from Razorpay, because events can arrive out of order, and applies its state. **`charged`**: records a PAID payment (`RAZORPAY_SUBSCRIPTION`) that extends the period from the old end date, with an invoice, a receipt and emails, and applies a scheduled plan if the charge is for it. **`halted`**: emails the owner that retries have stopped. **`cancelled`** from the bank or UPI app: moves the org back to paying online |
| anything else | `200`, ignored |

**Razorpay dashboard:** enable all the events above for this URL.

The hourly job also re-reads every live mandate and records any charge whose webhook was missed. An older charge never moves dates back.

---

## Data model notes

- `OpsPayment`:
  - Amount fields: `baseAmount`, `gstAmount`, `amount` (the total) and `creditApplied`.
  - What was bought: `billingCycle`, `periodMonths` and `planId`.
  - Links and documents: `invoiceId` and `receiptNumber`, plus refund and void fields.
  - `source`: `RAZORPAY_ORDER`, `RAZORPAY_LINK`, `RAZORPAY_SUBSCRIPTION`, `BANK_TRANSFER`, `CHEQUE`, `UPI_DIRECT` or `OTHER`.
  - Status goes `CREATED → PENDING → PAID`, or `FAILED`; a refunded payment later shows `REFUNDED`. For Razorpay money, only the webhook sets `PAID` or `FAILED`.
- `RazorpaySubscription`: one row per mandate. It stores the Razorpay id, plan, cycle, amount, `paymentMethod` (`card`, `upi` or `emandate`), status, `startAt` and `currentEnd`. `OrganizationSubscription.razorpaySubscriptionId` points to the live one.
- `OrganizationSubscription`:
  - `collectionMethod`: `AUTO_DEBIT`, `PAY_ONLINE`, `OFFLINE` or `COMPLIMENTARY`.
  - The period and `graceDays`, the contract fields, and `lastPaymentError`.
  - The scheduled change: `scheduledPlanId`, `scheduledBillingCycle`, `scheduledReason` and `scheduledById`.
- Ops stores amounts in rupees (`Decimal`). Paise are used only at the Razorpay boundary.
