# Plan & Usage Enforcement — Full System Plan (for review, not yet implemented)

This is the design for everything requested: middleware-based enforcement on every request, real usage tracking, proper in-app UX (no raw 404/500s), stackable admin overrides ("plan + 1"), and two-way visibility between `quizbuzz-ops-next` (ops dashboard) and `Quizbuzz-new` (main app). Nothing in this document has been built yet — it's the blueprint to review before I touch code again.

---

## 1. Where things stand right now

The previous pass added real enforcement, but it lives inside service methods (`contest.service.ts`, `question.service.ts`, `organization.service.ts`), called manually at the top of each function. It works, but it isn't middleware, isn't logged anywhere, and the two dashboards don't reflect any of it yet. Digging deeper into both codebases for this request turned up more pre-existing scaffolding than the first audit found:

**`quizbuzz-ops-next` already has, and I will reuse rather than rebuild:**
- `SubscriptionOverride` model with `field`, `value`, `reason` (required), `createdById`, `expiresAt`, `removedAt`/`removedById`/`removedReason` — reason capture and audit trail already exist at the data layer.
- `writeAuditLogEntry(...)` calls on every plan/override mutation, feeding the existing Audit Log feature.
- A full override CRUD UI already built: `AddOverrideModal.tsx`, `RevokeOverrideModal.tsx`, `LimitOverridesTable.tsx`, `QuotaUsageGrid.tsx`, `ChangePlanModal.tsx`, `CurrentPlanCard.tsx` under `components/views/organization-subscription/`.
- A `UsageSnapshot` type and a `getUsageSnapshot()` function already wired into `QuotaUsageGrid`.

**But two things are broken in that existing scaffolding, and need fixing regardless of anything new:**
1. **Override semantics are "last one wins," not additive, and the winner is non-deterministic.** `entitlements.service.ts` and `subscriptions.service.ts` both build a `Map<field, value>` from all active overrides on a subscription — if two active overrides exist for the same field, whichever the DB happens to return last overwrites the other, with no `orderBy` in the entitlements sync query. The `AddOverrideModal` UI asks the admin to type the **new total** (e.g. "3"), not a delta — there is no "+1" concept anywhere today. This is the opposite of what you described (base plan + a bump, stacked, with the base preserved).
2. **`getUsageSnapshot()` is not scoped to the billing cycle and is wrong for the metric it's used for.** `contestsUsedThisCycle` is `getOrganizationContests(orgId).length` — every non-deleted contest the org has *ever* created, not contests created within `currentPeriodStart`–`currentPeriodEnd`. `participantsUsedThisCycle` sums participants across every contest ever, but is displayed against `maxParticipantsPerContest`, a *per-contest* limit — comparing an all-time total to a per-contest ceiling. `maxQuestionsPerContest` usage is hardcoded to `0` with a `// static metric` comment — never implemented.

**`quizbuzz-ops-next` also already has its own independent messaging pipeline — the right place for this, and confirms your instinct:** `server/features/messaging` (`MessagingService`, BullMQ `messageQueue`, `server/providers/email.provider.ts`, `server/providers/whatsapp.provider.ts`) plus a template registry at `server/templates/email.templates.ts` keyed off a Prisma enum, `OpsMessageTemplate`. This is entirely separate infrastructure from the main app's `MessagingService` (which only handles participant/contact-facing messages like registration confirmations). Two things worth knowing about it before we build on it:
- The enum **already has `SUBSCRIPTION_PLAN_CHANGED`** with a working builder in `email.templates.ts` (`"Your subscription has moved from X to Y"`) — but grepping the whole codebase, `enqueueMessage()` is never actually called from `subscriptions.service.ts`. The template renders correctly if you hit it directly, but nothing in `changePlan()` triggers it. Same story for `SUBSCRIPTION_PAST_DUE`, `SUBSCRIPTION_CANCELLED`, `ORG_SUSPENDED`, etc. — the templates and send pipeline exist, but no business-logic method calls `enqueueMessage()` automatically anywhere in the codebase. The only caller today is the manual "send a message" ops route (`POST /api/v1/ops/messaging/send`). So there is no existing precedent to copy for "resolve the org's admin email and auto-send" — that plumbing needs to be added, not just a new template.
- `enqueueMessage()` takes an explicit `recipient: string` — it does not look up the org admin's email itself. Whoever calls it has to resolve that first.

