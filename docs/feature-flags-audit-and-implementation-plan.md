# Feature Flags — Audit & Implementation Plan

Status: **Audit complete, plan revised. No code has been changed.** Every finding below was confirmed by reading the actual file (this repo and `Quizbuzz-new`), not inferred. This is a revision of the original plan following direct product-owner feedback: the original draft's per-flag, per-role `toggleableByRoles` RBAC proposal was **rejected** — feature-flag management now gates through the app's existing single `hasPermission()` action-table convention (one new action, `FEATURE_FLAG_MANAGE`), like every other mutating admin action. In its place, the real requirement surfaced: a **hybrid global + per-organization-override model**, where flags double as a lightweight per-org entitlement/add-on mechanism (enable a feature for one org without a redeploy), not just a platform-wide kill switch. §1 (new finding 1.10), §2, §3, §4, §5, §6, §7, §8, and §9 have all been revised accordingly; §1's original findings 1.1–1.9 and the overall phase structure otherwise stand. This is still a plan for you to review — implementation starts only after you approve it.

Scope: `components/views/FeatureFlagsView.tsx`, `lib/data/db.ts`, `lib/types.ts`, `lib/api/ops.ts`, `lib/hooks/useOps.ts`, `app/dashboard/flags/page.tsx`, `app/dashboard/layout.tsx`'s maintenance banner, `prisma/schema.prisma`, the `server/features/entitlements/*` and `server/features/plans/*` precedent modules, `docs/ops-dashboard-prd.md`, and — on the `Quizbuzz-new` side — `backend/src/config/index.ts`, the three real `config.features.proctoring` call sites, and `backend/prisma/schema.prisma`.

---

## 0. Headline finding, stated plainly

Feature flags in this product are **a single-tab-local illusion of a platform control**. `toggleFlag()` writes to `localStorage` under one browser profile. There is no Prisma model, no API route, and no server code anywhere named "feature flag" that isn't either the enum value `FEATURE_FLAG` sitting unused in `AuditTargetType`, or the frontend mock. Two different admins looking at `/dashboard/flags` in two different browsers are looking at two different, silently-diverging worlds — and neither world has ever, at any point, changed what the actual QuizBuzz product (`Quizbuzz-new`) does. The "CRITICAL ACTION: This immediately suspends all active operations... across every single tenant organization" confirmation-modal copy in `FeatureFlagsView.tsx:79` is describing a capability that has never existed. I confirmed this by grepping all of `Quizbuzz-new` for `maintenance` (backend + frontend, excluding build output): **zero matches**. There is nothing to suspend.

The one piece of genuinely good news: three of the six mock flags (`proctoring_enabled_platform_wide`, `enhanced_analytics_pipeline`, `certificate_auto_delivery`) already have *real, working* equivalents in `Quizbuzz-new` — but as boot-time environment variables (`ENABLE_PROCTORING`, `ENABLE_ANALYTICS`, `ENABLE_CERTIFICATES`), not as anything an admin can flip at runtime. This plan's job is to give the ops dashboard's toggle a real destination, and to decide how those two worlds (env-var flags that already gate real code, and a new DB-backed system) reconcile.

