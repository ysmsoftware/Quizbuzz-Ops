# Billing Portal API Specification

The Billing Portal API domain powers the standalone checkout flow at `/billing/checkout` — the handoff destination when an org admin clicks "Select Plan" / "Pay" in the main app. It resolves a signed handoff token into a checkout session, creates a Razorpay order, and confirms payment. **The Razorpay webhook is the only endpoint permitted to mark a payment `PAID`** — every other endpoint in this domain is either read-only or limited to the `CREATED → PENDING` transition.

---

## Base Path
`/api/v1/billing-portal`

---

## Trust model

| Endpoint | Caller | Can write |
|---|---|---|
| `POST /session` | Browser (checkout page load) | audit log only |
| `POST /subscription/order` | Browser (checkout page) | `OpsPayment` status `CREATED` |
| `POST /subscription/verify` | Browser (Razorpay `handler` callback) | `OpsPayment` status `CREATED → PENDING` only |
| `GET /subscription/status` | Browser (polling) | none (read-only) |
| `POST /razorpay/webhook` | **Razorpay servers only**, signed | `OpsPayment` status `→ PAID` / `→ FAILED`, subscription assignment |

No endpoint other than the webhook can ever write `PAID`. A forged or replayed call to any other endpoint can, at most, move an order to `PENDING` — a UX signal, not a financial one.

---

## Endpoints

### 1. Verify Checkout Session
`POST /api/v1/billing-portal/session`

- **Purpose**: Verifies the main-app-to-ops handoff JWT and returns the plan/org details the checkout page renders.
- **Auth**: Handoff JWT (`BILLING_HANDOFF_SECRET`, no default — the app fails to boot if this env var is unset).

#### Request Body
```json
{ "token": "<handoff JWT>" }
```

#### Success (`200 OK`)
```json
{
  "success": true,
  "data": {
    "session": {
      "organizationId": "org_123",
      "organizationName": "TechTutors Academy",
      "adminId": "admin_1",
      "adminEmail": "owner@techtutors.example",
      "adminName": "Jane Doe"
    },
    "plan": {
      "id": "plan_growth",
      "name": "Growth",
      "slug": "growth",
      "description": "For growing organizations running regular quizzes.",
      "currency": "INR",
      "allowsMonthly": true,
      "allowsAnnual": true,
      "monthlyPrice": 2999,
      "annualPrice": 29999,
      "features": ["10 contests per month", "Up to 1000 participants per contest"]
    }
  }
}
```

A plan's `monthlyPrice`/`annualPrice` are independent, admin-set values — annual is never derived as `monthlyPrice × 12`. A plan may offer only one cycle (`allowsMonthly: false` for an annual-only tier with a fixed rate, or vice versa).

---

### 2. Create Subscription Order
`POST /api/v1/billing-portal/subscription/order`

- **Purpose**: Creates (or reuses) a Razorpay order and the corresponding `OpsPayment` row.
- **Idempotent**: if a non-terminal (`CREATED`/`PENDING`) order already exists for the same organization + plan + cycle, it is reused instead of minting a duplicate Razorpay order.

#### Request Body
```json
{ "token": "<handoff JWT>", "billingCycle": "MONTHLY" }
```
`billingCycle` must be `MONTHLY` or `ANNUAL`, and the plan must offer that cycle.

#### Success (`200 OK`)
```json
{
  "success": true,
  "data": {
    "paymentId": "01K...",
    "orderId": "order_...",
    "amount": 306978,
    "currency": "INR",
    "keyId": "rzp_live_...",
    "planName": "Growth",
    "billingCycle": "MONTHLY",
    "pricing": {
      "baseAmount": 2999,
      "gatewayFeeAmount": 59.98,
      "gstAmount": 10.8,
      "totalAmount": 3069.78
    }
  }
}
```

`amount` is in paise and is exactly `pricing.totalAmount × 100` — the same number the checkout page displays. Pricing formula: gateway fee = 2% of `baseAmount`; GST = 18% of the gateway fee (not of the base); total = base + fee + GST. See `lib/pricing/subscriptionPricing.ts` — the single function both this route and the checkout page call, so display and charge can never drift apart.

In production, if Razorpay keys aren't configured, this endpoint fails with `503` rather than minting an order id nothing can ever legitimately pay against.

---

### 3. Verify Payment Signature
`POST /api/v1/billing-portal/subscription/verify`