**`Quizbuzz-new` (main app) already has, and I will reuse:**
- A single choke-point HTTP client, `frontend/lib/api/apiClient.ts`, that already parses every non-2xx response into a typed `ApiRequestError` with `code`, `message`, `details`, `requestId`, `status`. This is the one place a global "plan limit" handler needs to hook in — no per-call-site changes needed.
- `sonner` (toast library) already installed.
- An `UpgradePromptModal` component already built (`components/features/organization/UpgradePromptModal.tsx`), and `PlanBillingTabContent.tsx` already renders plan name, price, billing cycle, and renewal date from `org.planLimitsCache` — it just doesn't show usage-vs-limit yet.
- No in-app notification/announcement system for org admins exists (only outbound participant/contact messaging via `MessagingService` + `MessageLog`). "Your plan was bumped by support" has nowhere to render today — this needs to be added.

So this isn't a from-scratch build on either side — it's: (a) move the enforcement I already wrote into middleware, (b) fix the two broken pieces above, (c) add the pieces that don't exist yet (notifications, real usage-in-cycle numbers, a request-level usage log).

---

## 2. Target architecture

### 2.1 Backend: enforcement as middleware (main app)

Today: `contest.service.ts::createContest()` calls `assertCanCreateContest()` internally. You asked for this to sit at the API gate as middleware instead, so it's visibly "each request is checked before it's allowed to do anything."

**Plan:** keep `src/common/plan-entitlements.ts` as the single source of truth for the actual limit math (no duplicated logic), but wrap each `assert*` function in an Express middleware and mount it directly on the route, ahead of the controller:

```
contestRouter.post("/", authenticatedOrgMiddleware, enforcePlanLimit("contestsPerCycle"), (req,res,next)=>ctrl().createContest(...));
contestRouter.patch("/:contestId", authenticatedOrgMiddleware, enforcePlanLimit("participantsPerContest", { fromBody: "maxParticipants" }), ...);
contestRouter.post("/register/:contestSlug", enforcePlanLimit("participantsPerContest", { fromContestSlug: true }), ...);
questionRouter.post("/contests/:contestId/assign", authenticatedOrgMiddleware, enforcePlanLimit("questionsPerContest", { countFromBody: "questions.length" }), ...);
organizationRouter.post("/:orgId/members/invite", authenticatedOrgMiddleware, enforcePlanLimit("orgMembers"), ...);
```

`enforcePlanLimit(limitType, opts)` is one generic middleware factory in `src/middlewares/plan-limit.middleware.ts`. It:
1. Resolves `organizationId` from `req` (already attached by `authenticatedOrgMiddleware`).
2. Calls the matching `assert*` from `plan-entitlements.ts`.
3. On pass: writes a `PlanUsageCheckLog` row (see §2.3) with `outcome: ALLOWED`, attaches `req.planUsage = { limitType, limit, current }` for the controller/response to optionally echo back, calls `next()`.
4. On `PlanLimitExceededError`: writes the same log with `outcome: BLOCKED`, and passes the error to `next(err)` — it still flows through the existing `error.middleware.ts`, so the response shape doesn't change from what's already built (`code: "PLAN_LIMIT_EXCEEDED"`, `limitType`, `limit`, `current`).

This satisfies "blocked via the API only, as middleware" literally, while not duplicating the counting logic that already exists and is already tested via `tsc`.

One thing this can't fully solve as a *generic* middleware: `assertCanCreateContest` needs the org id (available pre-controller), but `assertParticipantCapWithinPlan` on `updateContest` needs the request body's `maxParticipants`, and `assertCanAssignQuestions` needs `dto.questions.length` after validation. So `enforcePlanLimit` takes small option hints (`fromBody`, `countFromBody`) rather than being 100% one-size-fits-all — still generic, just parameterized per mount point.