Findings are ranked by how much they block the "this is a real, working feature-flag system" goal — not by security severity, since none of this is exploitable (there's no server surface yet to exploit).

---

## 1. Findings

### 1.1 CRITICAL — No Prisma model, no database row, no server round-trip at all

**Files**: `lib/data/db.ts:30-91` (`INITIAL_FEATURE_FLAGS`), `lib/data/db.ts:100-157` (`getDatabase`/`saveDatabase`, `localStorage.getItem('quizbuzz_super_admin_mock_db')`).

**Current behavior**: `getFeatureFlags()` and `toggleFeatureFlag()` in `lib/api/ops.ts:21-65` never call `fetch`. They read/write a JSON blob keyed `quizbuzz_super_admin_mock_db` in the browser's `localStorage`, seeded from six hardcoded `FeatureFlag` objects. `prisma/schema.prisma` has **no `FeatureFlag` model** — the only trace of the concept in the schema is `AuditTargetType.FEATURE_FLAG` (line 40), an enum value that exists purely so a *future* real implementation has somewhere to point its audit entries; grepping the whole repo for `FEATURE_FLAG` (server code, not just the enum declaration) turns up nothing else — it is written by zero code paths today.

**Compare to**: every other domain in this dashboard that has graduated past mock status — `SubscriptionPlan`, `PlatformAuditLog`, `ContestBooking`, `PricingConfig` — has a real model in `prisma/schema.prisma`. Feature flags are the one dashboard-visible domain (besides infra/scaling, which are explicitly Phase 5/6 per the PRD) with literally no persistence layer.

**Outcome needed**: a `FeatureFlag` Prisma model, migration, and seed (§2).

---

### 1.2 CRITICAL — No API routes exist under `app/api/v1/`

**File**: full `app/api/v1/` tree (66 route files enumerated). None reference flags, flag, or toggle.

**Current behavior**: contrast with `plans` (`app/api/v1/ops/plans/route.ts`, `[planId]/route.ts`, `[planId]/deactivate/route.ts`, `[planId]/impact/route.ts` — 4 files) or `audit-log` (1 file, but backed by a real repository/service/controller triad). Feature flags have exactly zero. `lib/api/ops.ts` imports `getDatabase`/`saveDatabase` directly from `lib/data/db.ts` — there is no HTTP boundary between the "API client" and the mock store at all, which means even the shape of a request/response envelope was never designed for this domain.

**Outcome needed**: `app/api/v1/ops/feature-flags/route.ts` and `app/api/v1/ops/feature-flags/[key]/route.ts`, following the exact controller/service/repository split used by `plans` and `entitlements` (§3, §4).

---

### 1.3 CRITICAL — Zero enforcement in either repo; the flags gate nothing

**Ops side**: `middleware.ts` (root, 68 lines) is a pure Edge-runtime request-ID logger — `console.log` plus header propagation, matcher `['/api/:path*']`. It has no knowledge of feature flags and could not cheaply acquire any (Edge runtime has no Node `pg`/Prisma client — the file's own comment block explains why Winston/Node-only code was deliberately kept out of it).

**Main app side (`Quizbuzz-new`)**: I searched the entire `Quizbuzz-new` repo (backend + frontend, excluding `node_modules`/`.next` build output) for `maintenance` — zero results. There is no maintenance-mode concept, no registration-pause concept, and no Razorpay-gateway-toggle concept anywhere in that codebase. Three of the six mock flags *do* have real counterparts, but as static env vars parsed once at boot in `backend/src/config/index.ts:140-144` (`ENABLE_PROCTORING`, `ENABLE_ANALYTICS`, `ENABLE_CERTIFICATES`, `ENABLE_NOTIFICATIONS`) and actually consumed at:
- `backend/src/modules/quiz/proctoring.service.ts:111` — `if (!config.features.proctoring) return;`
- `backend/src/workers/capture-metadata.worker.ts:67` — `if (config.features.proctoring && !isSnapshot)`
- `backend/src/modules/quiz/quiz.gateway.ts:267` — `if (!config.features.proctoring)`

These are real, working gates — but changing them today requires editing an env var and **restarting the process**. An ops-dashboard admin toggling "Platform-wide AI Proctoring" in the mock UI has never had any way to reach these three call sites.

**Outcome needed**: a cross-service enforcement design (§5) — this is the hard part of this plan, and where most of the remaining findings and open questions concentrate.

---

### 1.4 HIGH — RBAC gating is 100% client-side, ad hoc, and not wired through the app's own permission table

**File**: `components/views/FeatureFlagsView.tsx:48` (`const isSupport = admin?.role === 'SUPPORT';`), used at lines 64-67, 150-160, 209, 227-232.

**Current behavior**: the only gate is a locally-declared boolean checking one role against a hardcoded string. Compare to `lib/hooks/useAuth.ts:46-63`'s `hasPermission(action)` — the app's actual permission-table convention, used elsewhere for `BILLING_REFUND`, `PLAN_UPDATE_PRICING`, `PLAN_UPDATE`, `ORG_DELETE`, `BILLING_VIEW`. There is no `FEATURE_FLAG_TOGGLE` (or similar) action in that switch statement at all — feature flags were never plumbed into the shared permission model, they got their own bespoke one-off check.

**Also note**: because there is no server, this client-side check is not actually a security boundary today — it's UX only. Nothing stops a `SUPPORT` admin from calling `toggleFeatureFlag('maintenance_mode', true)` directly from the browser console; the mock function has no role check of its own (`lib/api/ops.ts:27-65`).

**A real discrepancy worth flagging now**: `docs/ops-dashboard-prd.md` §4 lists feature-flag management explicitly only under **SUPER_ADMIN**'s capabilities ("Full access... feature flags..."). It is *not* listed under `BILLING_ADMIN`'s capabilities. But `FeatureFlagsView.tsx:156` tells `SUPPORT` users: "Toggling ... is strictly limited to **SUPER_ADMIN** and **BILLING_ADMIN** roles" — implying `BILLING_ADMIN` can toggle, which the PRD doesn't actually grant. Since `isSupport` is the *only* check, `BILLING_ADMIN` today falls through to "can toggle everything," matching the UI copy but not the PRD. This is now resolved (not left as an open question, per §1.10) — see §7: `FEATURE_FLAG_MANAGE` is granted to `SUPER_ADMIN` only, matching the PRD, and the UI copy's `BILLING_ADMIN` claim is corrected as part of the RBAC rewrite.

**Outcome needed**: gate via the existing `hasPermission()` action-table convention (`lib/hooks/useAuth.ts:46-63`) with one new action, `FEATURE_FLAG_MANAGE` — **not** a new per-flag role-list system. See §1.10 for why this supersedes the per-flag RBAC idea floated in the original draft, and §7 for the full revised RBAC design (one flat permission check for the whole feature-flags domain, global toggles and org overrides alike).

---

### 1.5 MEDIUM — "Critical flag" status is a hardcoded key list, not data

**File**: `FeatureFlagsView.tsx:71-96` (confirmation-modal branching) and `:165` (`isEmergency = flag.key === 'maintenance_mode' || flag.key === 'new_registrations_paused'`).

**Current behavior**: the confirmation-modal UX (the `type: 'critical' | 'warning'` distinction, the amber "emergency" card styling, the extra confirm-dialog step) only fires for two specific, string-literal-matched keys. Adding a new dangerous flag (e.g., a future `disable_paid_contest_publishing`, explicitly named in PRD §5.10) would require an engineer to edit this component's `if` chain — the point of a "just add a DB row" flag system is defeated if the danger-level UX is hardcoded per key.

**Outcome needed**: a `severity` column on the `FeatureFlag` row (§2) that `FeatureFlagsView.tsx` reads instead of hardcoded key comparisons.

---

### 1.6 MEDIUM — Audit trail for flag toggles is a second, parallel, localStorage-only mock — not the real audit log

**Files**: `lib/api/ops.ts:53-60` calls `writeAuditLogEntry(...)` from `lib/api/auditLog.ts:97-123` — **not** `server/audit/audit-writer.ts`. `lib/api/auditLog.ts:91-96`'s own comment says it plainly: *"Mock-domain audit writer — still used by lib/api/{ops,bookings}.ts... Not the real audit trail: server/audit/audit-writer.ts is what backs getAuditLogs() above."*

**Current behavior**: a flag toggle writes an entry into the same `localStorage` blob (`db.auditLogs`), which the real Audit Log tab (`components/views/AuditLogView.tsx`, backed by `GET /api/v1/ops/audit-log` → `AuditLogService` → `PlatformAuditLog` table) **never reads**. So today, toggling a feature flag produces an audit record that is invisible in the actual Audit Log screen — directly contradicting PRD §5.9's explicit requirement: *"Required for: ... Feature flag changes."* The `AuditTargetType.FEATURE_FLAG` enum value (schema line 40) was clearly added in anticipation of this, and is just sitting unused.

**Outcome needed**: the real toggle service calls `writeAuditLogEntry(actor, 'feature_flag.toggled', AuditTargetType.FEATURE_FLAG, key, label, { from, to })` from `server/audit/audit-writer.ts` — the exact same call shape `plans.service.ts:120-127` and `:153-160` already use for `plan.created`/`plan.updated` (§4).

---

### 1.7 LOW — Nav item metadata says "phase 6"; PRD says Phase 5

**File**: `app/dashboard/layout.tsx:56` — `{ id: 'flags', label: 'Feature Flags', phase: 'phase 6', href: '/dashboard/flags', icon: Sliders, hidden: true }`.

**Current behavior**: `docs/ops-dashboard-prd.md` §6 names this **"Phase 5: Infra, Cost Monitoring, and Feature Flags."** The nav item's own `phase` metadata string says `'phase 6'`. Cosmetic (the field is just a label used nowhere else I found), but worth a one-line fix when this ships, since it's the kind of drift that makes people distrust the other phase labels too. The item is already `hidden: true`, so it isn't currently reachable from the sidebar at all — only via direct URL (`/dashboard/flags`) or the (also hidden) reference in `layout.tsx:70-72` that drives the maintenance banner.

---

### 1.8 LOW — `Quizbuzz-new` has no global/platform-wide settings table; the existing "cache write-through" precedent is per-organization, not platform-global

**File**: `Quizbuzz-new/backend/prisma/schema.prisma` — every model is either per-organization (`Organization`, `OrganizationProfile`, ...) or per-domain-entity (`Contest`, `Payment`, ...). There is no `PlatformSettings`, `SystemConfig`, or equivalent singleton table.

**Why this matters for the design**: the one existing precedent for "ops writes into the main app's own database" is `EntitlementsRepository.updateMainDbPlanLimitsCache()` (`server/features/entitlements/entitlements.repository.ts:30-44`), which does a raw `queryMainDb` `UPDATE organizations SET "planSlug" = ..., "planLimitsCache" = ... WHERE id = $4` — **scoped to one organization row**. Feature flags are platform-global (`scope: 'global'` is the only value `FeatureFlag.scope` has ever had — `lib/types.ts:393`), so this exact pattern doesn't transfer as-is; it needs a new, singleton-style table on the `Quizbuzz-new` side (mirroring how `PricingConfig` in *this* repo's own schema is a deliberate single-row table, `id @default("pricing_default")`, line 393). See §5 for the proposed table and write path.

---

### 1.10 REVISION NOTE — Per-flag RBAC dropped; org-level overrides added (product-owner direction, post-audit)

This finding isn't something newly discovered in the code — it records a scope correction made after the original version of this plan was reviewed, so the "why did §2/§7 change" question is answered here rather than left implicit.

The original draft (see finding 1.4 as first written) proposed a `toggleableByRoles PlatformAdminRole[]` column on `FeatureFlag` — a bespoke, per-flag-configurable permission list deciding who could toggle which flag. **The product owner explicitly rejected this design.** His stated reasoning: role-based permissioning for "who can do billing, who can do X" already exists in this codebase in its simple, flat `hasPermission(action)` form (`lib/hooks/useAuth.ts:46-63`), used by every other mutating admin action (`BILLING_REFUND`, `PLAN_UPDATE_PRICING`, `PLAN_UPDATE`, `ORG_DELETE`, `BILLING_VIEW`). He does not want a second, separate, per-flag-configurable permission system bolted onto one dashboard tab. Feature-flag management should plug into that same existing model with one new action — full stop, no per-flag variation.

Separately, and this is the substantive scope change, the product owner clarified that a plain global on/off boolean per flag doesn't actually cover his primary use case. Some features are org-specific add-ons or one-off custom builds for a particular organization's request. He wants the ops dashboard to enable a feature for one specific org while it stays off (or on) for everyone else, and wants extending that to another org later to be "add one more row from the dashboard," not a code change or redeploy. That requirement — a base global value plus per-organization overrides, resolved to an effective value — is what §2's `FeatureFlagOrgOverride` model, §5's resolution order, and §6/§7's revised UI/RBAC are built around. It follows the shape of this repo's own existing `SubscriptionOverride` precedent (`prisma/schema.prisma:236-255`) rather than inventing a new pattern.

Every subsequent section in this document (§2 onward) reflects this correction. Where the original draft's `toggleableByRoles` design or its associated Open Question (old §9.2) is referenced elsewhere in this doc's history, it has been superseded — §7 resolves it outright.

---

### 1.11 INFO — The two Redis instances are already separate in deployment; a shared pub/sub channel is not free

**Files**: `docker-compose.prod.yml:22` (this repo) — `REDIS_URL=redis://ops-redis:6379`; `Quizbuzz-new/docker-compose.prod.yml:51,79` — `REDIS_HOST: redis`. Two different container names, two different services. `Quizbuzz-new/backend/src/config/index.ts:151-152` and `src/socket/socket.ts:37` show `Quizbuzz-new` already has its own Redis pub/sub (`REDIS_PUBSUB_ENABLED`) for Socket.IO scaling — but it's not the same Redis instance ops uses for its own queue (`server/lib/redis.ts`, used by `server/queues/message.queue.ts`'s BullMQ). Any design that leans on "just publish an invalidation event on the shared Redis channel" needs someone to deliberately point both services at one reachable Redis instance first — it isn't already true today. This directly affects the enforcement/invalidation design in §5 and is called out again in Open Questions §9.5.

---

## 2. Data model

### 2.1 `FeatureFlag` (new Prisma model, this repo's `quizbuzz_ops` database)

```prisma
enum FeatureFlagSeverity {
  STANDARD   // routine toggle, no confirmation dialog
  WARNING    // confirmation dialog, amber "emergency" styling — e.g. new_registrations_paused
  CRITICAL   // confirmation dialog, red styling, strongest copy — e.g. maintenance_mode
}

model FeatureFlag {
  id                  String               @id
  key                 String               @unique // stable slug, e.g. "maintenance_mode"
  label               String
  description         String
  isEnabled           Boolean              @default(false) // global default value
  severity            FeatureFlagSeverity  @default(STANDARD)
  // Whether this flag can carry per-organization overrides at all. False for
  // flags that are inherently platform-wide (maintenance_mode — "maintenance
  // for one org" isn't a coherent concept) so the ops UI/API can decline to
  // even offer the "manage per-org" affordance rather than silently allowing
  // an override that would never be read (see §5's resolution order).
  supportsOrgOverride Boolean              @default(true)
  updatedById         String?
  updatedByName       String
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  updatedBy      PlatformAdmin?          @relation(fields: [updatedById], references: [id])
  orgOverrides   FeatureFlagOrgOverride[]

  @@index([key])
  @@map("feature_flags")
}

// Per-organization override of a flag's global value — this is what makes
// feature flags double as a lightweight per-org entitlement/add-on
// mechanism, not just a platform-wide kill switch. Modeled directly on this
// repo's existing SubscriptionOverride (prisma/schema.prisma:236-255):
// soft-deleted via removedAt/removedById/removedReason rather than updated
// in place or hard-deleted, so the full history of who granted/revoked an
// org's access to a feature is preserved in the row itself, not just in
// PlatformAuditLog. Scoped directly to organizationId (a plain String, not
// a relation) because — confirmed by grep — there is no local Organization
// table in this repo's own schema; org data lives entirely in Quizbuzz-new's
// database, and this repo only ever stores/references organizationId as an
// opaque string (see OrganizationNote, OrganizationSuspension,
// server/features/organizations/organizations.repository.ts).
model FeatureFlagOrgOverride {
  id            String    @id
  // References FeatureFlag.key, not FeatureFlag.id — for readability in
  // queries and consistency with how the rest of this plan already keys off
  // `key` in API paths (e.g. /api/v1/ops/feature-flags/[key]/...).
  flagKey       String
  organizationId String
  isEnabled     Boolean
  reason        String
  createdById   String
  createdByName String
  expiresAt     DateTime?
  removedAt     DateTime?
  removedById   String?
  removedReason String?
  createdAt     DateTime  @default(now())

  flag FeatureFlag @relation(fields: [flagKey], references: [key])

  @@index([flagKey, organizationId, removedAt])
  @@map("feature_flag_org_overrides")
}
```

Notes on the design choices:

- **No separate history/audit table for the global toggle.** Per the task's own framing and finding 1.6, reuse `PlatformAuditLog` exactly like `plans.service.ts` does for `plan.updated` — `writeAuditLogEntry(actor, 'feature_flag.toggled', AuditTargetType.FEATURE_FLAG, flag.key, flag.label, { from: oldVal, to: newVal })`. `AuditTargetType.FEATURE_FLAG` already exists in the schema (line 40) and is unused — this is exactly what it was added for. Building a second, flag-specific history table would duplicate `PlatformAuditLog` for no benefit and would be inconsistent with how `plan.updated`, `override.added`, `org.suspended`, etc. all already work. `FeatureFlagOrgOverride` itself carries its own history via soft-delete (see above), and org-override changes *also* write a `PlatformAuditLog` entry (§4) — the override row is the durable per-org record, the audit log is the cross-domain activity feed.
- **Boolean-only value, no rollout %, no environment targeting** — still deliberately out of scope for this pass (unchanged from the original draft). What *is* now in scope, per the product owner's direction (§1.10), is the per-organization override captured by `FeatureFlagOrgOverride` above — this was previously deferred to "Open Questions" but is now core scope, not an extension.
- **No `toggleableByRoles` column.** Per §1.10/§7, RBAC for feature flags is a single flat `FEATURE_FLAG_MANAGE` permission check via the existing `hasPermission()` convention, not per-flag, per-role data on this model. This is the one column removed from the original draft's schema.
- **`supportsOrgOverride`** lets the UI/API tell which flags even offer per-org management — not every flag is a plausible add-on candidate (see §2.2's seed table).
- **`id`** on both models follows this repo's existing convention of app-generated string IDs (`generateUlid()`, used everywhere else — `plans.service.ts:112`, `audit-writer.ts:37`), not Prisma's `@default(cuid())`.

### 2.2 Seed data

`prisma/seed.js` gets six inserted rows carrying over the exact keys/labels/descriptions from `INITIAL_FEATURE_FLAGS` (`lib/data/db.ts:30-91`) 1:1, so existing UI copy doesn't need to change:

| key | severity | supportsOrgOverride |
|---|---|---|
| `maintenance_mode` | CRITICAL | `false` — inherently platform-wide, "maintenance for one org" isn't meaningful |
| `new_registrations_paused` | WARNING | `false` — same reasoning; registration pause is a platform-wide operational lever |
| `proctoring_enabled_platform_wide` | STANDARD | `true` — plausible add-on (some orgs may pay for/request proctoring, others not) |
| `certificate_auto_delivery` | STANDARD | `true` — plausible custom/add-on feature per org |
| `enhanced_analytics_pipeline` | STANDARD | `true` — plausible add-on tier |
| `razorpay_gateway_active` | WARNING | `true` — plausible per-org payment-gateway rollout/custom arrangement |

No `toggleableByRoles` column to seed — RBAC is uniform across all six flags now (§7).

### 2.3 `Quizbuzz-new` side — global default + per-org overrides

Since (finding 1.8) no global config table exists there today, and the org-scoped `planLimitsCache` write-through pattern doesn't fit a platform-wide default value, add tables to `Quizbuzz-new/backend/prisma/schema.prisma` that mirror the ops-side split — a global-default table plus a per-org-override table — rather than a single denormalized table. Two shapes were considered:

1. **Normalized (recommended): keep `platform_feature_flags` as the global default, add a second `organization_feature_flag_overrides` table**, joined on `(key, organizationId)` at read time.
2. **Denormalized: one row per `(key, organizationId)` pair for every organization**, with the global default folded in as a "no row = use platform default" convention, or fully materialized per org.

**Recommendation: option 1 (normalized), with the join avoided in the hot path by having `isFeatureEnabled(key, { organizationId })` do two cheap indexed point-reads (or a single `LEFT JOIN` query) rather than a full-table join.** The tradeoff: a denormalized per-org-row table avoids any join on `isFeatureEnabled()` — relevant since that call is expected to run per-request — but it requires materializing a row for every `(flag, organization)` pair (or a sparse "override rows only" table that still needs a fallback lookup when no row exists, which is functionally the same two-lookup shape as option 1, just without the second table's semantics being explicit). Since overrides are expected to be the exception (a handful of orgs per add-on flag, not every org), a sparse override table with an indexed `(key, organizationId)` lookup costs effectively the same as a "dense" denormalized table in the common case (global default, no override — one index hit, no row found, fall through) while being far cheaper to reason about, seed, and keep consistent with the ops-side `FeatureFlagOrgOverride` model it mirrors 1:1.

```prisma
// Quizbuzz-new/backend/prisma/schema.prisma
model PlatformFeatureFlag {
  key         String   @id
  isEnabled   Boolean  @default(false) // global default
  updatedAt   DateTime @updatedAt

  @@map("platform_feature_flags")
}

// Mirrors ops's FeatureFlagOrgOverride. Deliberately minimal — this side
// doesn't need reason/createdByName/soft-delete bookkeeping duplicated;
// that history of record lives in ops's own FeatureFlagOrgOverride table
// and PlatformAuditLog. This table exists purely so Quizbuzz-new can
// resolve isFeatureEnabled(key, orgId) on its own connection without a
// runtime call back to ops (same "no new network coupling" principle as
// §5.1's write-through design).
model OrganizationFeatureFlagOverride {
  key            String
  organizationId String
  isEnabled      Boolean
  expiresAt      DateTime?
  updatedAt      DateTime  @updatedAt

  @@id([key, organizationId])
  @@index([key, organizationId])
  @@map("organization_feature_flag_overrides")
}
```

Deliberately minimal on this side — `Quizbuzz-new` doesn't need `label`/`description`/`severity`/`reason`/`createdByName`; those are ops-dashboard display/authorization/audit concerns. `Quizbuzz-new` only ever needs "is `key` currently on for this org (or globally)." Both tables are written to by ops via `queryMainDb` (`UPSERT`s, same connection/pattern `entitlements.repository.ts` already uses — `OrganizationFeatureFlagOverride` rows are upserted on set, hard-deleted on remove since this side doesn't need the soft-delete history the ops-side table keeps), read by `Quizbuzz-new`'s own Prisma client on its own connection — see §5.

---

## 3. API design

Base path: `/api/v1/ops/feature-flags`, following the existing `/api/v1/ops/<domain>` convention (`plans`, `bookings`, `payouts`). New route files:

```
app/api/v1/ops/feature-flags/route.ts                                  (GET list)
app/api/v1/ops/feature-flags/[key]/route.ts                            (GET one, PATCH global toggle)
app/api/v1/ops/feature-flags/[key]/organizations/route.ts              (GET list org overrides)
app/api/v1/ops/feature-flags/[key]/organizations/[orgId]/route.ts      (PUT set override, DELETE remove override)
```

All responses use the existing `okResponse`/`errorResponse` envelope (`server/http/envelope.ts`) — `{ success, message, data, requestId }` / `{ success: false, message, error: { code, details }, requestId }`.

### 3.1 `GET /api/v1/ops/feature-flags`

Read-open to any authenticated admin, matching the audit-log convention (`audit-log.controller.ts:11-13`: *"any authenticated platform admin can view"*) — `SUPPORT` needs to see current flag state even though they can't change it.

```jsonc
// 200 OK
{
  "success": true,
  "message": "Feature flags retrieved.",
  "data": [
    {
      "id": "flag_maintenance",
      "key": "maintenance_mode",
      "label": "Maintenance Mode",
      "description": "Activates maintenance window platform-wide. All live operations are suspended.",
      "isEnabled": false,
      "severity": "CRITICAL",
      "supportsOrgOverride": false,
      "updatedAt": "2026-08-04T11:02:00.000Z",
      "updatedByName": "Jane Doe"
    },
    {
      "id": "flag_proctoring",
      "key": "proctoring_enabled_platform_wide",
      "label": "Platform-wide AI Proctoring",
      "description": "Enables AI proctoring for contests.",
      "isEnabled": true,
      "severity": "STANDARD",
      "supportsOrgOverride": true,
      "updatedAt": "2026-08-01T10:00:00.000Z",
      "updatedByName": "Jane Doe"
    }
    // ...4 more
  ],
  "requestId": "req_abc123"
}
```

`toggleableByRoles` no longer appears anywhere in this response — RBAC for the whole domain is now a single `FEATURE_FLAG_MANAGE` permission check, not per-flag data (§7).

Failure: `401 Unauthorized` (missing/invalid `ops_access_token` cookie) — same as every other route via `getSessionAdmin()`.

### 3.2 `GET /api/v1/ops/feature-flags/[key]`

Same auth level as 3.1. Mirrors `plans.controller.ts:24-31`'s `getPlanById` shape (404 via `errorResponse('Feature flag not found', 'NOT_FOUND', null, 404)` if the key doesn't exist).

### 3.3 `PATCH /api/v1/ops/feature-flags/[key]` — global toggle

```jsonc
// Request
{ "isEnabled": true }
```

```jsonc
// 200 OK
{
  "success": true,
  "message": "Feature flag updated.",
  "data": {
    "id": "flag_maintenance",
    "key": "maintenance_mode",
    "label": "Maintenance Mode",
    "isEnabled": true,
    "severity": "CRITICAL",
    "supportsOrgOverride": false,
    "updatedAt": "2026-08-09T09:14:22.000Z",
    "updatedByName": "Jane Doe"
  },
  "requestId": "req_def456"
}
```

