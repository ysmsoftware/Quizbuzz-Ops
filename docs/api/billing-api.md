# Billing API Specification

The Billing API is the ops desk's view of **contest registration money**: payments participants made to organizations, and a platform summary. It does not cover what organizations pay us.

| Looking for | See |
|---|---|
| What an org pays QuizBuzz: checkout, auto-debit, webhook | [`billing-portal-api.md`](./billing-portal-api.md) |
| Invoices, receipts, credit notes, Billing Settings, leads | [`invoices-api.md`](./invoices-api.md) |
| An org's plan, dates and overrides | [`subscriptions-api.md`](./subscriptions-api.md) |
| Payouts to organizations | [`payouts-api.md`](./payouts-api.md) |

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## Base Path
`/api/v1/ops/billing`

Both endpoints need an ops session (any role).

---

## Endpoints

### 1. List platform payments
`GET /api/v1/ops/billing/payments`

Contest registration payments across every org, read from the main app's database.

**Query:**

| Param | Notes |
|---|---|
| `page`, `limit` | default 1 and 20; `limit` is at most 100 |
| `status` | `all` (default), `SUCCESS`, `FAILED`, `PENDING`, `REFUNDED` |
| `search` | organization name or slug, contest title, payee email, or Razorpay payment id |
| `orgId` | one organization |
| `dateFrom`, `dateTo` | ISO dates |

**Response `data`:** `{ data, total, page, limit }`. Each item:

```json
{
  "id": "…",
  "organizationId": "…",
  "organizationName": "ABC College",
  "organizationSlug": "abc",
  "contestId": "…",
  "contestTitle": "National Aptitude Mock",
  "payeeName": "A. Student",
  "payeeEmail": "a@example.com",
  "amount": 199,
  "currency": "INR",
  "status": "SUCCESS",
  "provider": "RAZORPAY",
  "razorpayPaymentId": "pay_…",
  "paidAt": "2026-11-08T10:00:00.000Z",
  "createdAt": "2026-11-08T09:58:00.000Z"
}
```

`amount` is in rupees (the main app stores paise).

---

### 2. Platform billing summary
`GET /api/v1/ops/billing/summary`

**Response `data`:**

```json
{
  "totalRevenueAllTime": 1250000,
  "totalRevenueThisMonth": 84000,
  "mrr": 320000,
  "activeSubscriptionCount": 128,
  "paymentsByStatus": { "SUCCESS": 4100, "FAILED": 220, "PENDING": 12, "REFUNDED": 30 },
  "topOrganizationsByRevenue": [
    { "organizationId": "…", "organizationName": "ABC College", "organizationSlug": "abc", "totalRevenue": 90000, "paymentCount": 450 }
  ],
  "currency": "INR"
}
```

- `totalRevenue*`, `paymentsByStatus` and `topOrganizationsByRevenue`: successful **contest registration payments** in the main app. Deleted orgs and payments are left out. This is money organizers collected, not QuizBuzz's own revenue.
- `mrr`: the plan price of every `ACTIVE` subscription of a live org, with annual and 6-month plans divided into months. It's a list-price figure: it counts Free (₹0) plans, and doesn't net out complimentary, offline or discounted deals, or GST.
- `activeSubscriptionCount`: `ACTIVE` subscriptions of live orgs, Free included.

---

## Not here any more

`POST /api/v1/billing-portal/session` and the rest of the checkout flow are documented in [`billing-portal-api.md`](./billing-portal-api.md).
