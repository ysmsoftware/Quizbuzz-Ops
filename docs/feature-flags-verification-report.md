# Feature Flags — Independent Verification Report

Verified by reading the actual working-tree files in both repos (uncommitted, per `git status --short`), the real migration SQL, and by running the real typecheckers. No summary was trusted; every claim below cites file:line.

---

## (a) Checklist verification

### 1. Data model correctness — CONFIRMED, exact match to plan §2.1/§2.3

- `prisma/schema.prisma:264-316` (ops): `FeatureFlag` has no `toggleableByRoles`, has `supportsOrgOverride Boolean @default(true)` (line 276), `FeatureFlagOrgOverride` has `removedAt`/`removedById`/`removedReason` (lines 307-309). Matches §2.1 verbatim.
- Migration `prisma/migrations/20260809055235_add_feature_flags/migration.sql` — actually generates both tables, the enum, the unique index on `key`, the FK from `feature_flag_org_overrides.flagKey` → `feature_flags.key`. Real, not a stub.
- `Quizbuzz-new/backend/prisma/schema.prisma:1063-1081`: `PlatformFeatureFlag` (key/isEnabled/updatedAt) and `OrganizationFeatureFlagOverride` (composite `@@id([key, organizationId])`) match §2.3 verbatim.
- Migration `Quizbuzz-new/backend/prisma/migrations/20260809060839_add_platform_feature_flags/migration.sql` — real `CREATE TABLE`s, composite PK, matching index. Confirmed by reading the SQL, not just the schema.

### 2. RBAC — CONFIRMED, the deny-list gotcha was correctly handled

- `lib/hooks/useAuth.ts:56`: `return !['BILLING_REFUND', 'PLAN_UPDATE_PRICING', 'ORG_DELETE', 'FEATURE_FLAG_MANAGE'].includes(action);` — `FEATURE_FLAG_MANAGE` **is** in `SUPPORT`'s exclusion list. This is the exact gotcha the plan warned about (§7) and it was NOT missed.
- `BILLING_ADMIN`'s allow-list (`useAuth.ts:59`) correctly omits `FEATURE_FLAG_MANAGE` — no change needed, none made.
- Server-side: `server/features/feature-flags/feature-flags.controller.ts:32,45,52` — `requireRole([PlatformAdminRole.SUPER_ADMIN])` gates `toggleFlag`, `setOrgOverride`, `removeOrgOverride` (the 3 mutating routes). `listFlags`/`getFlag`/`listOrgOverrides` (lines 16-23, 38-42) only call `getSessionAdmin()` — read-open, no role gate. Matches §3/§4/§7 exactly.

### 3. Resolution logic — CONFIRMED, no cache-key leak

- `Quizbuzz-new/backend/src/common/effective-flag-state.ts:24-36` — `computeEffectiveFlagState()` matches the plan's code verbatim: active override wins outright, else global default.
- `Quizbuzz-new/backend/src/common/feature-flags.ts:34` — `const cacheKey = \`${key}:${orgId ?? "global"}\`;` — **cache key correctly includes org ID.** No cross-org leak risk found.
- `expiresAt` is real, not a decorative column: `isOrgOverrideActive()` (`effective-flag-state.ts:24-26`) checks `override.expiresAt === null || override.expiresAt > now`, called from `computeEffectiveFlagState`, which is called from `isFeatureEnabled` (`feature-flags.ts:51`). An expired override correctly falls through to the global default.
- Ops-side resolution (`server/features/feature-flags/is-feature-enabled.ts:11-23`) is a separate, simpler function (ops reads its own DB directly, no cache needed since ops IS the source of truth) — same resolution order, expiry check present (`override.expiresAt === null || override.expiresAt > new Date()`, line 17). Correct.
- `isProctoringEnabled()` (`feature-flags.ts:73-79`) implements the plan's `env.ENABLE_PROCTORING && resolvedDbValue` ceiling correctly: `if (!config.features.proctoring) return false;` then falls through to `isFeatureEnabled(...)`. Not inverted, not `||`.

### 4. Enforcement call sites — CONFIRMED wired, one messaging deviation noted

