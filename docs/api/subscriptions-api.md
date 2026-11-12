# Subscriptions API Specification

Endpoints ops uses to manage one organization's subscription: its plan, scheduled changes, period and contract dates, limit overrides, reminders and free AI credits. Moving every subscriber of a plan is in [`plans-api.md`](./plans-api.md#7-move-subscribers-to-another-plan). Checkout is in [`billing-portal-api.md`](./billing-portal-api.md), and invoices and payments are in [`invoices-api.md`](./invoices-api.md).

After any change below, ops rewrites the org's `planLimitsCache` in the main app (see [`entitlements-api.md`](./entitlements-api.md)), and the change is written to the audit log.

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## Base Path
`/api/v1/ops/organizations/[orgId]/subscription`

## Roles

| Endpoint | Super admin | Billing admin | Support |
|---|---|---|---|
| `GET` | Yes | Yes | Yes |
| Every write | Yes | Yes | No |
| `graceDays` in `/access` | Yes | No | No |
| `POST /ai-credits` (free credits) | Yes | No | No |

A write without the right role returns `403 FORBIDDEN`. An unknown org returns `404`.

---

## Endpoints

### 1. Get subscription
`GET /api/v1/ops/organizations/[orgId]/subscription`

**Response `data`:**

```json
{
  "subscription": {
    "id": "…",
    "organizationId": "…",
    "status": "ACTIVE",
    "billingCycle": "MONTHLY",
    "periodMonths": 1,
    "currentPeriodStart": "2026-11-08T00:00:00.000Z",
    "currentPeriodEnd": "2026-12-08T00:00:00.000Z",
    "graceDays": 7,
    "collectionMethod": "AUTO_DEBIT",
    "autoDebit": { "id": "sub_…", "status": "active", "paymentMethod": "upi", "nextChargeAt": "2026-12-08T00:00:00.000Z" },
    "lastPaymentError": null,
    "scheduledChange": { "planId": "…", "billingCycle": "MONTHLY", "reason": "Owner chose it at checkout", "on": "2026-12-08T00:00:00.000Z" },
    "contractStart": null,
    "contractEnd": null,
    "poNumber": null,
    "contractNotes": null,
    "restrictAt": "2026-12-15T00:00:00.000Z",
    "downgradeAt": "2027-01-07T00:00:00.000Z"
  },
  "plan": { "id": "…", "slug": "pro-500", "name": "Pro 500", "kind": "STANDARD" },
  "effectiveLimits": { "maxContestsPerCycle": 10, "maxParticipantsPerContest": 500, "…": "…" },
  "overrides": [
    { "id": "…", "field": "maxParticipantsPerContest", "value": 500, "mode": "ADDITIVE", "reason": "Annual fest", "expiresAt": "2026-12-31T00:00:00.000Z", "createdAt": "…" }
  ],
  "changeHistory": [
    { "id": "…", "fromPlanId": "…", "toPlanId": "…", "reason": "Invoice INV/26-27/00012", "changedAt": "…" }
  ]
}
```

- `status`: `ACTIVE`, `PAST_DUE`, `RESTRICTED`, `EXPIRED` or `CANCELLED`.
- `collectionMethod`: `AUTO_DEBIT`, `PAY_ONLINE`, `OFFLINE` or `COMPLIMENTARY`.
- `plan.kind`: `FREE`, `STANDARD` or `CUSTOM`.
- `autoDebit`: the live Razorpay mandate, or `null` if there isn't one.
- `restrictAt`: when the org can no longer create new things if nothing is paid. It is the earlier of two dates: the period end plus grace, and the oldest overdue invoice's due date plus grace.
- `downgradeAt`: when Free limits take over. Both dates are `null` on Free.
- `scheduledChange.on` is the current period end.

`404` if the org has no subscription row. The hourly job creates a Free row for any org without one.

---

### 2. Assign a plan
`POST /api/v1/ops/organizations/[orgId]/subscription`

For an org with no subscription yet.

**Body:** `{ "planId": "…", "billingCycle"?: "MONTHLY" | "HALF_YEARLY" | "ANNUAL" }`

Starts a fresh period today and clears any pending change.
**Errors:** `404` (plan not found) · `409` (plan inactive) · `400`.

---

### 3. Change plan
`POST /api/v1/ops/organizations/[orgId]/subscription/change-plan`

**Body:**

| Field | Type | Notes |
|---|---|---|
| `planId` | string | required |
| `billingCycle` | `MONTHLY` \| `HALF_YEARLY` \| `ANNUAL` | optional. Keeps the current cycle if left out |
| `when` | `now` \| `period_end` | default `now` |
| `reason` | string | optional, saved in the audit log |

- **`now`**: switches immediately with a fresh period and clears any pending change.
- **`period_end`**: keeps the current plan until `currentPeriodEnd`, then switches. Stores `scheduledPlanId` / `scheduledBillingCycle` and emails the owner (`SUBSCRIPTION_CHANGE_SCHEDULED`). The message reads `Change scheduled for YYYY-MM-DD.`

Changing the plan never creates an invoice; issue one separately if money is owed.

