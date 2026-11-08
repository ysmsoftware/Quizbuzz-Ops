# Plans API Specification

These endpoints manage the subscription plan catalogue: public plans on sale, private plans for a single customer, retired versions, and moving subscribers between plans. The public, on-sale list for checkout is `GET /api/v1/billing-portal/plans` (see [`billing-portal-api.md`](./billing-portal-api.md)).

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## Base Path
`/api/v1/ops/plans`

## Roles

| Endpoint | Super admin | Billing admin | Support |
|---|---|---|---|
| `GET` endpoints | Yes | Yes | Yes |
| Create, update, deactivate | Yes | Yes | No |
| Move subscribers (`/migrate`) | Yes | No | No |

## The catalogue on boot

On every boot, ops loads the tier-sheet catalogue (`server/features/plans/plan-catalogue.ts`), so the standard plans always exist with the agreed limits. The `free` plan is the default for every org and never lapses.

---

## The plan object

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `slug` | string | `slug` is unique, lowercase with hyphens |
| `description`, `currency` | string | `currency` defaults to `INR` |
| `kind` | `FREE` \| `STANDARD` \| `CUSTOM` | `CUSTOM`: account-managed. Owners can't cancel it or buy AI packs themselves |
| `isActive` | boolean | `false` once deactivated |
| `isSellable` | boolean | On sale to new customers. Defaults to **false** for plans made in ops. When it's off, ops can still assign the plan |
| `audience` | `ORGANIZER` \| `EDUCATION` \| `BUSINESS` \| `null` | Which tab of the owner's plan picker the plan appears on |
| `organizationId` | string \| `null` | Set: **private** to that one org. It never appears on the website, and only that org can buy it or be put on it |
| `allowsMonthly`, `allowsHalfYearly`, `allowsAnnual` | boolean | Cycles offered |
| `monthlyPrice`, `halfYearlyPrice`, `annualPrice` | number \| `null` | Rupees, before GST. Each cycle has its own price; annual isn't derived from monthly |
| `maxContestsPerCycle` | int \| `null` | Counted per calendar month of usage on every cycle. `null` = unlimited |
| `maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxOrgMembers` | int \| `null` | |
| `maxLearners` | int \| `null` | 0 = no learner portal |
| `maxCandidatesPerMonth` | int \| `null` | Business plans |
| `aiCreditsPerMonth` | int \| `null` | Monthly AI allowance |
| `commissionPercent` | 0–100 \| `null` | Published to the main app's cache. Payouts still use the global rate (per-contest commission is on hold) |
| `featureProctoring`, `featureCertBranding`, `featurePrioritySupport`, `featureAnalyticsExport`, `featureCustomDomain`, `featureLearnerGroups`, `featureGradebook`, `featureAmbassadorCampaigns`, `featureManualEmails` | boolean | Feature switches. In the main app they gate both the API and the matching feature flags |

---

## Endpoints

### 1. List plans
`GET /api/v1/ops/plans?includeInactive=true`

Returns every plan, including private ones and ones not on sale. Deactivated plans are included only with `includeInactive=true`. Each plan carries `organizationCount`, the number of live (not deleted) orgs on it.

---

### 2. Get a plan
`GET /api/v1/ops/plans/[planId]`

`404 NOT_FOUND` if it doesn't exist.

---

### 3. Create a plan
`POST /api/v1/ops/plans`

**Body:** the plan object's fields. `name` and `slug` are required. Defaults: `allowsMonthly: true`, `allowsAnnual: false`, `allowsHalfYearly: false`, `isSellable: false`, `kind: STANDARD`, and every feature `false`. Leaving out a limit, or sending `null`, means unlimited.

**Example: a private enterprise plan**

```json
{
  "name": "Enterprise – ABC College",
  "slug": "enterprise-abc-college",
  "kind": "CUSTOM",
  "organizationId": "01J…",
  "allowsMonthly": false,
  "allowsAnnual": true,
  "annualPrice": 250000,
  "maxContestsPerCycle": null,
  "maxParticipantsPerContest": 5000,
  "maxLearners": 3000,
  "featureProctoring": true,
  "featureLearnerGroups": true,
  "featureGradebook": true
}
```

**Errors:** `400` (validation; a cycle turned on without its price) · `409` (slug already used) · `403`.

---

### 4. Update a plan
`PATCH /api/v1/ops/plans/[planId]` (`PUT` is accepted too)

**Body:** any of the plan fields. Fields left out keep their current values. Defaults never reset a field on update.

- Limit and feature changes are pushed straight away to the cache of every org on the plan (check the impact first, §5).
- Price changes apply to new purchases and renewals by link. **Auto-debit mandates keep their amount**, because Razorpay can't change what a mandate charges. To move auto-debit customers to a new price, create a new plan and move them (§7).

---

### 5. Impact of a change
`GET /api/v1/ops/plans/[planId]/impact`

**Response `data`:** `{ "organizationCount": 12, "organizations": [{ "id": "…" }] }`. These are the live (not deleted) orgs on the plan, whose limits update when you save.

---

### 6. Deactivate a plan
`POST /api/v1/ops/plans/[planId]/deactivate`

Takes the plan off sale and out of the default list (`isActive: false`). Orgs already on it **stay on it**. Use §7 to move them.

---

### 7. Move subscribers to another plan
`POST /api/v1/ops/plans/[planId]/migrate` (**super admin only**)

Use it for a new plan version or a price change.

**Body:**

| Field | Type | Notes |
|---|---|---|
| `toPlanId` | string | Target plan. It must be active and not private |
| `when` | `renewal` \| `now` | `renewal`: each org switches at its own period end, so prepaid time keeps its price (stored as a scheduled change). `now`: switches immediately and keeps their dates |
| `dryRun` | boolean | default **true**: preview only |
| `reason` | string | required. Saved in the audit log and the scheduled change |

**Response `data`:**

```json
{
  "total": 40,
  "movable": 38,
  "skipped": 2,
  "byMethod": { "AUTO_DEBIT": 10, "PAY_ONLINE": 20, "OFFLINE": 8 },
  "autoDebitNeedingApproval": 10,
  "moved": 0
}
```

- `skipped`: orgs whose billing cycle the target plan doesn't offer. They're left for ops to move one by one.
- `autoDebitNeedingApproval`: with `when: renewal`, auto-debit orgs keep paying the old price until they approve a new mandate. The scheduled-change email asks them to.
- `moved`: `0` on a dry run. Otherwise, the number moved; one org's failure doesn't stop the rest.

Each moved org's owner gets the `SUBSCRIPTION_CHANGE_SCHEDULED` email (renewal), or their limits change at once (now). The move is recorded as `plan.subscribers_moved` in the audit log.

**Errors:** `409` (same plan; target inactive or private) · `404` · `403` (not a super admin).
