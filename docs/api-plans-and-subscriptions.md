# QuizBuzz Ops — Subscription Plans & Entitlements API Documentation

## Domain Overview
This domain manages subscription plans, tenant entitlements, plan assignments, and limit overrides. Any change to a plan, subscription assignment, or limit override triggers an immediate **write-through cache sync** (`syncOrgPlanLimitsCache`), updating `planLimitsCache`, `planSlug`, and `planStatus` in the main application database.

Modifications to plans and subscription overrides are restricted to `SUPER_ADMIN` and `BILLING_ADMIN` roles.

---

## Subscription Plans APIs

### 1. List Subscription Plans
`GET /api/v1/ops/plans`

#### Purpose
Lists all subscription plans configured in the operational database, including subscriber organization counts per plan.

#### Request Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `includeInactive` | boolean | No | `false` | If `true`, includes soft-deactivated plans |

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plans retrieved.",
  "data": [
    {
      "id": "plan_starter",
      "name": "Starter (Free)",
      "slug": "starter",
      "description": "Perfect for small events and testing.",
      "price": 0.00,
      "currency": "INR",
      "billingCycle": "MONTHLY",
      "isActive": true,
      "maxContestsPerCycle": 2,
      "maxParticipantsPerContest": 100,
      "maxQuestionsPerContest": 15,
      "maxOrgMembers": 1,
      "featureProctoring": false,
      "featureCertBranding": false,
      "featurePrioritySupport": false,
      "featureAnalyticsExport": false,
      "featureCustomDomain": false,
      "createdAt": "2026-07-20T07:44:00.000Z",
      "updatedAt": "2026-07-20T07:44:00.000Z",
      "organizationCount": 14
    },
    {
      "id": "plan_growth",
      "name": "Growth",
      "slug": "growth",
      "description": "For growing organizations running regular quizzes.",
      "price": 2999.00,
      "currency": "INR",
      "billingCycle": "MONTHLY",
      "isActive": true,
      "maxContestsPerCycle": 10,
      "maxParticipantsPerContest": 1000,
      "maxQuestionsPerContest": 50,
      "maxOrgMembers": 5,
      "featureProctoring": false,
      "featureCertBranding": true,
      "featurePrioritySupport": false,
      "featureAnalyticsExport": true,
      "featureCustomDomain": false,
      "createdAt": "2026-07-20T07:44:00.000Z",
      "updatedAt": "2026-07-20T07:44:00.000Z",
      "organizationCount": 27
    }
  ]
}
```

---

### 2. Get Subscription Plan Details
`GET /api/v1/ops/plans/:planId`

#### Purpose
Returns specifications and subscriber metrics for a single plan.

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan details retrieved.",
  "data": {
    "id": "plan_growth",
    "name": "Growth",
    "slug": "growth",
    "description": "For growing organizations running regular quizzes.",
    "price": 2999.00,
    "currency": "INR",
    "billingCycle": "MONTHLY",
    "isActive": true,
    "maxContestsPerCycle": 10,
    "maxParticipantsPerContest": 1000,
    "maxQuestionsPerContest": 50,
    "maxOrgMembers": 5,
    "featureProctoring": false,
    "featureCertBranding": true,
    "featurePrioritySupport": false,
    "featureAnalyticsExport": true,
    "featureCustomDomain": false,
    "createdAt": "2026-07-20T07:44:00.000Z",
    "updatedAt": "2026-07-20T07:44:00.000Z",
    "organizationCount": 27
  }
}
```

##### Failure — Plan Not Found (404 Not Found)
```json
{
  "success": false,
  "message": "Subscription plan not found",
  "error": {
    "code": "NOT_FOUND",
    "details": null
  }
}
```

---

### 3. Create Subscription Plan
`POST /api/v1/ops/plans`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Creates a new tier plan and logs audit `plan.created`.

#### Request Body
```json
{
  "name": "Growth Pro",
  "slug": "growth-pro",
  "description": "Enhanced growth tier with AI proctoring.",
  "price": 4999.00,
  "currency": "INR",
  "billingCycle": "MONTHLY",
  "maxContestsPerCycle": 15,
  "maxParticipantsPerContest": 2500,
  "maxQuestionsPerContest": 75,
  "maxOrgMembers": 10,
  "featureProctoring": true,
  "featureCertBranding": true,
  "featurePrioritySupport": false,
  "featureAnalyticsExport": true,
  "featureCustomDomain": false
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan created.",
  "data": {
    "id": "plan_growth-pro_A8812Z",
    "name": "Growth Pro",
    "slug": "growth-pro",
    "description": "Enhanced growth tier with AI proctoring.",
    "price": "4999",
    "currency": "INR",
    "billingCycle": "MONTHLY",
    "isActive": true,
    "maxContestsPerCycle": 15,
    "maxParticipantsPerContest": 2500,
    "maxQuestionsPerContest": 75,
    "maxOrgMembers": 10,
    "featureProctoring": true,
    "featureCertBranding": true,
    "featurePrioritySupport": false,
    "featureAnalyticsExport": true,
    "featureCustomDomain": false,
    "createdAt": "2026-07-20T13:59:19.000Z",
    "updatedAt": "2026-07-20T13:59:19.000Z"
  }
}
```

