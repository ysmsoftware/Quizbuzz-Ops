# Billing API Specification

The Billing API domain manages platform-wide payment transaction auditing, billing revenue summaries, Razorpay webhooks, and billing portal checkout sessions.

---

## Base Path
`/api/v1/ops/billing` & `/api/v1/billing-portal`

---

## Endpoints

### 1. List Platform Payments
`GET /api/v1/ops/billing/payments`

- **Purpose**: Query, filter, and paginate through platform payment records across all organizations.
- **Description**:
  Queries payment transactions from DB with status filtering (`SUCCESS`, `FAILED`, `PENDING`, `REFUNDED`), organization filter, date range filters, and text search.

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1) - Page number.
  - `limit` (number, default: 20) - Items per page.
  - `status` (`all` | `SUCCESS` | `FAILED` | `PENDING` | `REFUNDED`, default: `all`) - Transaction status.
  - `search` (string, optional) - Payment reference or payee search.
  - `orgId` (string, optional) - Filter by organization ID.
  - `dateFrom` (string, optional) - Start ISO date string.
  - `dateTo` (string, optional) - End ISO date string.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "pay_99102",
        "organizationId": "org_7712",
        "organizationName": "Global Tech Institute",
        "source": "subscription",
        "referenceId": "order_Rzp9921048",
        "amount": 4999,
        "currency": "INR",
        "status": "SUCCESS",
        "paymentMethod": "UPI",
        "createdAt": "2026-07-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 320,
      "totalPages": 16
    }
  },
  "message": "Platform payments list retrieved."
}
```

---

### 2. Platform Billing Revenue Summary
`GET /api/v1/ops/billing/summary`

- **Purpose**: Fetch top-level financial summaries including MRR, ARR, active subscriptions count, and payment gateway health.
- **Description**:
  Computes Monthly Recurring Revenue (MRR), Annual Recurring Revenue (ARR), plan distribution breakdown, and monthly growth percentage.

#### Responses
```json
{
  "success": true,
  "data": {
    "mrr": 320000,
    "arr": 3840000,
    "activeSubscriptions": 128,
    "growthRateMonthOverMonth": 14.5,
    "currency": "INR",
    "planDistribution": {
      "starter": 60,
      "pro": 55,
      "enterprise": 13
    }
  },
  "message": "Platform billing & revenue summary retrieved."
}
```

---

### 3. Verify Billing Portal Handoff Session
`POST /api/v1/billing-portal/session`

- **Purpose**: Verify JWT handoff token from main application and initialize checkout session context.
- **Description**:
  Verifies `BILLING_HANDOFF_SECRET` signature, resolves target organization and requested plan from Ops database, writes checkout started audit entry, and returns session context.

#### Request Body
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "session": {
      "organizationId": "org_7712",
      "organizationName": "Global Tech Institute",
      "adminEmail": "director@globaltech.edu"
    },
    "plan": {
      "id": "pln_pro",
      "name": "Pro Business",
      "slug": "pro",
      "price": 4999,
      "currency": "INR",
      "billingCycle": "MONTHLY",
      "features": [
        "15 contests per month",
        "Up to 2500 participants per contest",
        "Advanced proctoring",
        "Custom certificate branding",
        "Analytics data export"
      ]
    }
  }
}
```

##### Failure States
- **`400 Bad Request`**: Token missing or payload invalid.
- **`401 Unauthorized`**: Token signature invalid or expired.
- **`404 Not Found`**: Target plan slug inactive or non-existent.

---

### 4. Razorpay Webhook Handler
`POST /api/v1/billing-portal/razorpay/webhook`

- **Purpose**: Process asynchronous payment notification webhooks from Razorpay.
- **Description**:
  Verifies Razorpay webhook signature header (`x-razorpay-signature`). Processes events including `order.paid`, `payment.captured`, `payment.failed`, and `subscription.charged`. Updates subscription states and records payments.

#### Request Headers
- `x-razorpay-signature`: HMAC-SHA256 signature string.

#### Request Body (Razorpay Webhook Payload)
```json
{
  "entity": "event",
  "account_id": "acc_100201",
  "event": "order.paid",
  "contains": ["payment", "order"],
  "payload": { ... }
}
```

#### Responses
```json
{
  "status": "ok",
  "processed": true
}
```
