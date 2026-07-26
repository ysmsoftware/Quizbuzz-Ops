# Plans API Specification

The Plans API domain manages subscription tiers, feature flags, contest/participant quotas, price configurations, plan updates, deactivations, and impact evaluations.

---

## Base Path
`/api/v1/ops/plans`

---

## Endpoints

### 1. List Subscription Plans
`GET /api/v1/ops/plans`

- **Purpose**: Fetch all subscription plans available on the platform.
- **Description**:
  Queries subscription plans from the Ops database. By default returns only active plans; optional query parameter `includeInactive=true` includes deactivated plans.

#### Request Parameters
- **Query Parameters**:
  - `includeInactive` (boolean, optional, default: `false`) - Include deactivated plans in result.
- **Headers**:
  - `Cookie`: Session containing valid `ops_access_token` JWT.

#### Request Body
None.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "pln_starter",
      "name": "Starter Plan",
      "slug": "starter",
      "description": "Essential tier for small contest organizers.",
      "price": 0,
      "currency": "INR",
      "billingCycle": "MONTHLY",
      "maxContestsPerCycle": 2,
      "maxParticipantsPerContest": 100,
      "maxQuestionsPerContest": 30,
      "maxOrgMembers": 2,
      "featureProctoring": false,
      "featureCertBranding": false,
      "featurePrioritySupport": false,
      "featureAnalyticsExport": false,
      "featureCustomDomain": false,
      "isActive": true
    },
    {
      "id": "pln_pro",
      "name": "Pro Business",
      "slug": "pro",
      "description": "Advanced tools for growing organizations.",
      "price": 4999,
      "currency": "INR",
      "billingCycle": "MONTHLY",
      "maxContestsPerCycle": 15,
      "maxParticipantsPerContest": 2500,
      "maxQuestionsPerContest": 150,
      "maxOrgMembers": 10,
      "featureProctoring": true,
      "featureCertBranding": true,
      "featurePrioritySupport": true,
      "featureAnalyticsExport": true,
      "featureCustomDomain": false,
      "isActive": true
    }
  ],
  "message": "Subscription plans retrieved."
}
```

##### Failure States
- **`401 Unauthorized`**: Authentication token missing or invalid.

---

### 2. Get Subscription Plan Detail
`GET /api/v1/ops/plans/[planId]`

- **Purpose**: Retrieve full configuration and limit specs for a single subscription plan by ID.
- **Description**:
  Fetches details for the specified plan ID. Returns HTTP 404 if plan does not exist.

#### Request Parameters
- **Path Parameters**:
  - `planId` (string, required) - Plan ID.

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "pln_pro",
    "name": "Pro Business",
    "slug": "pro",
    "price": 4999,
    "currency": "INR",
    "billingCycle": "MONTHLY",
    "maxContestsPerCycle": 15,
    "maxParticipantsPerContest": 2500,
    "maxQuestionsPerContest": 150,
    "maxOrgMembers": 10,
    "featureProctoring": true,
    "featureCertBranding": true,
    "featurePrioritySupport": true,
    "featureAnalyticsExport": true,
    "featureCustomDomain": false,
    "isActive": true
  },
  "message": "Subscription plan details retrieved."
}
```

##### Failure States
- **`404 Not Found`**: Subscription plan not found.

---

### 3. Create Subscription Plan
`POST /api/v1/ops/plans`

- **Purpose**: Create a new subscription tier with specified quotas and feature flags.
- **Description**:
  Persists a new plan definition. Writes an audit log entry for plan creation.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "name": "Enterprise Plus",
  "slug": "enterprise-plus",
  "description": "Unlimited capacity for top tier universities and brands.",
  "price": 19999,
  "currency": "INR",
  "billingCycle": "MONTHLY",
  "maxContestsPerCycle": null,
  "maxParticipantsPerContest": null,
  "maxQuestionsPerContest": null,
  "maxOrgMembers": 50,
  "featureProctoring": true,
  "featureCertBranding": true,
  "featurePrioritySupport": true,
  "featureAnalyticsExport": true,
  "featureCustomDomain": true
}
```

#### Responses

##### Success State (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "pln_ent_plus",
    "name": "Enterprise Plus",
    "slug": "enterprise-plus",
    "price": 19999,
    "isActive": true
  },
  "message": "Subscription plan created."
}
```

##### Failure States
- **`403 Forbidden`**: Role is not `SUPER_ADMIN` or `BILLING_ADMIN`.
- **`400 Bad Request`**: Validation error in provided plan fields.

---

### 4. Update Subscription Plan
`PUT /api/v1/ops/plans/[planId]` or `PATCH /api/v1/ops/plans/[planId]`

- **Purpose**: Modify pricing, limits, or feature flags of an existing subscription plan.
- **Description**:
  Updates specified fields of the plan. Triggers background sync to update Redis limit caches for all active subscriber organizations.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Request Body
```json
{
  "price": 5499,
  "maxParticipantsPerContest": 3000
}
```

#### Responses
```json
{
  "success": true,
  "data": {
    "id": "pln_pro",
    "name": "Pro Business",
    "price": 5499,
    "maxParticipantsPerContest": 3000
  },
  "message": "Subscription plan updated successfully."
}
```

---

### 5. Evaluate Plan Update Impact
`GET /api/v1/ops/plans/[planId]/impact`

- **Purpose**: Calculate how many active subscriber organizations will be affected by a plan modification.
- **Description**:
  Queries subscriber database to return total active organizations assigned to `planId`, monthly revenue impact, and affected active contests.

#### Responses
```json
{
  "success": true,
  "data": {
    "planId": "pln_pro",
    "affectedOrganizationsCount": 42,
    "currentMRR": 209958,
    "projectedMRR": 230958
  },
  "message": "Subscription plan update impact evaluated."
}
```

---

### 6. Deactivate Subscription Plan
`POST /api/v1/ops/plans/[planId]/deactivate`

- **Purpose**: Deactivate a plan to prevent new signups while preserving active subscribers.
- **Description**:
  Sets `isActive = false` on the specified plan. Existing subscriber organizations remain unaffected until their billing cycle renews.
  Requires `SUPER_ADMIN` or `BILLING_ADMIN` role.

#### Responses
```json
{
  "success": true,
  "data": null,
  "message": "Subscription plan deactivated successfully."
}
```