How the hourly job applies a scheduled change:
- It keeps the dates, so the next payment is for the new plan.
- An auto-debit org waits for Razorpay's charge on the new plan. The job applies the change a day after the period end if no charge has arrived.
- Any payment for a plan clears a pending change.

**Response:** the subscription (as in §1).
**Errors:** `404` · `409` (plan inactive) · `400`.

---

### 4. Cancel a scheduled change
`DELETE /api/v1/ops/organizations/[orgId]/subscription/scheduled-change`

Drops the pending change; the org stays on its current plan.

**Response:** the subscription, with the message `Scheduled change cancelled.`

---

### 5. Update access and contract dates
`POST /api/v1/ops/organizations/[orgId]/subscription/access`

**Body** (send at least one field besides `reason`):

| Field | Type | Notes |
|---|---|---|
| `currentPeriodStart` | ISO datetime | Must stay before the end. Also where each month of usage starts counting |
| `currentPeriodEnd` | ISO datetime | "Paid until". Move it forward to extend access |
| `graceDays` | int 0–365 | **Super admin only** |
| `contractStart`, `contractEnd` | ISO datetime or `null` | The owner is reminded 60, 30 and 7 days before `contractEnd` |
| `poNumber` | string ≤ 100 or `null` | |
| `contractNotes` | string ≤ 2000 or `null` | |
| `reason` | string | required |

Status is recalculated from the new dates. For an auto-debit org this does **not** move Razorpay's charge date; the audit entry notes it.

**Response:** the subscription, with the message `Subscription access updated.`
**Errors:** `400` (no change, start not before end) · `403` (grace without super admin).

---

### 6. Add a limit override
`POST /api/v1/ops/organizations/[orgId]/subscription/overrides`

**Body:**

| Field | Type | Notes |
|---|---|---|
| `field` | string | A limit: `maxContestsPerCycle`, `maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxOrgMembers`, `maxLearners`, `maxCandidatesPerMonth`, `aiCreditsPerMonth`. Or a feature: `featureProctoring`, `featureCertBranding`, `featurePrioritySupport`, `featureAnalyticsExport`, `featureCustomDomain`, `featureLearnerGroups`, `featureGradebook`, `featureAmbassadorCampaigns`, `featureManualEmails` |
| `value` | int, `null` or boolean | Limits take a whole number, or `null` for unlimited. Features take `true` or `false` |
| `mode` | `ADDITIVE` \| `ABSOLUTE` | default `ADDITIVE` (added to the plan's limit). `ABSOLUTE` replaces it |
| `reason` | string | required |
| `expiresAt` | ISO datetime | optional |

How overrides behave:
- They take effect at once and survive a plan change.
- They stay on top of Free limits if the plan lapses.
- They also beat the plan's feature switches in the main app's feature flags.
- Overrides created by an Event Pass booking carry its `bookingId` and are removed when the booking is cancelled.

**Errors:** `400` (unknown field, wrong value type).

---

### 7. Remove an override
`DELETE /api/v1/ops/organizations/[orgId]/subscription/overrides/[overrideId]`

**Body:** `{ "reason"?: string }`. If left out, the reason defaults to "Manual removal".

---

### 8. Resend the renewal reminder
`POST /api/v1/ops/organizations/[orgId]/subscription/resend-reminder`

Emails the owner a renewal reminder now.
**Response `data`:** `{ "sent": true }`. `sent` is `false` if no owner contact was found.

---

### 9. Resend a payment receipt
`POST /api/v1/ops/organizations/[orgId]/payments/[paymentId]/resend-receipt`

**Response `data`:** `{ "sent": boolean }`.

---

### 10. AI credit top-ups
`GET /api/v1/ops/organizations/[orgId]/ai-credits`

Lists every top-up the org has had, bought or given, newest first (up to 50): `{ id, organizationId, credits, reason, expiresAt, invoiceId, createdById, createdAt }`.

`POST /api/v1/ops/organizations/[orgId]/ai-credits` (**super admin only**)

Gives free credits.

**Body:** `{ "credits": 1–1000000, "months"?: 1–24 (default 12), "reason": string }`

The credits are added to `aiTopUpCredits` in the main app's cache until they expire. Bought packs arrive the same way, when their invoice is paid.

---

### 11. Usage
`GET /api/v1/ops/organizations/[orgId]/usage`

Current usage against each limit, for the Quota usage grid.

---

## Related behaviour

| Event | Effect on the subscription |
|---|---|
| Org deleted (`DELETE /organizations/[orgId]`) | Auto-debit cancelled at once. The hourly job also cancels mandates of orgs deleted in the main app. Restoring the org doesn't bring the mandate back |
| Org suspended | No change. Auto-debit keeps running |
| Credit note with "End their access" | Auto-debit stopped; org moved to Free (see `invoices-api.md`) |
| Owner cancels from the Billing page | Status `CANCELLED`, auto-debit stopped, Free after the period end |
| Hourly job | Status from dates (Past due → Restricted → Expired), due scheduled changes, missed auto-debit charges, unauthorised mandates cancelled after 24 h, cache sync, invoice and contract reminders |
