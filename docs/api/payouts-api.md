# Payouts & Route Transfers API Specification

The Payouts API domain manages connected Razorpay Route accounts, automated contest revenue transfers, queue health telemetry, payment timeline audits, manual transfer retries, and linked account activations.

---

## Base Path
`/api/v1/ops/payouts`

---

## Endpoints

### 1. List Platform Payout Accounts
`GET /api/v1/ops/payouts/accounts`

- **Purpose**: Search, filter, and paginate through connected organization payout accounts.
- **Description**:
  Queries connected Razorpay Route accounts across organizations with status filters (`PENDING`, `ACTIVE`, `VERIFICATION_FAILED`, `DISABLED`).

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1) - Page number.
  - `limit` (number, default: 20) - Items per page (max: 100).
  - `status` (`all` | `PENDING` | `ACTIVE` | `VERIFICATION_FAILED` | `DISABLED`, default: `all`) - Account status filter.
  - `search` (string, optional) - Organization name/slug or linked account ID search string.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "organizationId": "org_7712",
        "organizationName": "Global Tech Institute",
        "razorpayLinkedAccountId": "acc_Mj9012849",
        "status": "ACTIVE",
        "payoutsEnabled": true,
        "createdAt": "2026-02-10T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 45,
      "totalPages": 3
    }
  },
  "message": "Payout accounts retrieved."
}
```

---

### 2. Platform Route Transfer Summary
`GET /api/v1/ops/payouts/summary`

- **Purpose**: Retrieve platform-wide payout transfer volume metrics and status breakdown.
- **Description**:
  Aggregates total transfer volume, processed volume, pending transfers, failed transfers count, and total platform commission fees collected.

#### Responses
```json
{
  "success": true,
  "data": {
    "totalTransfersCount": 1280,
    "totalVolume": 8500000,
    "processedVolume": 8200000,
    "pendingVolume": 250000,
    "failedVolume": 50000,
    "platformCommissionFees": 425000,
    "currency": "INR"
  },
  "message": "Platform transfer summary retrieved."
}
```

---

### 3. Payment Timeline & Audit Trail Search
`GET /api/v1/ops/payouts/timeline`

- **Purpose**: Trace complete end-to-end payment lifecycle from registration fee collection to Route transfer settlement.
- **Description**:
  Searches payment records by payment ID, Razorpay order ID, or Razorpay payment ID, returning complete event timeline logs.

#### Request Parameters
- **Query Parameters**:
  - `search` (string, required, min: 3 chars) - Search query for payment ID or Razorpay reference.

#### Responses
```json
{
  "success": true,
  "data": {
    "found": true,
    "paymentId": "pay_880192",
    "razorpayPaymentId": "pay_Rzp1920491",
    "amount": 500,
    "organizationId": "org_7712",
    "timeline": [
      { "event": "PAYMENT_CAPTURED", "timestamp": "2026-07-25T10:00:00.000Z", "detail": "Payment of ₹500 captured via UPI" },
      { "event": "TRANSFER_ENQUEUED", "timestamp": "2026-07-25T10:00:05.000Z", "detail": "Enqueued transfer of ₹450 to acc_Mj9012849" },
      { "event": "TRANSFER_PROCESSED", "timestamp": "2026-07-25T10:00:08.000Z", "detail": "Razorpay transfer trf_889102 processed successfully" }
    ]
  },
  "message": "Payment timeline retrieved."
}
```

---

### 4. Needs Attention (Failed Transfers & Unlinked Accounts)
`GET /api/v1/ops/payouts/needs-attention`

- **Purpose**: List accounts requiring operator intervention due to verification failures or failed transfer retries.
- **Description**:
  Queries payout accounts and transfers with `FAILED` or `VERIFICATION_FAILED` status needing manual review.

#### Request Parameters
- **Query Parameters**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20)

---

### 5. Link Razorpay Linked Account to Organization
`POST /api/v1/ops/organizations/[orgId]/payout-account/link`

- **Purpose**: Manually attach a Razorpay linked account ID (`acc_...`) to an organization.
- **Description**:
  Associates linked account ID, activates payout status, and syncs organization account state.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "razorpayLinkedAccountId": "acc_Mj9012849"
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "organizationId": "org_7712",
    "razorpayLinkedAccountId": "acc_Mj9012849",
    "status": "ACTIVE"
  },
  "message": "Payout account linked and activated."
}
```