Failure states:
- `403 Forbidden` — admin lacks `FEATURE_FLAG_MANAGE` (`requireRole([PlatformAdminRole.SUPER_ADMIN])`, checked in the controller — statically known now, same shape as `plans.controller.ts:34`, not per-row like the original draft's per-flag role list).
- `404 Not Found` — unknown key.
- `400 Bad Request` — `isEnabled` missing or not boolean (`zod` schema, same `parseRequest` helper every other route uses).

### 3.4 `GET /api/v1/ops/feature-flags/[key]/organizations` — list active org overrides

Read-open to any authenticated admin, same as 3.1/3.2 — `SUPPORT` can see which orgs have a non-default value even though they can't change it.

```jsonc
// 200 OK
{
  "success": true,
  "message": "Organization overrides retrieved.",
  "data": [
    {
      "id": "ffoo_01hxyz",
      "flagKey": "proctoring_enabled_platform_wide",
      "organizationId": "org_9f3c1a",
      "isEnabled": true,
      "reason": "Add-on purchased per contract dated 2026-07-15.",
      "createdByName": "Jane Doe",
      "expiresAt": null,
      "createdAt": "2026-07-15T14:02:00.000Z"
    }
  ],
  "requestId": "req_ghi789"
}
```

Failure: `400 Bad Request` — `errorResponse('Flag does not support org overrides', 'ORG_OVERRIDE_NOT_SUPPORTED', null, 400)` if `flag.supportsOrgOverride === false` (e.g. requested for `maintenance_mode`).

### 3.5 `PUT /api/v1/ops/feature-flags/[key]/organizations/[orgId]` — set/replace an org override

```jsonc
// Request
{ "isEnabled": true, "reason": "Add-on purchased per contract dated 2026-07-15." }
```

```jsonc
// 200 OK
{
  "success": true,
  "message": "Organization override set.",
  "data": {
    "id": "ffoo_01hxyz",
    "flagKey": "proctoring_enabled_platform_wide",
    "organizationId": "org_9f3c1a",
    "isEnabled": true,
    "reason": "Add-on purchased per contract dated 2026-07-15.",
    "createdByName": "Jane Doe",
    "expiresAt": null,
    "createdAt": "2026-07-15T14:02:00.000Z"
  },
  "requestId": "req_jkl012"
}
```

"Replace" semantics: if an active (non-removed) override already exists for this `(key, orgId)`, the service soft-removes it (`removedAt`/`removedById`/`removedReason: 'Replaced by new override'`) and creates a fresh row — matching `SubscriptionOverride`'s soft-delete convention rather than mutating a row in place, so history is preserved.

Failure states:
- `403 Forbidden` — admin lacks `FEATURE_FLAG_MANAGE`.
- `404 Not Found` — unknown key.
- `400 Bad Request` — `flag.supportsOrgOverride === false`, or `isEnabled`/`reason` missing/malformed (`zod` schema; `reason` required, matching `SubscriptionOverride.reason`'s non-nullable convention — an override with no stated justification isn't allowed here either).

### 3.6 `DELETE /api/v1/ops/feature-flags/[key]/organizations/[orgId]` — remove an org override

```jsonc
// Request (empty body, or optionally { "reason": "Trial period ended." })
```

```jsonc
// 200 OK
{
  "success": true,
  "message": "Organization override removed. Organization now follows the global default.",
  "data": { "flagKey": "proctoring_enabled_platform_wide", "organizationId": "org_9f3c1a", "removedAt": "2026-08-09T09:20:00.000Z" },
  "requestId": "req_mno345"
}
```

Soft-delete only (`removedAt`/`removedById`/`removedReason`) — same reasoning as `SubscriptionOverride`, never a hard delete, so a reversed decision is fully auditable.

Failure states:
- `403 Forbidden` — admin lacks `FEATURE_FLAG_MANAGE`.
- `404 Not Found` — unknown key, or no active override exists for that org (nothing to remove).

No `POST`/`DELETE` on the base `feature-flags` resource itself (3.1–3.3) — flags are managed via migration + seed, not ad hoc admin creation, consistent with "adding a new flag = one new DB row + call sites," not a dashboard "create flag" form. (Worth revisiting if Austin wants self-serve flag creation later — flagged in Open Questions §9.12.) Org overrides, by contrast, are explicitly designed to be created/removed ad hoc from the dashboard — that's the entire point of the feature.

### 3.7 `docs/api/feature-flags-api.md`

Write this once the endpoints are built, following the exact structure of `docs/api/plans-api.md`/`docs/api/entitlements-api.md` (Base Path, per-endpoint Purpose/Description/Request/Response/Failure States). Not written yet since no code exists — listed here so it lands in the phased plan (§8) as its own deliverable, matching how the billing-portal plan treated docs as their own phase-E line item.

---

## 4. Service layer

New module: `server/features/feature-flags/`, mirroring `plans`' five-file split (`*.repository.ts`, `*.service.ts`, `*.controller.ts`, `*.validator.ts`, and a small `*.types.ts` if needed) and wired into `server/container.ts` exactly like every other feature (`featureFlagsRepository`, `featureFlagsService`, `featureFlagsController` — repository takes no args, service takes the repository, controller takes the service).

**`feature-flags.repository.ts`** — thin Prisma wrapper:
```ts
export interface IFeatureFlagsRepository {
  listFlags(): Promise<FeatureFlag[]>;
  getFlagByKey(key: string): Promise<FeatureFlag | null>;
  updateFlag(key: string, isEnabled: boolean, updatedById: string, updatedByName: string): Promise<FeatureFlag>;
  listActiveOrgOverrides(flagKey: string): Promise<FeatureFlagOrgOverride[]>;
  getActiveOrgOverride(flagKey: string, organizationId: string): Promise<FeatureFlagOrgOverride | null>;
  createOrgOverride(input: {
    flagKey: string; organizationId: string; isEnabled: boolean; reason: string;
    createdById: string; createdByName: string; expiresAt?: Date;
  }): Promise<FeatureFlagOrgOverride>;
  removeOrgOverride(id: string, removedById: string, removedReason?: string): Promise<void>;
}
```

**`feature-flags.service.ts`** responsibilities (mirrors `plans.service.ts`'s shape closely — `updatePlan()` is the closest existing analog: load current row, validate, mutate, sync a downstream cache, write audit). Both the global toggle and the org-override methods funnel through `computeEffectiveFlagState()` (§5.1's `effective-flag-state.ts`) when building the value returned to the API, and both trigger the same audit-log + main-app-sync pattern (§1.6/§5.1) — the org-scoped methods just include `organizationId` in the audit metadata and the main-app sync payload:

```ts
export class FeatureFlagsService {
  constructor(
    private repo: IFeatureFlagsRepository = new FeatureFlagsRepository(),
  ) {}

  async listFlags() { return this.repo.listFlags(); }

  // Global toggle — RBAC is now a single, statically-known permission,
  // checked in the controller via requireRole([PlatformAdminRole.SUPER_ADMIN])
  // before this method is ever called (§7) — no per-row role check here
  // anymore, unlike the original draft.
  async toggleFlag(key: string, isEnabled: boolean, admin: AuthenticatedAdmin) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);

    const oldValue = flag.isEnabled;
    const updated = await this.repo.updateFlag(key, isEnabled, admin.id, admin.name);

    await writeAuditLogEntry(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      'feature_flag.toggled',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { from: oldValue, to: isEnabled }
    );

    // Cache invalidation trigger — in-process cache (this app), and the
    // main-app write-through (see §5). Both fire-and-forget; a failure here
    // must not fail the toggle itself (same "best-effort, log and move on"
    // pattern audit-writer.ts already uses at lines 47-49).
    await invalidateFeatureFlagCache(key);
    await syncFlagToMainApp(key, isEnabled).catch((err) =>
      console.error(`Failed to sync flag '${key}' to main app:`, err)
    );

    return updated;
  }

  async listOrgOverrides(key: string) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);
    if (!flag.supportsOrgOverride) {
      throw new BadRequestError(`Flag '${key}' does not support org overrides`, 'ORG_OVERRIDE_NOT_SUPPORTED');
    }
    return this.repo.listActiveOrgOverrides(key);
  }

  // "Set" = replace: soft-remove any existing active override for this
  // (key, orgId) pair, then create a fresh row — same pattern
  // SubscriptionsService.addOverride uses for SubscriptionOverride, so a
  // changed decision is always a new row, never a mutated one.
  async setOrgOverride(
    key: string, organizationId: string, isEnabled: boolean, reason: string, admin: AuthenticatedAdmin
  ) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);
    if (!flag.supportsOrgOverride) {
      throw new BadRequestError(`Flag '${key}' does not support org overrides`, 'ORG_OVERRIDE_NOT_SUPPORTED');
    }

    const existing = await this.repo.getActiveOrgOverride(key, organizationId);
    if (existing) {
      await this.repo.removeOrgOverride(existing.id, admin.id, 'Replaced by new override');
    }

    const created = await this.repo.createOrgOverride({
      flagKey: key, organizationId, isEnabled, reason, createdById: admin.id, createdByName: admin.name,
    });

    await writeAuditLogEntry(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      'feature_flag.org_override.set',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { organizationId, isEnabled, reason, previousOverrideId: existing?.id ?? null }
    );

    await invalidateFeatureFlagCache(key, organizationId);
    await syncOrgOverrideToMainApp(key, organizationId, isEnabled).catch((err) =>
      console.error(`Failed to sync org override '${key}'/'${organizationId}' to main app:`, err)
    );

    return created;
  }

  async removeOrgOverride(key: string, organizationId: string, admin: AuthenticatedAdmin, reason?: string) {
    const flag = await this.repo.getFlagByKey(key);
    if (!flag) throw new NotFoundError(`Feature flag '${key}' not found`);

    const existing = await this.repo.getActiveOrgOverride(key, organizationId);
    if (!existing) throw new NotFoundError(`No active override for '${key}' on org '${organizationId}'`);

    await this.repo.removeOrgOverride(existing.id, admin.id, reason);

    await writeAuditLogEntry(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      'feature_flag.org_override.removed',
      AuditTargetType.FEATURE_FLAG,
      key,
      flag.label,
      { organizationId, removedOverrideId: existing.id, reason }
    );

    await invalidateFeatureFlagCache(key, organizationId);
    await syncOrgOverrideRemovalToMainApp(key, organizationId).catch((err) =>
      console.error(`Failed to sync org override removal '${key}'/'${organizationId}' to main app:`, err)
    );
  }
}
```

**`feature-flags.controller.ts`** — thin, like `plans.controller.ts`: `getSessionAdmin()` for the list/get/list-overrides routes (read-open), and `requireRole([PlatformAdminRole.SUPER_ADMIN])` for every mutating route — the global `PATCH`, and both org-override `PUT`/`DELETE` — all gated by the single `FEATURE_FLAG_MANAGE`-equivalent role check, statically known in the controller exactly like `plans.controller.ts:34/48/68`'s `requireRole([SUPER_ADMIN, BILLING_ADMIN])`. This is a structural simplification versus the original draft: there is no per-row RBAC branch anywhere in this service anymore, because the allowed-role set is no longer data on the flag row.

**`feature-flags.validator.ts`**:
```ts
export const flagUpdateSchema = z.object({ isEnabled: z.boolean() });
export const orgOverrideSetSchema = z.object({
  isEnabled: z.boolean(),
  reason: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});
export const orgOverrideRemoveSchema = z.object({ reason: z.string().optional() });
```

---

## 5. Enforcement architecture

This is the part with no existing precedent to copy verbatim — `entitlements`'s per-org DB write-through doesn't transfer to a platform-global value (finding 1.8), and there's no live cross-service API call anywhere in either repo today (the PRD's explicit principle #3, "ops can read main app tables and perform a tiny set of explicit updates... it must not run migrations against the main app database," argues against inventing a new synchronous ops→main-app HTTP dependency). The one thing that *does* have a direct precedent is the "base value + active overrides → effective value" resolution itself — this repo's `server/features/subscriptions/effective-limits.ts` already exists for exactly this purpose, just for numeric limits instead of booleans.

### 5.1 Recommended approach: DB write-through + in-process TTL cache, no new network coupling required for V1

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   Ops Dashboard (this)  │        │        Quizbuzz-new           │
│                          │        │                                │
│  FeatureFlagsView.tsx    │        │  Express request (orgId known  │
│   global toggle /        │        │  from auth context)            │
│   org override mgmt      │        │        │                       │
│        │                 │        │        ▼                       │
│        ▼                 │        │  maintenance.middleware.ts     │
│  PATCH .../[key]         │        │  (and per-call-site checks:    │
│  PUT/DELETE .../[key]/   │        │   proctoring.service.ts,       │
│  organizations/[orgId]   │        │   registration handler, etc.)  │
│        │                 │        │        │                       │
│        ▼                 │        │        ▼                       │
│  FeatureFlagsService      │        │  isFeatureEnabled(key,        │
│   .toggleFlag() /        │        │    { organizationId? })        │
│   .setOrgOverride() /    │        │   (src/common/feature-flags.ts)│
│   .removeOrgOverride()   │        │        │                       │
│        │                 │        │        ├─► in-memory TTL cache │
│        ├─► ops Postgres  │        │        │   key: `${key}:       │
│        │   FeatureFlag + │        │        │   ${orgId ?? 'global'}│
│        │   FeatureFlagOrg│        │        │   ` (per Node process)│
│        │   Override      │        │        │                       │
│        │   (source of    │        │        └─► on miss/expiry:     │
│        │    truth)       │        │            computeEffective-   │
│        │                 │        │            FlagState() reads:  │
│        ├─► PlatformAudit │        │            1. org override row │
│        │   Log (audit    │        │               (if orgId given) │
│        │    trail)       │        │            2. else global      │
│        │                 │        │               platform_        │
│        └─► queryMainDb() │        │               feature_flags    │
│            UPSERT both    │───────┼──────────► (Quizbuzz-new's own │
│            platform_      │  same │            Postgres, its own   │
│            feature_flags  │  pg   │            Prisma client)      │
│            and org_       │  Pool │                                │
│            feature_flag_  │  as   │                                │
│            overrides      │ entit-│                                │
│            (fire-and-     │ lements│                               │
│             forget, same  │  repo-│                                │
│             pattern as    │ sitory│                                │
│             entitlements. │ .ts)  │                                │
│             repository.ts)│───────┘                                │
└─────────────────────────┘        └──────────────────────────────┘
```

Mechanics:

1. **Ops's `FeatureFlag` + `FeatureFlagOrgOverride` tables are the single source of truth.** Every toggle or override change writes there first, synchronously, inside the request — this is what the dashboard reads back immediately (no eventual consistency for the admin's own view).
2. **Write-through to `Quizbuzz-new`'s own DB, same connection pattern already in production** (`server/db/main-db-pool.ts`'s `queryMainDb`, currently used only by `entitlements.repository.ts`). After a successful global toggle, `FeatureFlagsService` fires an `UPSERT` into `platform_feature_flags`; after a successful org-override set/remove, it fires an `UPSERT`/`DELETE` against `organization_feature_flag_overrides` (§2.3) — no new dependency, no new package, literally the same `pg.Pool` connection string (`MAIN_DATABASE_URL`) already configured and already crossing this exact boundary for entitlements.
3. **`Quizbuzz-new` reads its own database on its own connection** — no runtime HTTP call between the two services, ever. This matches PRD principle #3 exactly and avoids adding "the main app is down if the ops dashboard is down" as a new failure mode.
4. **`computeEffectiveFlagState()` — the shared resolution module, `Quizbuzz-new/backend/src/common/effective-flag-state.ts`**, following the exact "single responsibility: turn a base value plus active overrides into the effective value" principle `server/features/subscriptions/effective-limits.ts` already establishes in this repo. Much simpler than that module's numeric ADDITIVE/ABSOLUTE folding, since a boolean org override just wins outright when present and active — there's nothing to fold or stack:

```ts
// Quizbuzz-new/backend/src/common/effective-flag-state.ts
// Single responsibility: turn a flag's global default plus an optional
// active org override into the effective boolean actually in force. This
// is the one shared place both isFeatureEnabled() and any future API
// response call into — mirrors why effective-limits.ts exists in the ops
// repo (server/features/subscriptions/effective-limits.ts): resolution
// logic that's duplicated across call sites tends to drift and disagree.