### 2.2 Additive, stackable overrides (ops-next)

Redesign the override model so "base plan (2) + admin grant (+1) = 3" is explicit and correct, and fixes the nondeterminism bug at the same time.

**Data model change** (`quizbuzz-ops-next/prisma/schema.prisma`):
```prisma
enum OverrideMode {
  ADDITIVE   // value is a delta applied on top of whatever came before it
  ABSOLUTE   // value replaces the limit outright (legacy behavior, kept for admins who
             // genuinely want "set it to exactly N" rather than "add N")
}

model SubscriptionOverride {
  ...
  mode  OverrideMode @default(ADDITIVE)   // new column; existing rows backfilled to ABSOLUTE
  ...
}
```
Existing rows get backfilled to `ABSOLUTE` in the migration (preserves whatever behavior they already had — no silent change to live data). All *new* overrides default to `ADDITIVE` in the UI, matching your "existing plan plus one" example directly.

**Effective-limit calculation** (`entitlements.service.ts` and `subscriptions.service.ts`, both currently building a `Map` — replace with a fold):
```
effective = planBaseValue
for override in activeOverrides.orderBy(createdAt ASC):
    if override.mode == ADDITIVE:  effective += override.value
    if override.mode == ABSOLUTE:  effective  = override.value
```
Applying in creation order makes the result deterministic and matches "layer another grant on top of what's already there." An admin can now add a second `+1` later for a different reason and it stacks to base+2, each with its own reason/expiry/who-granted-it row — nothing is overwritten.

**UI change** (`AddOverrideModal.tsx`): replace the single "New Override Limit" number field with a toggle — "Add to current limit" (default, additive) vs. "Set exact limit to" (absolute) — and show the resulting total live as they type ("Current: 2 → New: 3"). `QuotaUsageGrid.tsx`'s `getEffectiveLimit()` needs the same fold logic instead of `.find()` (today it just grabs the *first* override for a field, which has the identical nondeterminism bug on the display side).

**Sync payload** (`entitlements.service.ts` → `organizations.planLimitsCache`): add the breakdown so the main app can show it too:
```json
{
  "maxContestsPerCycle": 3,
  "maxContestsPerCycleBase": 2,
  "maxContestsPerCycleOverrides": [
    { "delta": 1, "mode": "ADDITIVE", "reason": "Hackathon partnership", "expiresAt": null, "grantedByName": "Priya (Support)", "createdAt": "2026-08-01T..." }
  ],
  ...
}
```

### 2.3 Usage tracking that's actually tracked (not just recomputed)

Two distinct things were conflated in the request and are worth separating:
- **Enforcement** needs a live count at the moment of the request (already correct in `plan-entitlements.ts` — `COUNT(*) WHERE createdAt BETWEEN periodStart AND periodEnd`, etc.).
- **Visibility** (ops dashboard, main-app usage meters, "you've used 2/3") needs a place to *read* usage from without recomputing it expensively on every page load, and ideally a history of blocks so ops can see "this org hit its ceiling 4 times this week" rather than only a point-in-time count.

**New table in the main app** (`Quizbuzz-new/backend/prisma/schema.prisma`):
```prisma
model PlanUsageCheckLog {
  id             String   @id @default(ulid())
  organizationId String
  limitType      String   // "contestsPerCycle" | "participantsPerContest" | "questionsPerContest" | "orgMembers"
  outcome        String   // "ALLOWED" | "BLOCKED"
  limitValue     Int?     // null = unlimited at time of check
  currentValue   Int
  requestId      String?
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, limitType, createdAt])
  @@index([outcome, createdAt])
}
```
Written by the new `enforcePlanLimit` middleware (§2.1) on every check — this is the literal "each request is tracked" piece. To keep the table from growing unbounded on high-traffic ALLOWED checks, add a scheduled cleanup job (reuse the existing BullMQ worker infra) that prunes `ALLOWED` rows older than e.g. 90 days, keeping `BLOCKED` rows indefinitely (or much longer) since those are the ones ops actually cares about.

