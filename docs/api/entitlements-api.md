# Entitlements & Limit Sync Engine

Ops works out what each organization may do, then writes the result into the main app's database. The main app never asks ops at request time: it reads the cached limits from the org row and compares dates itself, so a late job or an ops outage can't lock anyone out or let anyone slip through.

There is no HTTP endpoint here. The sync runs inside ops (`server/features/entitlements/entitlements.service.ts`) and writes straight to the main database.

**Last checked:** 2026-11-08 (`feature/subscriptions`).

---

## How limits are resolved

For each limit, the first of these that applies wins:

1. **Active custom override.** Not removed, not expired. `ADDITIVE` overrides stack on top of the plan's limit; `ABSOLUTE` ones replace it. `null` means unlimited.
2. **The plan's own limit**, from the org's subscription.
3. **Free limits**, when the subscription has `EXPIRED`. The plan is swapped for the Free plan, but active overrides still apply on top. A lapsed org keeps CSV export so it can always get its own data out.

Feature switches are on or off, not stackable, so the last active override for a feature wins; with none, the plan's switch decides.

An org with no cache at all gets the Free limits in the main app (2 contests a month, 100 participants, 25 questions, 1 member, 0 learners). It does **not** get unlimited use. The hourly job also creates a Free subscription row for any org that lacks one.

---

## What ops writes

The main app's `organizations` row gets three columns:

| Column | Value |
|---|---|
| `planSlug` | The plan's slug |
| `planStatus` | `ACTIVE`, `PAST_DUE`, `RESTRICTED`, `EXPIRED` or `CANCELLED` |
| `planLimitsCache` | The JSON below |

### The `planLimitsCache` payload

```json
{
  "billingCycle": "MONTHLY",
  "periodMonths": 1,
  "currentPeriodStart": "2026-11-08T00:00:00.000Z",
  "currentPeriodEnd": "2026-12-08T00:00:00.000Z",
  "planKind": "STANDARD",
  "restrictAt": "2026-12-15T00:00:00.000Z",
  "downgradeAt": "2027-01-07T00:00:00.000Z",
  "maxContestsPerCycle": 10,
  "maxParticipantsPerContest": 500,
  "maxQuestionsPerContest": 100,
  "maxOrgMembers": 5,
  "maxLearners": 0,
  "maxCandidatesPerMonth": null,
  "aiCreditsPerMonth": 1000,
  "commissionPercent": null,
  "aiTopUpCredits": 2000,
  "features": {
    "proctoring": true,
    "certBranding": true,
    "prioritySupport": false,
    "analyticsExport": true,
    "customDomain": false,
    "learnerGroups": false,
    "gradebook": false,
    "ambassadorCampaigns": false,
    "manualEmails": true
  },
  "computedAt": "2026-11-08T11:48:00.000Z"
}
```

---

## Field specifications

| Field | Type | Meaning |
|---|---|---|
| `billingCycle`, `periodMonths` | string, int | What the org bought |
| `currentPeriodStart`, `currentPeriodEnd` | ISO datetime | The paid period. The start anchors each month of usage |
| `planKind` | `FREE` \| `STANDARD` \| `CUSTOM` | |
| `restrictAt` | ISO datetime \| `null` | From this moment nothing new can be created. The earlier of: period end plus grace days, and the oldest overdue invoice's due date plus grace days. `null` on Free, and once expired |
| `downgradeAt` | ISO datetime \| `null` | When Free limits replace the plan's. `null` on Free |
| `maxContestsPerCycle` | int \| `null` | Contests per month of usage, on every billing cycle. `null` = unlimited |
| `maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxOrgMembers` | int \| `null` | |
| `maxLearners` | int \| `null` | `0` = no learner portal |
| `maxCandidatesPerMonth` | int \| `null` | Business plans |
| `aiCreditsPerMonth` | int \| `null` | Monthly AI allowance |
| `aiTopUpCredits` | int | Credits from top-ups that haven't expired. The AI module subtracts what's been used: monthly allowance first, then top-ups, oldest first |
| `commissionPercent` | number \| `null` | Plan's commission. Published, but **payouts still use the global rate**: per-contest commission is on hold |
| `features.*` | boolean | Nine switches: `proctoring`, `certBranding`, `prioritySupport`, `analyticsExport`, `customDomain`, `learnerGroups`, `gradebook`, `ambassadorCampaigns`, `manualEmails`. A key missing from an older cache counts as allowed until the next sync adds it |
| `computedAt` | ISO datetime | When ops wrote it |

---

## How the main app enforces it

The main app reads the cache in `src/common/plan-entitlements.ts` and compares `restrictAt` and `downgradeAt` with the current time on each request.

- **When restricted, these are blocked:** creating or publishing a contest, adding or assigning questions, assigning participants, inviting members, granting learner access, AI generation.
- **Never blocked, in any state:** joining, taking, submitting and reconnecting; scheduled or published contests running; public registration for an already-open contest; evaluation, results, leaderboards and certificates; learner portal login; viewing and exporting the org's own data; the Billing page; logging in.
- **A downgrade removes nothing.** Over-limit data stays; only new additions are blocked.
- **Feature gates:** a plan's feature switch also turns off the matching feature flag, so a plan without Learner Groups can't use them. An org-level override set in ops beats the plan.
- **Log-only mode:** while the ops flag `plan_enforcement` is **off**, nothing is refused. Each refusal is logged as `WOULD_BLOCK` in `plan_usage_check_logs`. When it's on, the request is refused with `PLAN_LIMIT_EXCEEDED` (see the main app's `backend/docs/billing_api.md`).

---

## When the sync runs

`syncOrgPlanLimitsCache(orgId)` runs after every change that can alter an org's limits:

| Trigger | Where |
|---|---|
| Plan assigned or changed, now or at the period end | `subscription`, `subscription/change-plan`; scheduled changes applied by the hourly job |
| Plan moved with "Move subscribers" | `plans/[planId]/migrate` |
| Plan edited (limits, features) | `PATCH /plans/[planId]`: every org on the plan |
| Override added or removed | `subscription/overrides` |
| Override expired | `jobs/override-expiry.job.ts` |
| Access dates, grace days or contract changed | `subscription/access` |
| Invoice paid, voided, or credited | `invoices.service.ts`, `credit-notes.ts` |
| Checkout payment, auto-debit charge, mandate change | the Razorpay webhook, `autodebit.service.ts` |
| Owner cancels, resumes or stops auto-debit | `billing-account.ts` |
| AI credits bought or given | `ai-credits.ts` |
| Event Pass booking provisioned or cancelled | `event-pass-grants.ts` |
| **Hourly reconciliation** | `jobs/subscription-reconciliation.job.ts`: moves each status to match its dates, then re-syncs every subscription |

The hourly re-sync heals any cache write that failed earlier and picks up plan edits. A sync that still fails there is counted and recorded in the audit log as `subscription.cache_sync_failed`.

---

## Feature flags are a separate path

Feature flags aren't part of the cache. Ops mirrors every flag and org override into the main app's `platform_feature_flags` and `organization_feature_flag_overrides` tables when they change. Billing-related flags (`plan_enforcement`, `auto_debit`, `ai_top_ups`, `razorpay_gateway_active`) are described in [`feature-flags-api.md`](./feature-flags-api.md).