export interface OrgOverrideInput {
  isEnabled: boolean;
  expiresAt: Date | null;
}

export interface EffectiveFlagState {
  value: boolean;
  overridden: boolean;
}

export function isOrgOverrideActive(override: OrgOverrideInput, now: Date = new Date()): boolean {
  return override.expiresAt === null || override.expiresAt > now;
}

export function computeEffectiveFlagState(
  globalValue: boolean,
  orgOverride: OrgOverrideInput | null,
): EffectiveFlagState {
  if (orgOverride && isOrgOverrideActive(orgOverride)) {
    return { value: orgOverride.isEnabled, overridden: true };
  }
  return { value: globalValue, overridden: false };
}
```

5. **`isFeatureEnabled(key, context?)` SDK, same shape in both repos**, backed by a short-TTL in-memory cache identical in spirit to this repo's own `server/cache/cache.ts` (`Map`-based, `{ value, expires }`, already the established "simple in-memory TTL cache" convention — no Redis needed for this, and per finding 1.11, the two apps' Redis instances aren't even the same instance today). The cache key now includes the org, since the same key can resolve differently per org:

```ts
// Quizbuzz-new/backend/src/common/feature-flags.ts
// Same location convention as plan-entitlements.ts in the same directory.
const flagCache = new Map<string, { value: boolean; expires: number }>();

// Differentiated TTL: maintenance_mode needs to propagate fast (a stuck
// "still live" window is worse than a few extra cache misses); routine
// flags can tolerate a minute of staleness. See Open Question 9.5 for the
// exact numbers — these are starting proposals, not final.
const TTL_MS: Record<string, number> = {
  maintenance_mode: 5_000,
  new_registrations_paused: 5_000,
};
const DEFAULT_TTL_MS = 60_000;

export async function isFeatureEnabled(
  key: string,
  context?: { organizationId?: string },
): Promise<boolean> {
  const orgId = context?.organizationId;
  const cacheKey = `${key}:${orgId ?? 'global'}`;
  const cached = flagCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const [globalRow, overrideRow] = await Promise.all([
      prisma.platformFeatureFlag.findUnique({ where: { key } }),
      orgId
        ? prisma.organizationFeatureFlagOverride.findUnique({
            where: { key_organizationId: { key, organizationId: orgId } },
          })
        : Promise.resolve(null),
    ]);

    // Fail-closed on "flag not found": an unrecognized key is treated as
    // off, never as "assume the old/default behavior" — see Open
    // Question 9.6 for the harder call: what happens on a DB error, not
    // just a missing row.
    const globalValue = globalRow?.isEnabled ?? false;
    const { value } = computeEffectiveFlagState(globalValue, overrideRow);

    flagCache.set(cacheKey, { value, expires: Date.now() + (TTL_MS[key] ?? DEFAULT_TTL_MS) });
    return value;
  } catch (err) {
    console.error(`isFeatureEnabled('${key}', ${JSON.stringify(context)}) DB read failed:`, err);
    // Serve stale cache if we have it, else fail closed. This exact
    // fail-closed-on-error choice for maintenance_mode is flagged as an
    // open question (9.6) — "fail closed" here means "assume NOT in
    // maintenance," which favors availability over safety. Confirm this
    // is the right default before shipping.
    return cached?.value ?? false;
  }
}
```

This is the "zero new plumbing to add a flag" contract the task asked for: a new flag is a new DB row in the ops-side tables plus new call sites doing `if (await isFeatureEnabled('new_flag_key', { organizationId }))`. No new route, no new service method, no new cache wiring — the org-aware signature is built in from the start rather than bolted on later, since per-org resolution is core scope now, not a V2 extension (§8).

### 5.1a User-facing messaging when a feature is disabled — `Quizbuzz-new` must not silently no-op

The product owner was explicit: turning a feature off (globally or for a specific org) must not be a silent no-op — end users need to see a clear message that the feature/platform is unavailable, not a broken button or a request that just does nothing.

Proposed pattern: a shared, consistent error shape that every `isFeatureEnabled()` call site throws/returns when the flag resolves to `false`, so the frontend renders one consistent "this isn't available right now" state instead of each call site inventing its own copy or, worse, failing silently:

```ts
// Quizbuzz-new/backend/src/common/feature-unavailable-error.ts
export class FeatureUnavailableError extends Error {
  constructor(public readonly featureKey: string, message = 'This feature is currently unavailable.') {
    super(message);
  }
}