**Fix the existing `getUsageSnapshot()` in ops-next** to compute real, cycle-scoped numbers instead of the current all-time/mismatched approach — either via a new dedicated endpoint (`GET /api/v1/ops/organizations/[orgId]/usage`) that runs the same cycle-windowed counts the main app's enforcement uses (contests in `[periodStart, periodEnd]`, current participants for whichever contest is being viewed, current question count per contest, active member count), or by reading recent rows out of `PlanUsageCheckLog` via `queryMainDb` for the "how close are they to the ceiling right now" view plus a block-history sparkline.

### 2.4 Ops dashboard (`quizbuzz-ops-next`) — visibility + override changes

`QuotaUsageGrid.tsx` gets wired to the fixed, cycle-scoped usage numbers from §2.3 instead of the current buggy `getUsageSnapshot()`. Add a small "Recent limit hits" panel next to it, sourced from `PlanUsageCheckLog` (via a new ops API route reading the main DB), so a support rep looking at an org can see "blocked from creating a contest twice in the last 7 days" before deciding whether to grant an override — directly useful context for the override-granting workflow you described.

`AddOverrideModal` gets the additive/absolute toggle from §2.2. `LimitOverridesTable` gets a column showing whether each row is a `+delta` or an absolute set, alongside the reason/expiry/granted-by it already shows.

Nothing here needs new pages — it's the same `organization-subscription` tab, extended.

### 2.5 Main app frontend — no more raw errors, real feedback

**Global handling in `apiClient.ts`:** extend `ApiError`/`ApiRequestError` with the extra fields the backend already sends (`limitType`, `limit`, `current`) when `code === "PLAN_LIMIT_EXCEEDED"`. Add a small `PlanLimitProvider` (React context) mounted once near the app root that `apiClient` calls into via a module-level callback when it sees that code — this pops a `sonner` toast with the specific message ("Your plan allows a maximum of 2 contests per billing cycle...") and an **Upgrade** action button that opens the existing `UpgradePromptModal`. This means *every* call site automatically gets correct behavior with zero per-form changes — no component needs to know about plan limits to benefit from this.

This directly satisfies "should not show 404/500 — proper validation code should be seen, and an upgrade button." The structured code was already added in the previous pass; this wires it to something the user actually sees instead of it only existing in the network tab.

