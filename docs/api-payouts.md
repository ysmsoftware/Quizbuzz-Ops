# QuizBuzz Ops — Organization Payouts API Documentation

## Domain Overview

This domain gives platform operators visibility and control over each organization's **Razorpay Route payout account** — the Linked Account that receives the org's share of contest registration fees — and the **route transfers** created after each captured contest payment.

The payout system itself lives in the main app (`ysmsoftware/Quizbuzz-new`), shipped ahead of this ops milestone: `OrganizationPayoutAccount` and `PaymentRouteTransfer` tables, and org-facing endpoints under `/payout-accounts/*` that an org admin uses from Settings to submit payout details and (in `MANUAL` onboarding mode) paste in a `razorpayLinkedAccountId` once one exists.

Ops does not create Razorpay Linked Accounts itself. What ops adds is the support/billing-side half of that same manual workflow: seeing which orgs are stuck in `PENDING` (submitted payout details, no Linked Account yet), attaching a `razorpayLinkedAccountId` on an org's behalf once one has been created in the Razorpay Dashboard, flagging/disabling a payout account when verification fails, and monitoring route transfers platform-wide so failed or stuck distributions surface as a normal billing-ops queue instead of silent DB rows.

All endpoints require an active operator session (`ops_access_token` cookie). Writes are restricted to `SUPER_ADMIN` and `BILLING_ADMIN` and generate `PlatformAuditLog` entries.

Source of truth for every value in this document is the main app database (`organization_payout_accounts`, `payment_route_transfers`). Ops does not keep a shadow copy of payout account state in `quizbuzz_ops`.

---

## Platform Payouts APIs

### 1. List Organization Payout Accounts

`GET /api/v1/ops/payouts/accounts`

#### Purpose

Platform-wide list of payout accounts, for the Billing & Revenue Desk "Payouts" tab. Used to find organizations stuck in `PENDING` (need a Linked Account created) or `VERIFICATION_FAILED`.

#### Request Parameters