// Consistent API error shape, same envelope convention this repo's own
// server/http/envelope.ts already uses for { success, message, error }:
// {
//   success: false,
//   message: "This feature is currently unavailable.",
//   error: { code: "FEATURE_DISABLED", details: { featureKey: "proctoring_enabled_platform_wide" } }
// }
```

Call sites that gate on `isFeatureEnabled()` (proctoring, certificates, analytics, registration, Razorpay — §5.3) throw `FeatureUnavailableError` instead of just `return`ing early, and a central Express error handler maps it to a `403` with the `FEATURE_DISABLED` code (the `maintenance.middleware.ts` case, §5.2, is the one exception — that one 503s at the edge before a request even reaches a route handler, since it's platform-wide by design).

**Frontend**: I did not find an existing "feature gated" or "this isn't available" component in `Quizbuzz-new`'s own frontend during this audit — worth a targeted check at implementation time, but nothing comparable turned up (no `FeatureGate`, `Unavailable`, or similar component name). This means a new shared component (e.g. `FeatureUnavailableNotice`) is likely needed there, not just a backend error shape — the frontend needs one place that recognizes the `FEATURE_DISABLED` error code from any API call and renders consistent copy ("This feature isn't available right now" / an org-specific variant if useful), rather than leaving each screen to handle the 403 differently. This is new frontend scope in `Quizbuzz-new` that the original draft didn't call out at all, since the original draft's flags were pure kill-switches with no user-facing messaging requirement.

### 5.2 `maintenance.middleware.ts` — where it actually needs to live

**Important scoping correction versus how the task described it**: `middleware.ts` at *this* repo's root only fronts the **ops dashboard's own** Next.js routes (`matcher: ['/api/:path*']`, this app's API only) — it has no reach into `Quizbuzz-new`, which is a separate Express service. The maintenance-mode copy in `FeatureFlagsView.tsx:79` ("suspends all active operations, contests, and admin controls across every single tenant organization") is describing `Quizbuzz-new`'s behavior, not this dashboard's. So the real gate belongs in `Quizbuzz-new/backend/src/middlewares/` (which already has `idempotency.middleware.ts` as a sibling), not in this repo's `middleware.ts`.

Proposed `Quizbuzz-new/backend/src/middlewares/maintenance.middleware.ts`, mounted early in the Express chain (after body parsing, before route handlers — likely before most auth middleware too, so it can 503 without doing unnecessary auth work, but with an explicit allowlist for health checks and any ops-initiated internal calls):

```ts
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  if (ALLOWLISTED_PATHS.has(req.path)) return next(); // /health, /metrics, etc.
  if (await isFeatureEnabled('maintenance_mode')) {
    return res.status(503).set('Retry-After', '300').json({
      success: false,
      message: 'The platform is temporarily under maintenance. Please try again shortly.',
      error: { code: 'MAINTENANCE_MODE' },
    });
  }
  next();
}
```

This repo's own `middleware.ts` doesn't need a maintenance gate unless Austin wants ops-dashboard writes to also freeze during platform maintenance (open question §9.8) — nothing in the PRD or current UI copy asks for that, and doing it would hit the same Edge-runtime-can't-easily-reach-Postgres constraint the file's own comments already document (would need per-route-handler checks in Node-runtime `route.ts` files instead, not the Edge `middleware.ts`).

### 5.3 The other five flags — where each one plugs in

| Flag | Org-overridable? | Plugs into (proposed) | Status today |
|---|---|---|---|
| `maintenance_mode` | No (`supportsOrgOverride: false`) | `maintenance.middleware.ts`, Express, early in chain, org-unaware (`isFeatureEnabled('maintenance_mode')`, no `organizationId`) | Nothing exists |
| `new_registrations_paused` | No (`supportsOrgOverride: false`) | New check in `Quizbuzz-new`'s registration/participant-signup handler(s) under `backend/src/modules/participant/` and `backend/src/modules/contact/`, org-unaware | Nothing exists |
| `proctoring_enabled_platform_wide` | Yes | Replace/augment the existing `config.features.proctoring` reads at `proctoring.service.ts:111`, `capture-metadata.worker.ts:67`, `quiz.gateway.ts:267` — call sites pass `{ organizationId }` from the contest/quiz's org context | **Real today**, but env-var/boot-time only |
| `certificate_auto_delivery` | Yes | New check wherever certificate generation is triggered post-contest (module: `backend/src/modules/certificate/`), `{ organizationId }` from the contest | `ENABLE_CERTIFICATES` env var exists in config but I did not find it actually referenced at a call site the way `features.proctoring` is — worth re-verifying at implementation time whether it's wired to anything yet |
| `enhanced_analytics_pipeline` | Yes | New check in `backend/src/modules/analytics/` before streaming raw responses to the analytics pipeline, `{ organizationId }` from the requesting org | `ENABLE_ANALYTICS` env var exists in config; same caveat as above — needs verification at implementation time |
| `razorpay_gateway_active` | Yes | New check in `Quizbuzz-new`'s contest-registration payment initiation **and** (per the task's own instruction to check) this repo's own `app/billing/checkout/page.tsx` subscription-payment flow, since both integrate Razorpay independently — both pass `{ organizationId }` | Nothing exists in either repo |

For `proctoring_enabled_platform_wide` specifically, the recommended reconciliation with the existing env var (rather than silently replacing it) is: **`effective = env.ENABLE_PROCTORING && resolvedDbValue`** where `resolvedDbValue` is `computeEffectiveFlagState()`'s output (global default or active org override) — the env var becomes a deploy-time hard ceiling / kill-switch that ops can only turn further down, never override on, applying uniformly whether the DB-side value came from the global default or a per-org override. This preserves the existing safety property (ops in general shouldn't be able to turn on a feature a deploy explicitly disabled for infra/licensing/cost reasons) while giving ops real runtime control, including per-org control. This is a real design choice, not a certainty — flagged again in Open Questions §9.7.

### 5.4 Push-invalidation upgrade path (optional, not required for V1)

If the 5s TTL on `maintenance_mode` isn't tight enough in practice, the additive next step — without requiring the two Redis instances to merge (finding 1.11) — is a single new authenticated internal endpoint on `Quizbuzz-new`:

```
POST /internal/feature-flags/invalidate
Header: x-internal-secret: <shared secret, new env var on both sides>
Body: { "key": "maintenance_mode", "organizationId": null }
```

`organizationId: null` invalidates the global cache entry only; a non-null value additionally invalidates that org's cache entry (`${key}:${organizationId}`) — relevant once org-override changes also want fast propagation, not just `maintenance_mode`. `FeatureFlagsService.toggleFlag()`/`.setOrgOverride()`/`.removeOrgOverride()` call this, fire-and-forget, right after the `queryMainDb` write, and the handler just deletes the matching key(s) from `Quizbuzz-new`'s in-memory cache. This is explicitly framed as optional/Phase-2 because it introduces the one new thing this design otherwise avoids — a live network call from ops to the main app — and should only be added if TTL staleness proves to be a real problem, not preemptively.

---

## 6. Frontend integration plan

Goal restated from the task: `FeatureFlagsView.tsx` should need **zero or near-zero changes**. Everything changes underneath `useOps()`.

### 6.1 `lib/api/ops.ts`

Replace the four flag-related lines (`getFeatureFlags`, `toggleFeatureFlag`, `lib/data/db.ts` import) with real `apiRequest` calls, keeping the exported function signatures identical:

```ts
import { apiRequest } from '@/lib/api/utils';
import { FeatureFlag } from '@/lib/types';

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const raw = await apiRequest<any[]>('/api/v1/ops/feature-flags');
  return raw.map(mapFlag);
}

