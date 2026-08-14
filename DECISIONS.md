# Decisions & incident log (ops-next)

Companion to `Quizbuzz-new/backend/DECISIONS.md`, which owns everything
cross-cutting (the BullMQ jobId-dedup bug class, the audit-log architecture,
the feature-flag access-model bug and its fix). Read that file first — this
one only covers what's specific to this repo: its own tooling incidents, the
new audit-log read module, and the flag registry's new typing.

---

## 1. Tooling incidents

Both fully covered in the main repo's `DECISIONS.md` §2a/2b/2d — the
`next lint` circular-JSON crash (version mismatch between `next` and
`eslint-config-next`), the Next 15→16 + nodemailer 6→9 upgrade (middleware→proxy
rename, `next lint` removal, the `eslint` 10→9 pin, the `cacheComponents`
`instant=false` codemod artifact, the lint-scope expansion into `server/`),
and npm's native `approve-scripts` gate silently breaking `prisma generate`
on a fresh install. All of it happened in this repo; read it there rather
than duplicating it here.

One more, ops-next-specific: `dotenv`'s rotating CLI tip (§2c in the main
file) was first spotted running `npx prisma generate` in *this* repo —
investigated and confirmed benign (genuine upstream self-promotion, not a
compromised package). Don't re-flag it.

---

## 2. Main-app audit log read module

New sibling to the existing `audit-log` feature:
`server/features/audit-log-main-app/*` (controller/service/repository/types/validator),
following the exact same DI-via-constructor shape as the original. Reads
`Quizbuzz-new/backend`'s new `audit_logs` table cross-DB, read-only, via the
pre-existing `queryMainDb` pool (`server/db/main-db-pool.ts`) — same pattern
`organizations.repository.ts` already used for main-app reads. This app
never writes to that table.

New route: `app/api/v1/ops/audit-log/main-app/route.ts`. Registered in
`server/container.ts` alongside the existing `auditLogController`.

`PlatformAuditLog` (this app's own audit table) gained a `requestId String?`
column + index, for the same request-chaining the main app's table has —
existing rows get `NULL`, no backfill. `writeAuditLogEntry()` in
`server/audit/audit-writer.ts` takes an optional `requestId` param now, but
**most existing call sites don't pass one yet** — this repo doesn't have a
single consistent per-request id today (see the two-generators note below).
Not retrofitted across every call site; that's a separable, larger task.

Frontend: `components/views/AuditLogView.tsx` became a thin tab shell
(`Ops Dashboard` / `Main Application`); the two tabs are
`components/views/audit-log/OpsAuditLogTable.tsx` (unchanged logic, moved
verbatim) and `components/views/audit-log/MainAppAuditLogTable.tsx` (new,
adapted to the main app's row shape — `actorType`/`actorLabel` instead of
the ops-specific `actorAdminName`/`actorAdminRole` split, plus
requestId/targetId click-to-filter for one-click trail tracing). Deliberately
**not** merged into one generic parameterized table component — the two
sides' row shapes and domain-specific detail-string formatting genuinely
diverge; forcing one abstraction would have been messier than two similar
files.

**Pre-existing fact worth knowing if you touch request-id anything here:**
this repo already has *two independent, uncorrelated* request-id
generators — `middleware.ts`'s `x-request-id` header (only read by 5 auth
routes via `withApiLogger`) and `envelope.ts`'s `generateRequestId()`
(stamped into every JSON response body, `Math.random()`-based, unrelated to
the header). A single API call can produce two different ids today. Neither
uses `crypto.randomUUID()`. Untangling this wasn't in scope for the
audit-log work; flagging it so nobody assumes there's one canonical request
id in this repo yet.

---

## 3. Feature flag `accessModel` typing

`server/features/feature-flags/feature-flag-registry.ts`'s
`FeatureFlagRegistryEntry` gained a required `accessModel: 'GLOBAL' | 'OPT_IN'`
field — see the main repo's `DECISIONS.md` §4 for the incident this came
from and the exact enforcement semantics. All 7 existing entries are
classified; `ambassador_program_enabled` is the only `'OPT_IN'` one so far.

This field is **TypeScript-only right now** — not synced into the
`FeatureFlag` DB row by `sync-feature-flags.ts`, not in the API response
shape (`feature-flags.types.ts`/`toFlagDetail`), not shown in
`FeatureFlagsView.tsx`. An admin reading the ops dashboard can't currently
see which model a flag uses without reading source. That's a deliberate
scope cut for this pass, not an oversight — wiring it through end-to-end is
a contained follow-up (one migration + a few field additions) but is a
schema change, so it wasn't done without asking first.

**Verification method worth reusing:** rather than hand-editing the DB to
test the fix, the actual `FeatureFlagsService.toggleFlag()` method was
called directly from a throwaway script (real code path, real audit-log
write, real `syncFlagToMainApp` cross-DB write) to confirm both DBs update
correctly end-to-end. Then a second throwaway script directly exercised
`isFeatureEnabled()` against all four cells of the truth table
(global×override) to confirm the fix's actual runtime behavior, not just
that it type-checked. Both scripts were deleted after use — this is the
pattern to reach for again rather than trusting a code review alone for
anything touching cross-DB sync or access-control logic.