**Proactive (before-the-fact) UX**, not just reactive error toasts:
- `PlanBillingTabContent.tsx` gets a new "Usage this cycle" section using `QuotaUsageGrid`-equivalent bars (contests, participants-per-contest on the org's most active current contest, questions on the contest currently being edited, org members) with the same color thresholds ops-next already designed (green/amber/red at 75%/90%). Shows "Resets in 12 days (Sep 1)" computed from `planLimitsCache.currentPeriodEnd` — directly answers "usage is over, will reset after x days."
- The contest-create form (`app/org/contests/create`) checks current usage against `maxContestsPerCycle` on load (one lightweight call) and, if already at the ceiling, disables the submit button and shows an inline banner with the reset date and an Upgrade link — rather than letting them fill the whole form and only finding out on submit.
- Same pattern for the invite-member flow (`app/org/organization/team`) and the question-assignment screen: a small inline "X / Y used" indicator near the relevant action, sourced from the same usage data.

### 2.6 Plan-change messaging — triggered from ops-next, not the main app

You're right that this belongs in `quizbuzz-ops-next`: it already owns the subscription/override/billing tables, it's already where the mutation happens (`SubscriptionsService.addOverride/removeOverride/changePlan`), and it already has its own messaging pipeline (§1) — routing this through the main app would mean duplicating the trigger logic in a system that doesn't own the data being described. Two channels, both originating from ops-next, both fired from the same three service methods:

**Channel 1 — actual email, via ops-next's own messaging pipeline (new).**
1. Add new values to the `OpsMessageTemplate` enum in `quizbuzz-ops-next/prisma/schema.prisma`: `SUBSCRIPTION_LIMIT_OVERRIDE_ADDED`, `SUBSCRIPTION_LIMIT_OVERRIDE_REMOVED`. (`SUBSCRIPTION_PLAN_CHANGED` already exists for plan upgrades/downgrades — it just needs to actually be called, see step 3.)
2. Add matching builder functions to `server/templates/email.templates.ts`, following the existing `wrap()`/`escape()` pattern — e.g. for the override-added case: *"Hi {adminName}, our team has increased your {limitLabel} limit from {oldValue} to {newValue}. Reason: {reason}. This adjustment {expiresAt ? "expires on {expiresAt}" : "does not expire"}."*
3. In `subscriptions.service.ts`, after the existing `writeAuditLogEntry(...)` call in `addOverride()`, `removeOverride()`, and `changePlan()`, resolve the org's recipient and call `this.messagingService.enqueueMessage({ organizationId, channel: "EMAIL", template: ..., recipient, params: {...} })` — reusing the exact queue/provider/worker path that `BILLING_PAYMENT_SUCCESS` etc. already use, just finally wiring a caller to it.
4. **New piece needed:** a way to resolve "who do we email for this org." Nothing in ops-next does this today (see §1) — the only cross-DB reads it does are the ops-console list views. Add one small repository method, e.g. `findOrgOwnerContact(orgId)` in `organizations.repository.ts`, doing the same kind of `queryMainDb(...)` join ops-next already uses elsewhere: `organizations → org_members (role = OWNER, isActive) → admins (email, firstName)`. Recommendation: notify the OWNER only (matches how invites/billing emails already address "the admin"), not every member — flagged as decision D5 below if you'd rather notify all active admins.

**Channel 2 — in-app banner, via the existing `planLimitsCache` sync (no new pipeline, just a data field).** This is not "messaging" in the template/email sense — it's the same cross-DB JSON write ops-next already does on every subscription change (§2.2's sync payload). Add a `recentChange` field to that payload:
```json
"recentChange": {
  "kind": "override_added",
  "message": "Support increased your contests-per-month limit from 2 to 3.",
  "reason": "Hackathon partnership",
  "occurredAt": "2026-08-01T10:32:00Z"
}
```
The main app frontend shows this as a dismissible banner (top of the dashboard, and in the Plan & Billing tab) whenever `recentChange.occurredAt` is newer than a per-admin "last seen" timestamp. Dismissal state can be a simple `localStorage` entry (`planNoticeSeen:{orgId}:{occurredAt}`) for a fast first version, or a proper per-admin read-receipt if you want it to follow the admin across devices — see decision point D3 below.

Both channels are populated by the same three ops-next service methods and the same event — ops-next stays the single trigger point for both "you got an email" and "here's the banner in your dashboard" as you described, and the main app never initiates or owns any of this, it only renders what ops-next already decided happened.

---

## 3. Data model changes required

| Repo | Change | Reason |
|---|---|---|
| `quizbuzz-ops-next` | Add `mode: OverrideMode` enum column to `SubscriptionOverride`, default `ADDITIVE` for new rows, backfill existing rows to `ABSOLUTE` | Enables stacking; fixes nondeterministic "last one wins" bug |
| `Quizbuzz-new` (main) | New `PlanUsageCheckLog` table | Persists the "each request tracked" audit trail; feeds ops dashboard's usage/history view |
| `Quizbuzz-new` (main) | No schema change to `organizations.planLimitsCache` (still `Json?`) — only the *shape* of what ops-next writes into it changes (adds base/override breakdown + `recentChange`) | Reuses the existing sync pipeline; no migration needed on this piece |
| `quizbuzz-ops-next` | Add `SUBSCRIPTION_LIMIT_OVERRIDE_ADDED` + `SUBSCRIPTION_LIMIT_OVERRIDE_REMOVED` to the `OpsMessageTemplate` enum | New templates you noted don't exist yet; needed before ops-next can email an org about a limit change |