- **`maintenance.middleware.ts`** (`Quizbuzz-new/backend/src/middlewares/maintenance.middleware.ts:15-24`) mounted at `app.ts:81`: `app.use('/api/v1', maintenanceGate, apiRouter);` — runs after body-parsing/CORS/cookies (lines 34-74) but before every `/api/v1` route handler. `/health` (`app.ts:90`) and `/metrics` (`app.ts:84`) are registered outside `/api/v1` so they're never gated — no explicit allowlist needed, by construction. Returns `503` with `Retry-After: 300` and body `{ success: false, code: "MAINTENANCE_MODE", message: "..." }`. **Minor deviation from plan**: plan's §5.2 pseudocode nested the code as `error: { code: 'MAINTENANCE_MODE' }`; the actual code puts `code` at the top level — this matches this codebase's own pre-existing error-envelope convention (see `error.middleware.ts`), not a bug, just a documentation/plan mismatch.
- **`new_registrations_paused`**: wired and called, `contest.service.ts:687` — `if (await isFeatureEnabled("new_registrations_paused")) throw new FeatureUnavailableError(...)`, inside `registerParticipant()`, checked before OTP token verification. Real, not just present in the plan.
- **`razorpay_gateway_active`**: wired in both places. `Quizbuzz-new/backend/src/modules/payment/payment.service.ts:49` — org-aware check before payment initiation. `quizbuzz-ops-next/app/api/v1/billing-portal/subscription/order/route.ts:55` — `isFeatureEnabled('razorpay_gateway_active', organizationId)` before any Razorpay order is created. Both real.
- **`proctoring_enabled_platform_wide`**: all 3 call sites confirmed correct, not inverted, using `&&` semantics via the centralized `isProctoringEnabled()` wrapper:
  - `proctoring.service.ts:112` — `if (!(await isProctoringEnabled(organizationId))) return;`
  - `capture-metadata.worker.ts:68` — `if ((await isProctoringEnabled(organizationId)) && !isSnapshot) { ... }`
  - `quiz.gateway.ts:268` — `if (!(await isProctoringEnabled(organizationId))) { return; }`
  - Note: `quiz.gateway.ts` also has an unrelated private method also named `isProctoringEnabled` (line 141, per-contest DB lookup) — confusingly similar name, but accessed via `this.isProctoringEnabled()` vs. the bare imported function; TypeScript resolves both distinctly and it compiles clean. Not a bug, but worth a rename for readability.
- **`certificate_auto_delivery` / `enhanced_analytics_pipeline`**: confirmed genuinely unwired. `grep -rn "certificate_auto_delivery"` and `grep -rn "enhanced_analytics_pipeline"` across `backend/src` and `frontend` return **zero matches** — no half-wired stub, no dead branch. Honest, matches the plan's own §5.3 caveat.

### 5. Error/messaging path — CONFIRMED, fully wired end to end

- `Quizbuzz-new/backend/src/error/http-errors.ts:85-92` — `FeatureUnavailableError extends AppError`, statusCode 403, carries `featureKey`.
- `error.middleware.ts:93-102` — real `instanceof FeatureUnavailableError` branch, maps to `res.status(err.statusCode).json({ success:false, code:"FEATURE_DISABLED", message, featureKey, requestId })`. Not just defined and never caught.
- `frontend/lib/api/apiClient.ts:165-167` — `if (errData.code === FEATURE_DISABLED_CODE) notifyFeatureUnavailable(errData);` inside the shared response handler, so **every** API call automatically triggers the toast — not a standalone function nothing calls. `featureUnavailableToast.ts:18-23` is real, uses `sonner`'s `toast.error(...)`.
- One gap: `maintenance.middleware.ts`'s `MAINTENANCE_MODE` code is **not** special-cased in `apiClient.ts` (only `PLAN_LIMIT_EXCEEDED` and `FEATURE_DISABLED` are, lines 159-167). A blocked request during maintenance still throws `ApiRequestError` with the right `message`, and most mutations in the frontend already do local `catch (err) { toast.error(err.message) }` (e.g. `app/org/messages/page.tsx:128`, `app/org/contests/[id]/results/page.tsx:87` etc.), so most write actions will still show the right message — but there's no guaranteed, centralized "platform is under maintenance" banner/toast the way `FEATURE_DISABLED` gets. This is a real, minor gap versus the plan's stated goal ("must not silently no-op") for read-only page loads that don't have their own `onError` toast — not a hard bug, but worth flagging.

### 6. Frontend (ops dashboard) — CONFIRMED

