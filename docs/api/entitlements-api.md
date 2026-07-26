# Entitlements & Limit Sync Engine API Specification

The Entitlements domain powers feature flag evaluations, quota computation (combining base subscription plan limits with active custom overrides), and real-time synchronization with the main application database cache.

---

## Service Architecture Overview

The Entitlements engine evaluates organization limits using the following resolution priority:
1. **Active Custom Override**: Highest precedence. If an unexpired limit override exists for `field`, its value overrides the base plan.
2. **Base Subscription Plan**: Fallback precedence. Evaluated from the organization's current active subscription plan.

---

## Core Operations & Data Models

### 1. Entitlement Limit Computation Payload

When entitlements are synchronized for an organization (`syncOrgPlanLimitsCache`), the engine computes and caches the following payload in PostgreSQL (`organizations.plan_limits_cache`):

```json
{
  "maxContestsPerCycle": 15,
  "maxParticipantsPerContest": 5000,
  "maxQuestionsPerContest": 150,
  "maxOrgMembers": 10,
  "features": {
    "proctoring": true,
    "certBranding": true,
    "prioritySupport": true,
    "analyticsExport": true,
    "customDomain": false
  },
  "computedAt": "2026-07-26T11:48:00.000Z"
}
```

---

## Field Specifications

| Field Name | Type | Description | Override Precedence |
| :--- | :--- | :--- | :--- |
| `maxContestsPerCycle` | `number \| null` | Max contests an organization can host per billing cycle (`null` = unlimited). | Custom Override > Plan Default |
| `maxParticipantsPerContest` | `number \| null` | Max participants permitted per contest (`null` = unlimited). | Custom Override > Plan Default |
| `maxQuestionsPerContest` | `number \| null` | Max questions allowed per contest template (`null` = unlimited). | Custom Override > Plan Default |
| `maxOrgMembers` | `number \| null` | Max team members allowed in organization portal (`null` = unlimited). | Custom Override > Plan Default |
| `features.proctoring` | `boolean` | AI proctoring & webcam monitoring feature flag. | Custom Override > Plan Default |
| `features.certBranding` | `boolean` | Custom certificate logo & branding feature flag. | Custom Override > Plan Default |
| `features.prioritySupport` | `boolean` | Priority customer support queue SLA feature flag. | Custom Override > Plan Default |
| `features.analyticsExport` | `boolean` | Raw CSV/Excel analytics export feature flag. | Custom Override > Plan Default |
| `features.customDomain` | `boolean` | Custom domain mapping feature flag. | Custom Override > Plan Default |

---

## Trigger Events for Cache Invalidation & Sync

The entitlements cache synchronization (`syncOrgPlanLimitsCache(orgId)`) is automatically triggered by the system during the following actions:

1. **Subscription Plan Upgrade / Downgrade** (`POST /api/v1/ops/organizations/[orgId]/subscription/change-plan`)
2. **Custom Override Addition** (`POST /api/v1/ops/organizations/[orgId]/subscription/overrides`)
3. **Custom Override Expiration or Removal** (`DELETE /api/v1/ops/organizations/[orgId]/subscription/overrides/[overrideId]`)
4. **Subscription Plan Specification Modification** (`PUT /api/v1/ops/plans/[planId]`)
5. **Organization Reactivation / Status Change** (`POST /api/v1/ops/organizations/[orgId]/reactivate`)

---

## Main Database Sync Output

Upon synchronization, the main database `organizations` record is updated with:
- `plan_slug`: Current plan slug (`starter`, `pro`, `enterprise-plus`, etc.).
- `subscription_status`: `ACTIVE`, `PAST_DUE`, `SUSPENDED`, or `CANCELLED`.
- `plan_limits_cache`: Stringified JSON entitlement limit payload.