---

## 4. Phased rollout

1. **Phase 1 — Middleware refactor.** Move the four existing service-level checks into `plan-limit.middleware.ts`, mounted on routes. No behavior change from what's already live; purely structural, satisfies "checked via middleware." Add `PlanUsageCheckLog` + writes from the middleware.
2. **Phase 2 — Additive overrides.** Schema migration + `mode` column, fold-based effective-limit calc in both `entitlements.service.ts` and `subscriptions.service.ts`, `AddOverrideModal` additive/absolute toggle, `QuotaUsageGrid` fold fix.
3. **Phase 3 — Real usage numbers.** Fix `getUsageSnapshot()` to be cycle-scoped and metric-correct (or replace with the new `/usage` endpoint backed by `PlanUsageCheckLog` + live counts); wire ops-next's "recent limit hits" panel.
4. **Phase 4 — Main app UX.** `PlanLimitProvider` + toast/`UpgradePromptModal` wiring in `apiClient.ts`; usage bars in `PlanBillingTabContent`; proactive pre-submit checks on contest-create, invite-member, question-assign screens.
5. **Phase 5 — Cross-app notifications, triggered from ops-next.** New `OpsMessageTemplate` values + email builders; `findOrgOwnerContact()` lookup; `enqueueMessage()` calls added to `addOverride`/`removeOverride`/`changePlan`; `recentChange` field in the synced cache; dismissible banner in the main app reading it.

Each phase is independently shippable and testable — Phase 1 alone already gets you "properly tracked via middleware," and each subsequent phase is additive on top.

---

## 5. Open decisions for you to weigh in on before I build

**D1 — Override mode default.** Recommended: default new overrides to `ADDITIVE` with an explicit toggle to switch to `ABSOLUTE` per-override (as designed above), so both your "+1" mental model and a rarer "just set it to exactly N" case are covered without two separate UIs. Alternative: make it *always* additive and drop the absolute option entirely — simpler, but removes the ability to reset an org to a specific number without doing the arithmetic in your head.

**D2 — Usage-check logging volume.** Recommended: log every check (allowed and blocked) into `PlanUsageCheckLog`, with a scheduled prune of old `ALLOWED` rows (keep ~90 days) while keeping `BLOCKED` rows long-term. Alternative: only log `BLOCKED` outcomes — much smaller table, but ops loses the ability to see "usage crept up to 90% three days before it actually blocked them," which is useful for proactive outreach.

**D3 — Cross-app notification durability.** Recommended for a fast first version: `localStorage`-based dismissal (no new table, ships in Phase 5 quickly). Alternative: a proper `PlanNoticeReceipt` table keyed by admin id so "seen" state follows the admin across browsers/devices and survives clearing local storage — more correct, adds a migration + a bit more plumbing.

**D4 — Where the per-cycle contest count resets.** Confirming current design: the count resets automatically because it's `COUNT(contests WHERE createdAt BETWEEN currentPeriodStart AND currentPeriodEnd)`, and `currentPeriodStart`/`currentPeriodEnd` themselves roll forward whenever ops-next renews/changes the subscription. If a subscription lapses (e.g. payment fails) and `currentPeriodEnd` stops advancing, usage would appear "stuck" at whatever the last valid period was — worth confirming that's the intended fallback rather than something that needs its own handling.

**D5 — Who gets the override/plan-change email.** Recommended: the org's OWNER only (one recipient, matches the pattern existing templates like billing emails already imply — "the admin"). Alternative: every active `OrgMember` on the org (owners + regular admins), which is more visible but means `findOrgOwnerContact()` becomes `findOrgAdminContacts()` returning a list, and `enqueueMessage()` gets called once per recipient.

Let me know which way you want D1–D5 to go (or if the recommended defaults are fine), and flag anything in the architecture itself you'd rather do differently — then I'll build it phase by phase.