- `components/views/FeatureFlagsView.tsx:328` — `const isEmergency = flag.severity !== 'STANDARD';` and `:241` — `if (nextValue === true && (severity === 'CRITICAL' || severity === 'WARNING'))` — fully severity-driven, no hardcoded key comparisons in the branching logic itself (a small `CONFIRMATION_COPY` lookup at line 221 still special-cases the two flags' hand-written copy, but explicitly falls through to generic severity-driven copy for anything else — this is intentional per the plan and the code's own comment, lines 216-220).
- `canManage = hasPermission('FEATURE_FLAG_MANAGE')` (line 197), used to gate the toggle switch (`:384`), the confirmation flow (`:233`), and the "Manage organizations" panel's mutating controls (`:113,130`).
- `flag.supportsOrgOverride` correctly gates whether "Manage organizations" renders at all (`:365, :412`) — flags with `supportsOrgOverride: false` (maintenance_mode, new_registrations_paused) show no such affordance.
- `lib/hooks/useOps.ts:28-38` — `onMutate`/`onError`/`onSettled` all present: optimistic `setQueryData`, rollback via `context.previous` on error, invalidate on settle. Real, matches plan §6.2 verbatim.

### 7. `main-db-pool.ts` global-key collision bug — CONFIRMED real, via `git diff`

`git diff -- server/db/main-db-pool.ts` shows the actual before/after:
```
- pool: Pool | undefined;
+ mainDbPool: Pool | undefined;
...
- globalForPool.pool ?? new Pool(...)
+ globalForPool.mainDbPool ?? new Pool(...)
```
`server/db/ops-prisma.ts:6-9` independently caches its own pool under `globalForPrisma.pool` — **same property name `pool`** on the same `globalThis` object both files cast to. Pre-fix, `main-db-pool.ts` also used the bare key `pool`. Since `globalForPool` and `globalForPrisma` are two different type-casts of the identical `globalThis` runtime object, both modules were writing to and reading from the same slot. Whichever module's top-level code executed first in a given Node process would "win" the slot; the second module's `?? new Pool(...)` would short-circuit and silently reuse the first module's `Pool`, which is connected to a different `connectionString` (`MAIN_DATABASE_URL` vs `OPS_DATABASE_URL` — confirmed different, `main-db-pool.ts:15` vs `ops-prisma.ts:12`). Now fixed to a distinct key (`mainDbPool`), confirmed unique in the repo.

**Plausibility caveat, independently verified, worth surfacing precisely**: the caching-under-`globalThis` line (`main-db-pool.ts:45`, `ops-prisma.ts:37-39`) is guarded by `if (process.env.NODE_ENV !== 'production')`. So this bug could only actually manifest in **local/dev mode** (Next.js hot-reload preserving `globalThis` across module reloads), not in a real production deployment, where `NODE_ENV === 'production'` skips the cache-write entirely and each process cold-starts fresh pools every time regardless of key collisions. `organizations.repository.ts` and `overview.repository.ts` both do use `queryMainDb` from `main-db-pool.ts` (confirmed via grep), so the mechanism for "Organizations/Overview silently querying the wrong DB" is real — but only as a **development-environment risk**, not a claim that production users were actually served wrong data. The original claim doesn't distinguish this; it's accurate as a bug but should not be read as "production was broken."

### 8. Typecheck/build — CONFIRMED, ran for real, all three pass clean

- `quizbuzz-ops-next`: no dedicated `typecheck` script in `package.json`; ran `npx tsc --noEmit` directly (using the already-generated Prisma client, since `prisma generate` failed in this sandbox on a network-blocked engine-checksum fetch, unrelated to this feature). **Exit code 0, zero output.**
- `Quizbuzz-new/backend`: `npx tsc --noEmit`. **Exit code 0, zero output.**
- `Quizbuzz-new/frontend`: no `typecheck` script either (only `lint`); ran `npx tsc --noEmit` directly. **Exit code 0, zero output.**

### 9. Seed data — CONFIRMED, exact match to §2.2's table

`prisma/seed.js:134-195` — all 6 flags present with matching `severity`/`supportsOrgOverride`: `maintenance_mode` CRITICAL/false, `new_registrations_paused` WARNING/false, `proctoring_enabled_platform_wide` STANDARD/true, `certificate_auto_delivery` STANDARD/true, `enhanced_analytics_pipeline` STANDARD/true, `razorpay_gateway_active` WARNING/true. Keys/labels/descriptions carried over from the old mock as required.

---

## (b) End-to-end walkthroughs

### Scenario 1 — SUPER_ADMIN turns ON `maintenance_mode`

