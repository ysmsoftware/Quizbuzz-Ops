# Subscriptions API Specification

The Subscriptions API domain manages organization subscription assignments, plan migrations, custom quota overrides, override removals, and checkout order creation.

---

## Base Path
`/api/v1/ops/organizations/[orgId]/subscription`

---

## Endpoints

### 1. Get Organization Subscription Details
`GET /api/v1/ops/organizations/[orgId]/subscription`

- **Purpose**: Retrieve the current subscription status, assigned plan specs, and active limit overrides for an organization.
- **Description**:
  Queries Ops database for the organization's subscription record, plan details, billing renewal date, and any active custom limit overrides.

#### Request Parameters
- **Path Parameters**:
  - `orgId` (string, required) - Organization ID.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "organizationId": "org_7712",
    "status": "ACTIVE",
    "plan": {
      "id": "pln_pro",
      "name": "Pro Business",
      "slug": "pro",
      "price": 4999,
      "billingCycle": "MONTHLY"
    },
    "currentPeriodStart": "2026-07-01T00:00:00.000Z",
    "currentPeriodEnd": "2026-08-01T00:00:00.000Z",
    "overrides": [
      {
        "id": "ovr_1102",
        "field": "maxParticipantsPerContest",
        "value": 5000,
        "reason": "Special event upgrade for July Hackathon",
        "expiresAt": "2026-08-01T00:00:00.000Z",
        "createdAt": "2026-07-10T14:00:00.000Z"
      }
    ]
  },
  "message": "Subscription details retrieved."
}
```

##### Failure States
- **`404 Not Found`**: Subscription not found for specified organization.
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Subscription not found for this organization."
  }
}
```

---

### 2. Change / Upgrade Organization Plan
`POST /api/v1/ops/organizations/[orgId]/subscription/change-plan`

- **Purpose**: Change or upgrade an organization's subscription plan.
- **Description**:
  Updates the active plan assigned to the organization, syncs entitlements cache in Redis, writes audit log entry, and emits plan-changed notification event.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "planId": "pln_ent_plus",
  "reason": "Manual upgrade requested by organization owner via sales deal."
}
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "organizationId": "org_7712",
    "newPlanId": "pln_ent_plus",
    "status": "ACTIVE",
    "updatedAt": "2026-07-26T11:48:00.000Z"
  },
  "message": "Subscription plan changed successfully."
}
```

##### Failure States
- **`403 Forbidden`**: Operator lacks required administrative role.
- **`400 Bad Request`**: Missing `planId` parameter.

---

### 3. Add Custom Limit Override
`POST /api/v1/ops/organizations/[orgId]/subscription/overrides`

- **Purpose**: Grant custom limit or feature overrides to an organization beyond standard plan boundaries.
- **Description**:
  Persists a custom override record for fields like `maxContestsPerCycle`, `maxParticipantsPerContest`, or `featureProctoring`.
  Triggers immediate cache invalidation and sync to main DB Redis cache.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "field": "maxParticipantsPerContest",
  "value": 10000,
  "reason": "Enterprise sponsorship partner agreement",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "id": "ovr_2209",
    "organizationId": "org_7712",
    "field": "maxParticipantsPerContest",
    "value": 10000,
    "reason": "Enterprise sponsorship partner agreement",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  },
  "message": "Subscription limit override added successfully."
}
```

---

### 4. Remove Custom Limit Override
`DELETE /api/v1/ops/organizations/[orgId]/subscription/overrides/[overrideId]`

- **Purpose**: Remove an existing custom limit override and revert organization to plan default limits.
- **Description**:
  Deletes override record by ID, syncs updated entitlements cache, and logs operator action.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "reason": "Sponsorship event expired."
}
```

#### Responses
```json
{
  "success": true,
  "data": null,
  "message": "Subscription limit override removed."
}
```

---

### 5. Create Subscription Razorpay Order (Billing Portal)
`POST /api/v1/billing-portal/subscription/order`

- **Purpose**: Initialize a Razorpay payment order for self-serve subscription checkout.
- **Description**:
  Creates a payment order in Razorpay API with correct price, currency (`INR`), and receipt metadata. Returns order ID and Razorpay key for frontend SDK checkout.

#### Request Body
```json
{
  "organizationId": "org_7712",
  "planSlug": "pro"
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "orderId": "order_Rzp9921048",
    "amount": 499900,
    "currency": "INR",
    "razorpayKeyId": "rzp_live_xK9110294812"
  }
}
```