##### Failure — Validation Error (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "price",
        "message": "Price must be non-negative"
      }
    ]
  }
}
```

---

### 4. Update Subscription Plan
`PATCH /api/v1/ops/plans/:planId`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Updates plan limits or pricing. Automatically propagates updated limits to the main database (`planLimitsCache`) for all active subscriber organizations.

#### Request Body
```json
{
  "price": 3499.00,
  "maxContestsPerCycle": 12
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan updated successfully.",
  "data": {
    "id": "plan_growth",
    "name": "Growth",
    "slug": "growth",
    "price": "3499",
    "maxContestsPerCycle": 12,
    "updatedAt": "2026-07-20T13:59:19.000Z"
  }
}
```

---

### 5. Evaluate Plan Edit Impact
`GET /api/v1/ops/plans/:planId/impact`

#### Purpose
Evaluates how many active tenant organizations will be affected before saving changes to a plan.

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan update impact evaluated.",
  "data": {
    "organizationCount": 27,
    "organizations": [
      { "id": "org_01HJ8E9234857239485723" }
    ]
  }
}
```

---

### 6. Deactivate Subscription Plan
`POST /api/v1/ops/plans/:planId/deactivate`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Soft-deactivates a plan (`isActive = false`). Existing subscribers retain their plan, but new assignments cannot select it.

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan deactivated successfully.",
  "data": null
}
```

---

## Subscription & Override Management APIs

### 7. Get Organization Subscription Details
`GET /api/v1/ops/organizations/:orgId/subscription`

#### Purpose
Fetches current subscription details, active plan specifications, effective limits breakdown (showing plan values vs. active overrides), active overrides, and historical plan switches.

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription details retrieved.",
  "data": {
    "subscription": {
      "id": "sub_01HJ8E4T991",
      "organizationId": "org_01HJ8E9234857239485723",
      "status": "ACTIVE",
      "currentPeriodStart": "2026-07-01T00:00:00.000Z",
      "currentPeriodEnd": "2026-08-01T00:00:00.000Z"
    },
    "plan": {
      "id": "plan_growth",
      "slug": "growth",
      "name": "Growth"
    },
    "effectiveLimits": {
      "maxContestsPerCycle": {
        "value": 20,
        "planValue": 10,
        "overridden": true
      },
      "maxParticipantsPerContest": {
        "value": 1000,
        "planValue": 1000,
        "overridden": false
      },
      "maxQuestionsPerContest": {
        "value": 50,
        "planValue": 50,
        "overridden": false
      },
      "maxOrgMembers": {
        "value": 5,
        "planValue": 5,
        "overridden": false
      }
    },
    "overrides": [
      {
        "id": "ov_01HJ992384723",
        "field": "maxContestsPerCycle",
        "value": 20,
        "reason": "Annual institutional hackathon allowance",
        "expiresAt": "2026-08-15T00:00:00.000Z",
        "createdAt": "2026-07-15T10:00:00.000Z"
      }
    ],
    "changeHistory": [
      {
        "id": "chg_01HJ881237",
        "fromPlanId": "plan_starter",
        "toPlanId": "plan_growth",
        "reason": "Upgraded by operator",
        "changedAt": "2026-07-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

### 8. Assign Initial Subscription Plan
`POST /api/v1/ops/organizations/:orgId/subscription`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Assigns an initial plan to an organization and syncs the main DB cache.

#### Request Body
```json
{
  "planId": "plan_growth"
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan assigned successfully.",
  "data": {
    "id": "sub_01HJ8E4T991",
    "organizationId": "org_01HJ8E9234857239485723",
    "planId": "plan_growth",
    "status": "ACTIVE",
    "currentPeriodStart": "2026-07-20T13:59:19.000Z",
    "currentPeriodEnd": "2026-08-19T13:59:19.000Z"
  }
}
```

---

### 9. Change Organization Subscription Plan
`POST /api/v1/ops/organizations/:orgId/subscription/change-plan`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Switches an organization's plan, records a `SubscriptionChangeLog` entry, updates `planSlug` and `planStatus` in the main DB, and updates `planLimitsCache`.

#### Request Body
```json
{
  "planId": "plan_scale",
  "reason": "Tier upgrade approved following volume growth."
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription plan changed successfully.",
  "data": {
    "id": "sub_01HJ8E4T991",
    "organizationId": "org_01HJ8E9234857239485723",
    "planId": "plan_scale",
    "status": "ACTIVE"
  }
}
```

---

### 10. Add Custom Limit Override
`POST /api/v1/ops/organizations/:orgId/subscription/overrides`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Grants a custom limit override to an organization (with optional expiration timestamp) and immediately updates the main DB `planLimitsCache`.

#### Request Body
```json
{
  "field": "maxContestsPerCycle",
  "value": 25,
  "reason": "Special event authorization",
  "expiresAt": "2026-08-31T23:59:59.000Z"
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription limit override added successfully.",
  "data": {
    "id": "ov_01HJ992384723_NEW",
    "subscriptionId": "sub_01HJ8E4T991",
    "field": "maxContestsPerCycle",
    "value": 25,
    "reason": "Special event authorization",
    "expiresAt": "2026-08-31T23:59:59.000Z",
    "createdAt": "2026-07-20T13:59:19.000Z"
  }
}
```

---

### 11. Remove Custom Limit Override
`DELETE /api/v1/ops/organizations/:orgId/subscription/overrides/:overrideId`

#### Purpose
Restricted to `SUPER_ADMIN` and `BILLING_ADMIN`. Soft-removes an active limit override (`removedAt = NOW()`), logs audit `override.removed`, and updates `planLimitsCache` in the main DB.

#### Request Body
```json
{
  "reason": "Special event concluded early."
}
```

#### Responses

##### Success (200 OK)
```json
{
  "success": true,
  "message": "Subscription limit override removed.",
  "data": {
    "id": "ov_01HJ992384723",
    "removedAt": "2026-07-20T13:59:19.000Z",
    "removedReason": "Special event concluded early."
  }
}
```