- **Purpose**: Called by the browser from Razorpay checkout.js's `handler` callback once the widget reports success. Verifies the Razorpay *payment* signature (`HMAC-SHA256(orderId|paymentId, RAZORPAY_KEY_SECRET)`, timing-safe compare) and, if valid, moves the order `CREATED → PENDING`.
- **This is a UX signal only.** It can never write `PAID` — that is the webhook's job alone. If the webhook has already confirmed payment (or already marked it failed) by the time this call arrives, the guarded update matches zero rows and is treated as a no-op, not an error.

#### Request Body
```json
{
  "razorpayOrderId": "order_...",
  "razorpayPaymentId": "pay_...",
  "razorpaySignature": "..."
}
```

#### Success (`200 OK`)
```json
{ "success": true, "data": { "verified": true } }
```

---

### 4. Poll Payment Status
`GET /api/v1/billing-portal/subscription/status?paymentId=<id>`

- **Purpose**: Read-only status check. The checkout page polls this every 2.5s (up to 90s) after calling `/verify`, and only redirects to the main app's success page once this returns `PAID`.

#### Success (`200 OK`)
```json
{
  "success": true,
  "data": { "paymentId": "01K...", "status": "PAID", "paidAt": "2026-07-29T06:51:00.554Z" }
}
```

`status` is one of `CREATED`, `PENDING`, `PAID`, `FAILED`, `REFUNDED`.

---

### 5. Razorpay Webhook
`POST /api/v1/billing-portal/razorpay/webhook`

- **Purpose**: Server-to-server callback from Razorpay. The single source of truth for whether money actually moved.
- **Auth**: `x-razorpay-signature` header, HMAC-SHA256 over the raw request body using `RAZORPAY_WEBHOOK_SECRET` — a secret dedicated to this webhook, never falling back to `RAZORPAY_KEY_SECRET`. Compared with `crypto.timingSafeEqual`. Missing secret, missing header, or a signature mismatch → `400`/`503`, request rejected outright — verification is never silently skipped.
- **Idempotent**: the `OpsPayment` update is guarded (`status NOT IN ('PAID')` for capture, `NOT IN ('PAID','FAILED')` for failure) so redelivery never re-runs `assignPlan` or duplicates the audit log entry. If a prior delivery marked the payment `PAID` but failed before finishing plan assignment (e.g. a transient downstream error), a redelivery resumes that work instead of short-circuiting as "already processed" — resumability is keyed off whether `subscriptionId` has been backfilled, not just the payment status.
- **Amount-verified**: the webhook's reported amount is compared against the `OpsPayment.amount` computed at order-creation time; a mismatch is logged and the payment is *not* marked `PAID`.
- **Plan resolution is server-authoritative**: the plan to assign comes from `OpsPayment.planId` (set at order-creation time from the verified handoff token), never from any client- or webhook-body-supplied `planSlug`.

Handled events: `payment.captured` (→ `PAID`, assigns the subscription with the `billingCycle`/`periodMonths` recorded on the `OpsPayment` at order-creation time), `payment.failed` (→ `FAILED`). All other events are acknowledged with `200` and ignored.

---

## Pricing formula

```
gatewayFee = round(baseAmount × 0.02, 2)
gst        = round(gatewayFee × 0.18, 2)
total      = baseAmount + gatewayFee + gst
```

`baseAmount` is always the plan's own price for the selected cycle (`monthlyPrice` or `annualPrice`) — never a derived value. A plan can offer an annual price that is *not* `monthlyPrice × 12` (e.g. a promotional rate, or an annual-only plan with no monthly price at all).

---

## Data model notes

- `OpsPayment` stores a full receipt per payment: `baseAmount`, `gatewayFeeAmount`, `gstAmount`, `amount` (grand total), `billingCycle`, `periodMonths`, `planId` — not just a final total.
- `OrganizationSubscription` records the `billingCycle`/`periodMonths` actually purchased for the current period, independent of what the plan's `allowsMonthly`/`allowsAnnual` say today (a plan's cycle availability can change after a subscription was created under it).
- `OpsPaymentStatus` progresses `CREATED → PENDING → PAID` (or `→ FAILED`), mirroring the main app's payment state machine. `CREATED` is set at order-creation time, before the browser has done anything; `PENDING` reflects the browser reporting checkout.js completion; `PAID`/`FAILED` are webhook-only.