1. Admin clicks the toggle in `FeatureFlagsView.tsx`. Since `severity === 'CRITICAL'`, a confirmation modal fires (`FeatureFlagsView.tsx:241-258`) with the hand-written "CRITICAL ACTION" copy (`:222-225`). Admin confirms.
2. `useOps.ts:25-43`'s mutation fires `PATCH /api/v1/ops/feature-flags/maintenance_mode`. **Instantly**, before the network call even returns, React Query's `onMutate` optimistically flips the switch in the UI (`useOps.ts:28-34`) — feels immediate to the admin.
3. Server: `feature-flags.controller.ts:31-36` → `requireRole([SUPER_ADMIN])` check → `feature-flags.service.ts:72-94`'s `toggleFlag()`: updates `feature_flags.isEnabled` in ops's own Postgres (source of truth, synchronous, inside the request), writes a `PlatformAuditLog` entry, then calls `this.repo.syncFlagToMainApp(key, isEnabled)` — **not awaited**, fire-and-forget (`.catch()` only, `service.ts:89-91`).
4. `syncFlagToMainApp` (`feature-flags.repository.ts:80-89`) runs an `UPSERT` into Quizbuzz-new's own `platform_feature_flags` table over the shared `queryMainDb`/`MAIN_DATABASE_URL` connection. Since both apps run as long-lived Node processes (not serverless), this background write reliably completes within milliseconds even though the API response to the admin doesn't wait for it.
5. So: ops's own DB is updated synchronously (< the request's own latency, effectively instant to the admin). Quizbuzz-new's DB is updated asynchronously but essentially the same wall-clock moment (a fire-and-forget UPSERT that isn't blocked on anything slow).
6. **The delay a live end user experiences is entirely the cache TTL**, not the write-through: Quizbuzz-new's `isFeatureEnabled('maintenance_mode')` (`feature-flags.ts:29-62`) caches under key `maintenance_mode:global` for `TTL_MS['maintenance_mode'] = 5_000` ms (`feature-flags.ts:24`). So: **up to 5 seconds** after the admin confirms, depending on when that particular Node process's cache entry was last refreshed.
7. Once the cache is stale/missed, the next request through `maintenanceGate` (`maintenance.middleware.ts:15-24`, mounted at `app.ts:81` ahead of every `/api/v1` route) sees `isFeatureEnabled('maintenance_mode') === true` and returns **HTTP 503**, `Retry-After: 300`, body `{ success: false, code: "MAINTENANCE_MODE", message: "The platform is temporarily under maintenance. Please try again shortly." }`.
8. What the end user actually sees: depends on what UI action they were doing. If it's a mutation with its own `onError` toast (most write actions in this codebase have one, e.g. `app/org/messages/page.tsx:128`), they'll see that message in a toast. There is **no dedicated, centralized "platform under maintenance" banner** wired up on the Quizbuzz-new frontend the way `FEATURE_DISABLED`/`PLAN_LIMIT_EXCEEDED` get (`apiClient.ts` only special-cases those two codes, not `MAINTENANCE_MODE`) — so a plain page load with no local error handling could fail more quietly than the plan's "must not silently no-op" goal implies. This is the one real gap found in the messaging layer (see check 5 above).

### Scenario 2 — SUPER_ADMIN turns `proctoring_enabled_platform_wide` OFF for one org (global default stays ON)

1. Admin expands "Manage organizations" on the proctoring flag row (`FeatureFlagsView.tsx:365-374`, only shown because `supportsOrgOverride: true` for this flag), enters the org ID, sets "Disabled", types a required reason, submits (`OrgOverridesPanel`, `:59-71`).
2. `PUT /api/v1/ops/feature-flags/proctoring_enabled_platform_wide/organizations/{orgId}` → `feature-flags.controller.ts:44-49` (`requireRole([SUPER_ADMIN])`) → `feature-flags.service.ts:108-143`'s `setOrgOverride()`: soft-removes any prior active override for that org (sets `removedAt`), creates a fresh `FeatureFlagOrgOverride` row with `isEnabled: false`, writes the audit log entry, then fire-and-forget `UPSERT`s `organization_feature_flag_overrides` on Quizbuzz-new's DB (`feature-flags.repository.ts:91-100`).
3. For that org's users specifically: next time any of the 3 proctoring call sites runs `isProctoringEnabled(organizationId)` for that org (`feature-flags.ts:73-79`, e.g. `quiz.gateway.ts:268` on socket connect, or `proctoring.service.ts:112` on a violation event), the cache key is `proctoring_enabled_platform_wide:{thatOrgId}` — distinct from `proctoring_enabled_platform_wide:global` used for every other org. `computeEffectiveFlagState()` (`effective-flag-state.ts:28-36`) sees the active override and returns `{ value: false, overridden: true }`, which wins outright over the still-ON global default.
4. For every other org, their own cache key is either their own org-scoped key (no override row exists for them → miss falls through to the global default `true`) or the global key — either way they resolve to `true`, unaffected.
5. Concretely: that one org's contest sessions stop recording proctoring events/snapshots (`proctoring.service.ts:112`, `capture-metadata.worker.ts:68` both return early), and `quiz.gateway.ts:138`'s socket connection won't flag `proctoringEnabled` for the platform-wide check (note: line 141's *separate*, per-contest `isProctoringEnabled(contestId)` DB check is unrelated and still runs independently — a contest could still have its own `proctoringEnabled` column set, but the org-level kill switch at line 268 stops violation processing regardless). All other orgs see no change.
6. Propagation delay: `DEFAULT_TTL_MS = 60_000` (`feature-flags.ts:27`) applies here since `proctoring_enabled_platform_wide` isn't in the fast-path `TTL_MS` map (only `maintenance_mode`/`new_registrations_paused` get 5s) — so **up to 60 seconds** before an in-flight cached value for that org expires and the new override takes effect for that org's users.