export async function toggleFeatureFlag(key: string, isEnabled: boolean): Promise<FeatureFlag> {
  const raw = await apiRequest<any>(`/api/v1/ops/feature-flags/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  });
  return mapFlag(raw);
}

function mapFlag(f: any): FeatureFlag {
  return {
    id: f.id,
    key: f.key,
    label: f.label,
    description: f.description,
    isEnabled: f.isEnabled,
    scope: 'global',
    supportsOrgOverride: f.supportsOrgOverride, // new — drives §6.3's org-override affordance
    updatedAt: f.updatedAt,
    updatedByAdminName: f.updatedByName,
  };
}

export async function getFlagOrgOverrides(key: string): Promise<FeatureFlagOrgOverride[]> {
  return apiRequest<any[]>(`/api/v1/ops/feature-flags/${key}/organizations`);
}

export async function setFlagOrgOverride(
  key: string, orgId: string, isEnabled: boolean, reason: string
): Promise<FeatureFlagOrgOverride> {
  return apiRequest<any>(`/api/v1/ops/feature-flags/${key}/organizations/${orgId}`, {
    method: 'PUT',
    body: JSON.stringify({ isEnabled, reason }),
  });
}

export async function removeFlagOrgOverride(key: string, orgId: string): Promise<void> {
  await apiRequest<any>(`/api/v1/ops/feature-flags/${key}/organizations/${orgId}`, { method: 'DELETE' });
}
```

`getInfraStatus`/`getScalingConfig` in the same file are explicitly **out of scope** — they stay on `db.ts` until their own (separate, later) migration; this plan only touches the `featureFlags` slice of `MockDatabase`.

### 6.2 `lib/hooks/useOps.ts` — add optimistic update + rollback

Today's `toggleFlagMutation` (lines 24-31) has no `onMutate`/`onError` — it just waits for the request and invalidates on success. Add optimistic update to preserve the current instant-toggle feel now that a real network round-trip is in the loop:

```ts
const toggleFlagMutation = useMutation({
  mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) =>
    toggleFeatureFlag(key, isEnabled),
  onMutate: async ({ key, isEnabled }) => {
    await queryClient.cancelQueries({ queryKey: ['ops', 'flags'] });
    const previous = queryClient.getQueryData<FeatureFlag[]>(['ops', 'flags']);
    queryClient.setQueryData<FeatureFlag[]>(['ops', 'flags'], (old) =>
      old?.map((f) => (f.key === key ? { ...f, isEnabled } : f))
    );
    return { previous };
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) queryClient.setQueryData(['ops', 'flags'], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'flags'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  },
});
```

Note this is a deliberate, small deviation from the sibling `usePlans.ts` mutation pattern (which has no optimistic update, just invalidate-on-success — plans are edited far less frequently and via a form, not a one-click switch). It's justified here specifically because the existing UX (`FeatureFlagsView.tsx`'s toggle switch) already renders as instant today (localStorage has no latency), and a real network call without optimistic UI would introduce a visible regression — a toggle that visibly "sticks" for 100-300ms before flipping.

### 6.3 `FeatureFlagsView.tsx` — the real changes

1. `isEmergency` (line 165) becomes `flag.severity !== 'STANDARD'`, and the confirmation-modal branch (lines 71-96) reads `flag.severity === 'CRITICAL'`/`'WARNING'` instead of hardcoded key comparisons (finding 1.5).
2. **RBAC UI simplified from the original draft.** The per-flag `flag.toggleableByRoles.includes(admin.role)` check proposed earlier is dropped entirely — per §1.10/§7, there's no per-flag role data anymore. `isSupport` (line 48) is replaced by a single `const canManage = hasPermission('FEATURE_FLAG_MANAGE');` gating the whole tab's mutating actions uniformly: the global toggle switch's `disabled` condition (line 209) and the new org-override affordance's add/remove controls (point 4 below) both just check `canManage`, with no per-flag variation. This is what makes the SUPPORT-banner copy at line 156 finally accurate — it becomes a flat "you don't have permission to manage feature flags" message rather than a role-list claim that was never actually enforced anywhere.
3. Everything else about the existing toggle flow — the modal, the toast calls, the `window.dispatchEvent('quizbuzz_flag_updated')` used by `DashboardLayout`'s banner — is unchanged. `executeToggle()` already treats `toggleFlag()` as an async function that can throw (lines 102-115), which is exactly the contract a real `fetch`-backed mutation has.
4. **New: per-org override affordance, for `flag.supportsOrgOverride === true` flags only.** Each such flag row gets a "Manage organizations" action (e.g. a button that expands an inline panel or opens a drawer — component-responsibility level, not full JSX, matching the rest of this section's detail):
   - Fetches and lists active overrides for that flag via `getFlagOrgOverrides(key)` (§6.1) — org ID, current override value, reason, who set it, when.
   - An "Add override" form: org ID/lookup input, on/off toggle, required `reason` text field (mirrors `SubscriptionOverride`'s required-reason convention already used elsewhere in this dashboard for subscription overrides), submits via `setFlagOrgOverride()`.
   - A "Remove" action per listed override, submits via `removeFlagOrgOverride()`, reverting that org to the global default — per Open Question 9.2, whether this needs an explicit confirmation step (given it changes what an org's end users see) is left open rather than assumed.
   - The whole panel — its trigger button, the add form, and every remove action — is gated by the same `canManage` check from point 2; `SUPPORT` and any role without `FEATURE_FLAG_MANAGE` can still view the panel (matching the read-open API in §3.4) but every mutating control in it is disabled.
   - For flags with `supportsOrgOverride === false` (`maintenance_mode`, `new_registrations_paused`), no "Manage organizations" affordance renders at all — the API itself would reject the call (§3.4-3.6), so the UI shouldn't offer it.

### 6.4 `app/dashboard/layout.tsx`

No changes needed. It already calls `useOps()` (line 70) and reads `featureFlags.find(f => f.key === 'maintenance_mode')?.isEnabled` (line 72) — this keeps working unchanged once `useOps()` is backed by the real API, because React Query's shared cache (`['ops', 'flags']`) means `DashboardLayout` and `FeatureFlagsView` are reading the same query, not independent state.

### 6.5 `lib/data/db.ts` cleanup (deferred to §8's last phase)

`MockDatabase.featureFlags` and `INITIAL_FEATURE_FLAGS` get deleted only after the frontend swap ships and is verified — not simultaneously, so there's a clean rollback point. `lib/api/auditLog.ts:99`'s `writeAuditLogEntry` type signature has `'feature_flag'` in its `targetType` union; once nothing calls it with that value anymore, narrow the union (the function itself stays, per its own comment — still used by `bookings`/impersonation mocks).

---

## 7. RBAC

**Rewritten per §1.10: the per-flag `toggleableByRoles` design is gone. This section resolves the original draft's Open Question 9.2 (old numbering — "`BILLING_ADMIN`'s actual flag-toggle permissions") outright rather than leaving it open.**

New model: one new permission action, `FEATURE_FLAG_MANAGE`, added to the app's existing `hasPermission(action)` switch — `lib/hooks/useAuth.ts:46-63` — the same convention already used for `BILLING_REFUND`, `PLAN_UPDATE_PRICING`, `PLAN_UPDATE`, `ORG_DELETE`, `BILLING_VIEW`. Concretely:

```ts
// lib/hooks/useAuth.ts — hasPermission(), no structural change to the
// switch itself, since SUPER_ADMIN's `case` already returns true
// unconditionally (line 53) and SUPPORT/BILLING_ADMIN's cases are
// allow-lists that simply never include 'FEATURE_FLAG_MANAGE':
switch (role) {
  case 'SUPER_ADMIN':
    return true; // covers FEATURE_FLAG_MANAGE — no new case needed here
  case 'SUPPORT':
    return !['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'ORG_DELETE'].includes(action); // FEATURE_FLAG_MANAGE not excluded → SUPPORT can call hasPermission('FEATURE_FLAG_MANAGE') and get `true` today, which is WRONG — see note below
  case 'BILLING_ADMIN':
    return ['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'PLAN_UPDATE', 'BILLING_VIEW'].includes(action); // FEATURE_FLAG_MANAGE not in this allow-list → BILLING_ADMIN correctly denied, no change needed
  default:
    return false;
}
```

**Important implementation note surfaced by writing this out explicitly**: `SUPPORT`'s branch is a deny-list (`!excluded.includes(action)`), not an allow-list — so simply adding `'FEATURE_FLAG_MANAGE'` as a new action string without also adding it to `SUPPORT`'s exclusion array would make `hasPermission('FEATURE_FLAG_MANAGE')` incorrectly return `true` for `SUPPORT`. The implementation must add `'FEATURE_FLAG_MANAGE'` to `SUPPORT`'s exclusion list (`!['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'ORG_DELETE', 'FEATURE_FLAG_MANAGE'].includes(action)`) — this is a one-line change but an easy one to miss precisely because `SUPER_ADMIN`'s branch needs no change at all, which could make it look like nothing needs touching in this function.

**Server-side mirror**: `requireRole(allowedRoles: PlatformAdminRole[])` in `server/http/auth-guard.ts:43-49` is the server's actual enforcement primitive — it's what `plans.controller.ts:34,48,68` already calls (`requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN])`) for its own mutating routes. `feature-flags.controller.ts` (§4) calls `requireRole([PlatformAdminRole.SUPER_ADMIN])` for every mutating route — the global `PATCH`, and the org-override `PUT`/`DELETE` — matching `FEATURE_FLAG_MANAGE`'s grant of `SUPER_ADMIN`-only. This is the real security boundary; the client-side `hasPermission()` check in `FeatureFlagsView.tsx` is advisory/UX-only, same relationship every other mutating endpoint in this app already has with its frontend.

**Grant**: `FEATURE_FLAG_MANAGE` → `SUPER_ADMIN` only, matching `docs/ops-dashboard-prd.md` §4's explicit "Full access... feature flags" grant to `SUPER_ADMIN`, and the PRD's silence on feature flags for `BILLING_ADMIN`/`SUPPORT` (silence read as "not granted," consistent with how `BILLING_ADMIN`'s own capability list is scoped strictly to billing/plan actions and doesn't reach into other domains).

**No per-flag variation, no per-org variation** — one flat check covers the entire feature-flags domain: the global toggle and every org-override `PUT`/`DELETE` all gate on the same `FEATURE_FLAG_MANAGE` action, for every flag. This is the direct resolution of the original draft's Open Question 9.2, old numbering ("`BILLING_ADMIN`'s actual flag-toggle permissions" / per-flag `toggleableByRoles` defaults) — that question no longer applies, since there's no per-flag role data left to configure. `SUPPORT` remains read-only (can view flag state and existing org overrides, matching the read-open GET routes in §3), consistent with the PRD's "read-heavy... cannot edit... destructive org state" framing and with the mock's pre-existing (and, on this point, correct) `isSupport` read-only behavior.

---

## 8. Phased implementation order

Each phase is independently shippable and leaves the app in a working state — no phase requires a later phase to already exist, matching how `docs/billing-portal-audit-and-implementation-plan.md` sequenced its own phases.

1. **Schema + migration** — add `FeatureFlagSeverity` enum, `FeatureFlag` model (with `supportsOrgOverride`, no `toggleableByRoles`), and `FeatureFlagOrgOverride` model to `prisma/schema.prisma`, generate migration, seed 6 rows via `prisma/seed.js` (§2.2's table). Zero behavior change; nothing reads these tables yet. Safe to ship alone.
2. **Service + repository + controller + routes** — `server/features/feature-flags/*`, all four route files (§3: base list/get/patch, plus the two org-override routes), wire into `server/container.ts`. Audit logging (§1.6/§4's `writeAuditLogEntry` calls) is part of this phase, not a separate one. Add `FEATURE_FLAG_MANAGE` to `lib/hooks/useAuth.ts`'s `hasPermission()` (including the `SUPPORT` exclusion-list fix noted in §7) and wire `requireRole([PlatformAdminRole.SUPER_ADMIN])` into the controller's mutating routes. Write `docs/api/feature-flags-api.md` here too. Safe to ship independently — endpoints exist and are fully functional, but the frontend still points at `localStorage`, so nothing user-facing changes yet. Good point to manually verify with `curl`/Postman against a real admin session, including a `SUPPORT`-role session confirming the org-override `PUT`/`DELETE` routes correctly 403.
3. **Frontend swap, global toggle only** — `lib/api/ops.ts`, `lib/hooks/useOps.ts` (§6.1, §6.2), then `FeatureFlagsView.tsx`'s severity-driven and `canManage`-driven changes (§6.3 points 1–3). This is the point where the ops dashboard's global flag state becomes genuinely shared/persistent/audited across all admins — a real improvement even before org overrides or anything in `Quizbuzz-new` exist. Verify: two browser sessions (or one normal + one incognito) both see the same toggle state and the same Audit Log entries; a `SUPPORT`-role session sees the toggle disabled.
4. **Org-override schema, API, and `FeatureFlagsView.tsx` org-management UI** — this is new relative to the original draft's phase structure, inserted here because org overrides are core scope, not a later extension. Covers: verifying phase 1's `FeatureFlagOrgOverride` migration and phase 2's org-override endpoints are fully working end-to-end (if not already exercised via curl in phase 2), then building §6.3 point 4's "Manage organizations" panel in `FeatureFlagsView.tsx` — list/add/remove overrides, gated by `canManage`, only rendered for `supportsOrgOverride: true` flags. Verify: setting an override for one org, confirming it shows in the panel with the right `reason`/`createdByName`, removing it, confirming the audit log captures both actions with `organizationId` in the metadata (§4).
5. **`Quizbuzz-new` schema + org-aware `isFeatureEnabled()` SDK** — add `PlatformFeatureFlag` and `OrganizationFeatureFlagOverride` models + migration on the main-app side (§2.3), add `src/common/effective-flag-state.ts` and the org-aware `src/common/feature-flags.ts` (§5.1) there, built with the `{ organizationId? }` signature from the start rather than as a later addition — org-awareness is core scope now, so there's no separate "add org support" phase after this one. No call sites wired yet — purely additive, and testable in isolation (manually upsert both a global row and an org-override row, confirm `isFeatureEnabled(key)` and `isFeatureEnabled(key, { organizationId })` resolve correctly per §5.1's resolution order, confirm cache TTL and per-org cache-key behavior).
6. **Ops → main-app write-through, both global and org-scoped** — add the `queryMainDb` UPSERT calls to `FeatureFlagsService.toggleFlag()`, `.setOrgOverride()`, and `.removeOrgOverride()` (§5.1 step 2/§4's `syncFlagToMainApp`/`syncOrgOverrideToMainApp`/`syncOrgOverrideRemovalToMainApp`). Now toggling or setting an org override in the ops dashboard actually changes rows `Quizbuzz-new` can see — but still nothing reads them yet, so still zero behavior change in the live product. Verify by querying `Quizbuzz-new`'s DB directly after each operation type.
7. **Enforcement, one flag at a time, starting with `maintenance_mode`** — `maintenance.middleware.ts` (§5.2) first, since it's the highest-value, most self-contained, org-unaware flag (one middleware, one allowlist, no interaction with existing env-var flags, no org context to thread through). Also add the `FeatureUnavailableError`/`FEATURE_DISABLED` shared error shape (§5.1a) in this phase, since the first org-overridable flag wired up in the next step needs it. Then `new_registrations_paused` (also org-unaware), then the four org-overridable flags — `razorpay_gateway_active`, then `proctoring_enabled_platform_wide`/`certificate_auto_delivery`/`enhanced_analytics_pipeline` reconciled with their existing env vars last (§5.3's `env && resolvedDbValue` ceiling pattern) since that touches already-working production code paths and deserves its own careful rollout, possibly flag-by-flag with a feature branch per env-var reconciliation. Each org-overridable flag's call site(s) must pass `{ organizationId }` through — verify by setting an org override and confirming only that org's behavior changes.
8. **Frontend "feature unavailable" component in `Quizbuzz-new`** — build the `FeatureUnavailableNotice`-equivalent component (§5.1a) that recognizes the `FEATURE_DISABLED` error code and renders consistent copy; wire it into whichever screens the phase-7 call sites affect. Since no comparable component was found during this audit, treat this as new frontend scope, not a small addition.
9. **Cleanup** — remove `INITIAL_FEATURE_FLAGS`/`featureFlags` from `lib/data/db.ts`'s `MockDatabase` (§6.5), narrow `lib/api/auditLog.ts`'s `targetType` union. Do this only after phases 3–4 have been live and verified for a reasonable period — it's the one phase that removes a fallback rather than adding a capability.
10. *(Optional, only if needed)* **Push-invalidation endpoint** (§5.4) — add if TTL-based staleness on `maintenance_mode` (or, once org overrides are enforced, on a specific org's override) proves too slow in practice. Not scheduled by default.

---

## 9. Open questions before implementation

The old RBAC question (originally "`BILLING_ADMIN`'s actual flag-toggle permissions" / per-flag `toggleableByRoles` defaults) is **removed** — §7 resolves it outright: one flat `FEATURE_FLAG_MANAGE` permission, granted to `SUPER_ADMIN` only, no per-flag or per-org variation. New questions specific to org overrides are added first below; the still-genuinely-open questions from the original draft follow, renumbered.

**Org-override-specific (new):**

1. **Should org overrides support `expiresAt`** — e.g. a temporary trial of an add-on feature for one org that auto-reverts to the global default after N days? §2.1's `FeatureFlagOrgOverride.expiresAt` and §3.5's validator already have the column/field ready, but nothing in this plan builds the actual "auto-expire" enforcement (it would just stop being read as active by `isOrgOverrideActive()` in §5.1 once past `expiresAt` — no scheduled job needed, unlike a scheduled *global* toggle would require, per Open Question 9.7). Confirm whether this is wanted for V1 or can be deferred (schema already supports adding it later either way).
2. **Does removing an org override need a confirmation step in the UI?** Given it changes what an org's end users actually see (potentially revoking access to a feature they've been using), §6.3 point 4 flags this but leaves it open rather than assuming yes or no.
3. **Should the flag list itself show which orgs have an override (a count badge), or only reveal that on drill-in?** E.g. "Proctoring — 3 org overrides" directly in the main `FeatureFlagsView.tsx` list versus only visible after opening the "Manage organizations" panel. Affects whether `GET /api/v1/ops/feature-flags` (§3.1) needs to return an override count per flag or whether that's a separate lazy-loaded call.
4. **Is there a need to bulk-apply an override to multiple orgs at once** (e.g. "enable `enhanced_analytics_pipeline` for these 5 orgs" in one action), or is one-org-at-a-time via `PUT .../organizations/[orgId]` (§3.5) sufficient for V1? Bulk apply would need either a new batch endpoint or client-side looping over the existing per-org endpoint — worth deciding before building the UI, since the UI's "add override" form (§6.3 point 4) looks different for single-org vs. multi-select.

**Still open from the original draft (renumbered):**

5. **Cache invalidation strategy and TTLs** — is TTL-only polling (no push, §5.1) acceptable, or is the push-invalidation endpoint (§5.4) wanted from V1? And are the proposed numbers (5s for `maintenance_mode`/`new_registrations_paused`, 60s for the rest) right, or does `maintenance_mode` specifically need to be near-real-time (i.e., build §5.4 immediately rather than as a follow-up)? This now also applies to org-override propagation speed, not just the two global-only flags.
6. **Fail-open vs. fail-closed on read errors** — if `Quizbuzz-new`'s own DB read for a flag (or its org override) fails (not "flag/override doesn't exist," but a genuine query error), should `isFeatureEnabled()` default to `false` (favor availability — an unrelated ops-DB hiccup never accidentally maintenance-locks the whole platform, or accidentally strips an org's paid add-on) or `true`/last-known-value (favor "when in doubt, assume the more restrictive state")? §5.1's proposed implementation defaults to availability (serve stale cache, else `false`) — confirm this is the right tradeoff, since it's a real product-risk decision, not a technical one.
7. **Env-var flags vs. DB flags for `proctoring`/`certificates`/`analytics`** — should the DB flag fully replace the existing `ENABLE_*` env vars, or should the env var remain a deploy-time hard ceiling that the DB flag (global or org-resolved) can only narrow (§5.3's `env && resolvedDbValue` proposal)? Also worth confirming at implementation time whether `ENABLE_CERTIFICATES`/`ENABLE_ANALYTICS` are actually wired to any call site today the way `ENABLE_PROCTORING` provably is (I found 3 real call sites for proctoring; I did not find equivalent call sites for the other two in the time spent on this audit — worth a targeted re-check before assuming they're "real" the same way proctoring is).
8. **Does the ops dashboard need to gate its own behavior during `maintenance_mode`**, or is `maintenance_mode` purely a `Quizbuzz-new`-facing switch with the ops dashboard only ever *displaying* its state (as it does today via the banner)? Affects whether this repo's own `middleware.ts`/route handlers need any changes at all (§5.2's closing note). Unaffected by the org-override pivot since `maintenance_mode` is explicitly non-org-overridable.
9. **`razorpay_gateway_active` scope** — does it need to gate only `Quizbuzz-new`'s contest-registration payments, or also this repo's own `app/billing/checkout/page.tsx` subscription-payment flow (which integrates Razorpay independently, per the currently-in-progress billing-portal work)? If both, that's two separate call sites in two separate repos reading the same flag, and — since this flag is org-overridable — both need to resolve the same org's effective state consistently.
10. **Independent kill switch for the feature-flag system itself** — if `feature_flags`/`feature_flag_org_overrides`/`platform_feature_flags`/`organization_feature_flag_overrides` tables or the service layer ever break, is a config-level "assume all flags off, ignore all overrides" escape hatch wanted, or is "fix the bug" an acceptable answer given the internal-tool, ~10-15-user scale described in the PRD's Purpose section?
11. **Scheduled/timed toggles for the global value** — e.g. auto-clear `maintenance_mode` after N minutes as a safety net against an admin forgetting to turn it back off. Not requested anywhere in the current mock or PRD, but common in comparable ops tooling — worth an explicit "not needed" or "yes, add it" before implementation, since (unlike org-override expiry, question 1 above, which needs no scheduled job) a global auto-revert would need an actual scheduled-job component.
12. **Self-serve flag creation** — §3 deliberately omits `POST`/`DELETE` on the base flags resource (flags managed via migration + seed only; org overrides, by contrast, are already designed for ad hoc dashboard creation). Confirm that's acceptable, or whether ops admins should eventually be able to create ad hoc *flags* (not just overrides) from the dashboard itself (bigger scope — would need key-format validation, collision handling with real call-site names, etc.).

---

Nothing in this plan has been implemented. Let me know which phases to proceed with, or if you want any of the open questions in §9 resolved differently first.