| Parameter | Type    | Required | Default | Description                                                    |
| :---------| :-------| :--------| :-------| :---------------------------------------------------------------|
| `page`    | integer | No       | `1`     | Page number                                                    |
| `limit`   | integer | No       | `20`    | Page size                                                       |
| `status`  | string  | No       | `all`   | `all`, `PENDING`, `ACTIVE`, `VERIFICATION_FAILED`, `DISABLED`   |
| `search`  | string  | No       | —       | Partial match against organization name, slug, or account email |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Payout accounts retrieved.",
  "data": {
    "data": [
      {
        "id": "pacc_01HJ9E4T",
        "organizationId": "org_01HJ8E9234857239485723",
        "organizationName": "Apex Academy",
        "organizationSlug": "apex-academy",
        "accountName": "Apex Academy Pvt Ltd",
        "accountEmail": "finance@apex.edu",
        "contactNumber": "+91 98765 43210",
        "status": "PENDING",
        "onboardingMode": "MANUAL",
        "razorpayLinkedAccountId": null,
        "activatedAt": null,
        "pendingTransferCount": 3,
        "createdAt": "2026-07-18T09:00:00.000Z"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

##### Failure — Session Missing (401 Unauthorized)

```json
{
  "success": false,
  "message": "Authentication required. Session expired.",
  "error": {
    "code": "UNAUTHORIZED",
    "details": null
  }
}
```

---

### 2. Get Organization Payout Account

`GET /api/v1/ops/organizations/:orgId/payout-account`

#### Purpose

Fetches the payout account and recent route transfers for a single organization. Shown as a new "Payout Account" section in the existing Organization Detail view, alongside Members/Contests/Payments/Subscription.

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Payout account retrieved.",
  "data": {
    "hasAccount": true,
    "account": {
      "id": "pacc_01HJ9E4T",
      "organizationId": "org_01HJ8E9234857239485723",
      "accountName": "Apex Academy Pvt Ltd",
      "accountEmail": "finance@apex.edu",
      "contactNumber": "+91 98765 43210",
      "status": "ACTIVE",
      "onboardingMode": "MANUAL",
      "razorpayLinkedAccountId": "acc_QwErTy12345",
      "activatedAt": "2026-07-19T10:15:00.000Z",
      "createdAt": "2026-07-18T09:00:00.000Z",
      "updatedAt": "2026-07-19T10:15:00.000Z"
    },
    "transferSummary": {
      "processed": 12,
      "failed": 1,
      "pendingNoAccount": 0,
      "totalTransferredAllTime": 108000.00,
      "currency": "INR"
    }
  }
}
```

##### Failure — No Payout Account Yet (200 OK, empty state)

```json
{
  "success": true,
  "message": "Payout account retrieved.",
  "data": {
    "hasAccount": false,
    "account": null,
    "transferSummary": null
  }
}
```

##### Failure — Organization Not Found (404 Not Found)

```json
{
  "success": false,
  "message": "Organization not found",
  "error": {
    "code": "NOT_FOUND",
    "details": null
  }
}
```

---

### 3. List Organization Route Transfers

`GET /api/v1/ops/organizations/:orgId/payout-account/transfers`

#### Purpose

Lists `PaymentRouteTransfer` rows for one organization — the per-payment ledger of what was sent to their linked account, what QuizBuzz kept as platform fee, and anything that failed or is stuck pending an active account.

#### Request Parameters

| Parameter | Type    | Required | Default | Description                                  |
| :---------| :-------| :--------| :-------| :----------------------------------------------|
| `page`    | integer | No       | `1`     | Page number                                  |
| `limit`   | integer | No       | `20`    | Page size                                    |
| `status`  | string  | No       | `all`   | `all`, `PENDING`, `PROCESSED`, `FAILED`, `REVERSED` |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Route transfers retrieved.",
  "data": {
    "data": [
      {
        "id": "prt_01HJ9F2A",
        "paymentId": "pay_991823",
        "razorpayPaymentId": "pay_rzp_live_881923",
        "razorpayTransferId": "trf_9A9A9A",
        "contestTitle": "Summer Math Challenge",
        "grossAmount": 100.00,
        "platformFeeAmount": 10.00,
        "transferAmount": 90.00,
        "currency": "INR",
        "status": "PROCESSED",
        "failureReason": null,
        "processedAt": "2026-07-19T12:05:00.000Z",
        "createdAt": "2026-07-19T12:04:58.000Z"
      }
    ],
    "total": 13,
    "page": 1,
    "limit": 20
  }
}
```

Amounts are converted from paise to rupees for display, same convention as the existing Organization Payments endpoint.

---

### 4. Attach Razorpay Linked Account (Manual Onboarding)

`PATCH /api/v1/ops/organizations/:orgId/payout-account/link`

#### Purpose

Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Records the `razorpayLinkedAccountId` for an organization once an operator has created the Linked Account in the Razorpay Dashboard (`MANUAL` onboarding mode — see Main App Coordination in the implementation guide), flips status to `ACTIVE`, and logs audit `org.payout_account_linked`.

This is the ops-side counterpart of the org-facing `PATCH /payout-accounts/link` endpoint already shipped in the main app — an org admin can do this themselves from Settings, but in practice the Linked Account is created by YSM staff on the org's behalf, so this lets an operator complete the loop without needing the org to log in and paste an ID.

#### Request Body

```json
{
  "razorpayLinkedAccountId": "acc_QwErTy12345"
}
```

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Payout account linked and activated.",
  "data": {
    "id": "pacc_01HJ9E4T",
    "organizationId": "org_01HJ8E9234857239485723",
    "status": "ACTIVE",
    "razorpayLinkedAccountId": "acc_QwErTy12345",
    "activatedAt": "2026-07-21T09:10:00.000Z"
  }
}
```

##### Failure — Payout Account Not Submitted Yet (404 Not Found)

```json
{
  "success": false,
  "message": "This organization has not submitted payout account details yet.",
  "error": {
    "code": "NOT_FOUND",
    "details": null
  }
}
```

##### Failure — Invalid Linked Account ID Format (400 Bad Request)

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "razorpayLinkedAccountId",
        "message": "Must be a valid Razorpay linked account ID starting with acc_"
      }
    ]
  }
}
```

##### Failure — Insufficient Permissions (403 Forbidden)

```json
{
  "success": false,
  "message": "Access denied. Action requires role: SUPER_ADMIN or BILLING_ADMIN",
  "error": {
    "code": "FORBIDDEN",
    "details": null
  }
}
```

---

### 5. Update Payout Account Status

`PATCH /api/v1/ops/organizations/:orgId/payout-account/status`

#### Purpose

Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Marks a payout account `VERIFICATION_FAILED` (Razorpay KYC rejected the Linked Account) or `DISABLED` (payouts intentionally turned off for this org without suspending the whole organization), or reverses either back to `ACTIVE`. Logs audit `org.payout_account_status_changed` with the before/after status and reason.

Setting status to anything other than `ACTIVE` blocks the org's main-app contest-publish gate for paid contests, same as if the org had never set up payouts.

#### Request Body

```json
{
  "status": "VERIFICATION_FAILED",
  "reason": "Razorpay KYC rejected: PAN name mismatch with legal_business_name."
}
```

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Payout account status updated.",
  "data": {
    "id": "pacc_01HJ9E4T",
    "organizationId": "org_01HJ8E9234857239485723",
    "status": "VERIFICATION_FAILED",
    "updatedAt": "2026-07-21T09:12:00.000Z"
  }
}
```

##### Failure — Payout Account Not Found (404 Not Found)

```json
{
  "success": false,
  "message": "Payout account not found for this organization",
  "error": {
    "code": "NOT_FOUND",
    "details": null
  }
}
```

---

### 6. Platform Route Transfers (Billing Desk)

`GET /api/v1/ops/payouts/transfers`

#### Purpose

Platform-wide, cross-organization list of route transfers for the Billing & Revenue Desk. The primary billing-ops workflow this supports: find every `FAILED` transfer or every `PENDING` transfer whose `failureReason` is `no_active_payout_account`, so an operator can chase down the org and either fix the Linked Account or re-trigger the transfer manually later (re-trigger action is out of scope for this milestone — see the implementation guide's Non-Goals).

#### Request Parameters

| Parameter | Type    | Required | Default | Description                                          |
| :---------| :-------| :--------| :-------| :------------------------------------------------------|
| `page`    | integer | No       | `1`     | Page number                                          |
| `limit`   | integer | No       | `20`    | Page size                                            |
| `status`  | string  | No       | `all`   | `all`, `PENDING`, `PROCESSED`, `FAILED`, `REVERSED`  |
| `reason`  | string  | No       | —       | Exact match against `failureReason`, e.g. `no_active_payout_account` |

#### Responses

##### Success (200 OK)

```json
{
  "success": true,
  "message": "Platform route transfers retrieved.",
  "data": {
    "data": [
      {
        "id": "prt_01HJ9F2B",
        "organizationId": "org_01HJ8E9234857239485723",
        "organizationName": "Apex Academy",
        "grossAmount": 250.00,
        "platformFeeAmount": 25.00,
        "transferAmount": 225.00,
        "status": "PENDING",
        "failureReason": "no_active_payout_account",
        "createdAt": "2026-07-20T11:30:00.000Z"
      }
    ],
    "total": 6,
    "page": 1,
    "limit": 20
  }
}
```

---

## Notes on Amounts and Statuses

- All amounts in the main app (`grossAmount`, `platformFeeAmount`, `transferAmount`, `Payment.amount`) are stored in paise. This domain's endpoints convert to rupees before returning, matching the existing Organization Payments endpoint's convention.
- `PaymentRouteTransfer.status = PENDING` with `failureReason: "no_active_payout_account"` is the expected, non-error state for an org that hasn't finished payout setup — it is not the same as `FAILED`, which means Razorpay's transfer API call itself errored.
- Refunds and transfer reversals are explicitly out of scope here — see Phase 3 (`Billing Depth, Audit Read UI, and Impersonation`) in the PRD.