### Scenario 3 — SUPER_ADMIN turns `razorpay_gateway_active` ON for one org whose global default is OFF (custom add-on granted to one org)

1. Precondition: imagine ops turns the global `razorpay_gateway_active` flag OFF platform-wide first (`PATCH /api/v1/ops/feature-flags/razorpay_gateway_active`, `severity: WARNING` so a confirmation dialog fires per `FeatureFlagsView.tsx:241`) — now no org can pay via Razorpay by default.
2. Admin then adds an org override for one specific org: `PUT /api/v1/ops/feature-flags/razorpay_gateway_active/organizations/{orgId}` with `isEnabled: true` and a required reason (e.g. "Custom arrangement, contract dated..."). Same `setOrgOverride()` path as Scenario 2 (`feature-flags.service.ts:108-143`), UPSERTs `organization_feature_flag_overrides` for that `(key, orgId)` pair on Quizbuzz-new's DB.
3. That org's users: when a participant attempts to pay for a contest, `payment.service.ts:49` calls `isFeatureEnabled("razorpay_gateway_active", { organizationId: participant.organizationId })`. Cache key `razorpay_gateway_active:{thatOrgId}` — on a fresh lookup, `computeEffectiveFlagState()` finds the active override (`isEnabled: true`) and returns `true`, overriding the OFF global default. Payment proceeds normally.
4. Every other org: no override row exists for them, so their org-scoped cache key misses to the global default (`false`), and `payment.service.ts:50-53` throws `FeatureUnavailableError("razorpay_gateway_active", "Payments are temporarily unavailable for this organization...")` → `error.middleware.ts:93-102` → `403` with `code: "FEATURE_DISABLED"` → frontend `apiClient.ts:165-167` automatically fires `notifyFeatureUnavailable` toast. Their payment attempts are blocked with a real, visible message — not a silent failure.
5. Timing: default 60s TTL applies (`razorpay_gateway_active` not in the fast-path map either) — up to 60 seconds after the override is set before that org's users can actually pay, if a cached "false" value was already in memory for that org's cache key from a prior request.

---

## (c) Top-line verdict

**This is genuinely working as designed, not a half-built facade.** Every one of the 9 checks holds up under direct code inspection: the data model, migrations, RBAC (including the specific deny-list gotcha the plan called out), the cache-key-per-org resolution logic (no cross-org leak), all 5 real enforcement call sites, the error/messaging path end-to-end, the frontend severity/RBAC-driven UI with real optimistic updates, and all three typechecks passing clean with zero errors. The `main-db-pool.ts` global-key-collision bug claim is real and independently confirmed via `git diff`, though its practical blast radius is dev-mode-only, not production (the caching is skipped when `NODE_ENV === 'production'`).

**Two real, minor gaps found** (not blockers, but worth a human decision before calling this fully done):
1. `MAINTENANCE_MODE` is not special-cased in `Quizbuzz-new/frontend/lib/api/apiClient.ts` the way `FEATURE_DISABLED`/`PLAN_LIMIT_EXCEEDED` are — most write actions still surface the message via their own local `onError` toast, but there's no guaranteed, centralized maintenance banner, so some read-only page loads could fail without a clear message to the end user.
2. `quiz.gateway.ts` has two same-named `isProctoringEnabled` — a private per-contest-DB-check method and the imported org-aware flag-SDK function — both compile correctly (different call syntax) but the naming collision is a readability/maintenance risk worth a rename.

No inverted logic, no `||` vs `&&` mistakes, no missing RBAC exclusion, no cache-key leak, no unwired-but-claimed-wired flags found.
