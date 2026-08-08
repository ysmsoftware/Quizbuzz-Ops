# Subscription / Plan Usage Enforcement Audit

**Scope:** `quizbuzz-ops-next` (internal ops/billing backoffice) and `Quizbuzz-new` (the main application — the product your organizations actually use to run contests). No code was changed; this is read-only findings.

## One-line answer

The plan/subscription **data model exists and is well built** (plans, overrides, cycles, feature flags), but **none of it is enforced in the main application**. An organization on the cheapest plan can today create unlimited contests, register unlimited participants per contest, add unlimited questions, and invite unlimited org members — the same as an organization on the most expensive plan. The limits are computed and stored, but nothing ever reads them back at the point where a user tries to do the thing that should be limited.

## How the two systems are wired together

1. `quizbuzz-ops-next` owns plans (`server/features/plans`) and subscriptions (`server/features/subscriptions`), including per-org manual overrides (`OrganizationSubscription.overrides`, with expiry) and billing-cycle dates.
2. When a subscription is created/changed/renewed, `EntitlementsService.syncOrgPlanLimitsCache()` (`server/features/entitlements/entitlements.service.ts`) computes a snapshot — `maxContestsPerCycle`, `maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxOrgMembers`, and the boolean feature flags — and writes it as a JSON blob directly into the **main app's** database, via a raw cross-database SQL connection (`server/db/main-db-pool.ts` → `queryMainDb`), into `organizations.planLimitsCache` (plus `planSlug`, `planStatus`).
3. On the main app side (`Quizbuzz-new/backend`), `organization.service.ts` reads that same `planLimitsCache` column and returns it to the frontend's Settings → "Plan & Billing" tab (`PlanBillingTabContent.tsx`) for **display only**. The code comment in `entitlements.service.ts` itself says this explicitly: *"read-only display data... Not used for entitlement enforcement (the limits below are)"* — but that claim is not actually true anywhere downstream; nothing enforces the limits it refers to.
4. The only other integration point is plan selection at signup: `onboarding.service.ts` fetches the plan list from ops-next (`GET /api/v1/billing-portal/plans`) and hands off to ops-next's checkout for payment. That's it — a one-way, point-in-time data sync, not a live entitlement check.

So the enforcement gap isn't a missing endpoint on one side — it's that the main app was never wired to *consult* the cache (or any live entitlements API) before performing the actions that should be gated.

## What was checked in the main app, and what I found

| Action | Where it lives | Plan/limit check present? |
|---|---|---|
| Create contest | `backend/src/modules/contest/contest.service.ts:47` `createContest()` | No. Only checks `org.isActive`. No check against `maxContestsPerCycle`, no count of contests created in the current billing period at all. |
| Set/raise a contest's participant cap | `contest.service.ts:187-199` (`updateContest`) | Partial, but not plan-based: it only prevents lowering `maxParticipants` below the current registered count. An org can set `maxParticipants` to any number (10, 10,000, unlimited) regardless of their plan's `maxParticipantsPerContest` entitlement. |
| Register a participant | `contest.service.ts:475`, `participant.service.ts:70` `registerParticipant()` | Only enforces the contest's own self-declared `maxParticipants` field (a business feature the org sets per-contest) — never checked against the plan entitlement. |
| Create a question | `backend/src/modules/question/question.service.ts:50` `createQuestion()` | No check at all. |
| Bulk-import questions | `question.service.ts:55-63` `bulkCreateQuestions()` | Caps a single request to `config.questions.bulkImportLimit` — a global, env-driven, per-request batch size, unrelated to the plan's `maxQuestionsPerContest` and not a per-contest or per-org total. |
| Invite an org member | `backend/src/modules/organization/organization.service.ts:109` `inviteMember()` | No check against `maxOrgMembers` at all. |
| Anywhere else | `backend/src/middlewares/*` | Only `authenticated-org`, `authenticated-participant`, `idempotency`, `rate-limit`, and `error` middleware exist. There is no entitlement/plan/quota middleware in the request pipeline. |

## Dead / misleading configuration found

`backend/src/config/index.ts` defines a `limits` block (`maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxConcurrentContests`) sourced from env vars (`MAX_PARTICIPANTS_PER_CONTEST=10000`, `MAX_QUESTIONS_PER_CONTEST=200`, `MAX_CONCURRENT_CONTESTS=10` in `.env.example`). I grepped the entire backend for any reference to `config.limits` outside its own definition — there are none. This looks like it was scaffolded to be a platform-wide safety net (not even per-plan, just a global ceiling) and was never actually wired into any service. Worth knowing it exists so it isn't mistaken for a working safeguard.

## No usage tracking exists at all

Beyond the missing checks, there is no counter anywhere — in either codebase — for "contests created this billing cycle," "questions added this cycle," or similar. `contestRepo.countParticipants()` / `countQuestions()` exist but are used only for unrelated business rules (blocking a `maxParticipants` decrease below current registrations; requiring ≥1 question before publish). The ops-next side has zero occurrences of the word "usage" in its server code — `syncOrgPlanLimitsCache` only recomputes *entitlements* (the ceiling), never *consumption* (how much of the ceiling has been used). Even if enforcement were added tomorrow, there's no consumption data to enforce against yet for period-based limits like "2 contests per month" — that would need new counters, most naturally maintained in the main app's own DB (since that's where contests/participants/questions actually get created), reset per billing cycle using the `currentPeriodStart`/`currentPeriodEnd` already present in the cached payload.

Per-contest limits (`maxParticipantsPerContest`, `maxQuestionsPerContest`, `maxOrgMembers`) don't have this problem — they can be checked against a live `COUNT(*)` at write time without a separate counter table.

## Frontend

Checked the main app's frontend for any client-side gating (disabling "Create Contest" when a cycle limit is reached, disabling "Add Question" past the per-contest cap, etc.) — found none. `PlanBillingTabContent.tsx` only renders the cached limits as informational text/progress display; it doesn't disable or warn on any creation flow elsewhere in the app.

## Where enforcement should sit (assessment, not implemented)

Your instinct in the request is correct and matches how the rest of the main app already handles cross-cutting concerns: this belongs in the API layer as middleware/guards in `Quizbuzz-new/backend`, close to where `authenticated-org.middleware.ts` already runs, not in `quizbuzz-ops-next` (which has no visibility into real-time contest/participant/question counts — that data lives only in the main app's DB). Concretely, that means:

- A per-cycle check before `createContest` (needs a new counter, reset on `currentPeriodStart`/`currentPeriodEnd`).
- A per-contest check before raising `maxParticipants` or accepting a new registration, against `maxParticipantsPerContest`.
- A per-contest check before `createQuestion`/`bulkCreateQuestions` (aggregate, not the existing unrelated batch-size cap), against `maxQuestionsPerContest`.
- A check before `inviteMember` against `maxOrgMembers`.
- All four reading from `organizations.planLimitsCache` (already synced) rather than re-querying ops-next synchronously, since that column is already kept current — it just needs a reader, not a redesign.
- Blocked requests should return a clear 403/422 with the specific limit hit, plus a hook to fire a user-facing notification ("upgrade your plan") — both currently absent.

## Bottom line

The billing and plan-management machinery (ops-next) is solid. The gap is entirely on the consumption side: the main application never asks "is this org allowed to do this" before letting it happen. Every limit mentioned in your question — contests/month, participants/contest, questions/contest, and (not mentioned but same story) org members — is currently unenforced in production.
