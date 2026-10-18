# Ops Dashboard — Phase 1: Fix What's Broken or Missing

**Status:** AUDIT ONLY. No source file has been changed. Nothing is committed.
**Branch audited:** `feature/institution-mode` (this repo and `../Quizbuzz-new`, both on the same branch, local DBs `quizbuzz_ops_institution` / `quizbuzz_institution`).
**Date:** 2026-10-18
**Companion doc:** [PHASE-2-PREMIUM-UI.md](./PHASE-2-PREMIUM-UI.md) (visual/UX work, only after this phase is signed off).

---

## 0. How this audit was done (and what it did NOT cover)

| Method | Detail |
|---|---|
| Static read | Every dashboard page's view, hook, API client, route, controller, service, repository and validator for the pages listed in §2. |
| Cross-repo read | Main app `feature/institution-mode`: Prisma schema (all 12 institution migrations), `OPT_IN_ONLY_FLAGS`, `effective-flag-state.ts`, audit action names, queue names, ops-metrics module, plan-entitlement counting. |
| Machine checks | `tsc --noEmit`: **clean (0 errors)**. `eslint .`: **178 errors / 73 warnings** (140 `no-explicit-any`, 58 unused vars, 13 `set-state-in-effect`, 1 `rules-of-hooks`, 22 unescaped entities, 7 `<img>`, 4 `location.assign`). |
| Data check | Ran read-only SQL against the local institution DB to reproduce the duplicate-rows bug (§2.3 OVR-1) and to confirm real data exists to test with (3 orgs, 20 groups, 38 learners, 48 portal-enabled contacts, 8 WINDOW contests, 26 ASSIGNED participants, 5 gradebook categories). |

**Not done:** I did **not** log in and click through the UI (admin password/OTP not available to me). Findings marked `[code]` come from reading code; `[db]` were reproduced against the local DB. Please treat `[code]` findings as "near-certain, verify on first fix". Depth per page is in §2; **Contest Calculator (1,302 lines), Infra & Cost (hidden, mock), Payout Account tab, Colleges CRUD modals and Ambassador field builder got a light pass only.**

**Severity:** **P0** = wrong/broken behaviour users hit now, or a security hole · **P1** = misleading, missing institution visibility, or latent bug · **P2** = cleanup/hardening.

**Count:** 10 P0 · 42 P1 · 18 P2 (70 findings, IDs in §2).

---

## 1. One-screen summary

1. **Filters are broken on the most-used page.** Organizations → Status filter sends `ACTIVE`/`SUSPENDED` but the API only accepts lowercase, so picking a status makes the request fail and the table shows "No Organizations Found". The Plan filter is sent as an *id* under the wrong name and the server ignores it anyway. Sorting only sorts the 8 rows on screen.
2. **Repeated rows:** the Overview "Recent organizations" query joins every contact of an org, so one org appears several times (reproduced: same org ×4 on the local DB).
3. **Participants tab "Paid" filter can never match** (UI says `PAID`, data says `SUCCESS`), only 3 of 9 statuses are filterable, and the tab downloads every participant of the org at once.
4. **Institution mode is invisible in Ops** beyond the on/off flags: no learners/groups/portal/gradebook counts per org, no timing-mode/audience on contests, `ASSIGNED` participant status unknown to the UI, gradebook audit events not filterable, live metrics blind to WINDOW contests.
5. **Feature-flag screen misleads for OPT_IN flags** (all five institution flags): it says "all follow the global default" when the truth is "off unless granted", hides the access model, doesn't show that `institution_mode` and `gradebook` need `participant_portal`, and has no per-organization "what does this org have" view.
6. **Dead / fake UI:** New Organization and Edit Organization always error; "Delete organization" is really suspend; "Reset demo data", impersonation and the Bookings "provisioning" animation do nothing real; 3 mock localStorage modules still feed the live layout.
7. **Security:** admin OTP uses `Math.random`, is stored in plaintext and has no attempt limit; JWT/shared secrets have guessable defaults that boot silently in production.
8. **Duplication:** 11 hand-rolled pagination footers, ~10 distinct status-badge maps, 67 inline `en-IN` formatters, 36 manual `/100` conversions, 3 copies of the SQL param builder, 2–3 copies of the "owner" subquery, 2 hand-maintained audit-action lists. §4 proposes the shared modules.

---

## 2. Page-by-page audit

Legend — **Depth:** D = read end-to-end, M = read main paths, L = light pass. **State:** ✅ no defects found in code, ⚠️ works but has defects, ❌ core behaviour broken.

| Page | Route | Depth | State |
|---|---|---|---|
| Login | `/login` | M | ⚠️ security (SEC-1/2) |
| Overview | `/dashboard` | D | ⚠️ |
| Organizations (list) | `/dashboard/organizations` | D | ❌ filters |
| Organization detail | `/dashboard/organizations/[id]` | D (tabs: overview, contests, participants; M: members, payments, notes; L: payout, subscription) | ⚠️ |
| Subscription Plans | `/dashboard/plans` | M | ✅ |
| Billing & Revenue | `/dashboard/billing` | D | ⚠️ |
| Payments | `/dashboard/payments` | D | ✅ (best-built page; use as the pattern) |
| Messaging | `/dashboard/messaging` | M | ⚠️ |
| Contest Calculator | `/dashboard/calculator` | L | not assessed |
| Bookings | `/dashboard/bookings` | D | ⚠️ |
| Audit Log (3 tabs) | `/dashboard/audit-log` | D | ⚠️ |
| Feature Flags | `/dashboard/flags` | D | ⚠️ |
| Ambassador Types | `/dashboard/ambassador-types` | M | ✅ |
| Colleges & Departments | `/dashboard/colleges` | M | ✅ (client-side over all 2,864 rows) |
| Application Logo | `/dashboard/app-logo` | L | ✅ |
| Ops Metrics | `/dashboard/metrics` | M | ⚠️ WINDOW-blind |
| Payouts (hidden nav) | `/dashboard/payouts` | M | ⚠️ duplicate entry |
| Infra & Cost (hidden nav) | `/dashboard/infra` | L | mock data only |
| Shell: layout, command palette | all | D | ⚠️ |

### 2.1 Shell (layout, ⌘K palette)

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| LAY-1 | P1 | Every dashboard page calls `useOps()`, which loads **mock** infra + scaling (localStorage `quizbuzz_super_admin_mock_db`) and the flag list. The shell only needs the `maintenance_mode` value. | `app/dashboard/layout.tsx:90`, `lib/hooks/useOps.ts`, `lib/api/ops.ts:20-29`, `lib/data/db.ts` `[code]` | New small `useMaintenanceFlag()`; move mock infra/scaling hooks next to the hidden Infra page only. |
| LAY-2 | P0 | ⌘K palette routes to `/dashboard/organizations?orgId=<id>`; the list page never reads `orgId`, so choosing a result just opens the list. | `CommandPalette.tsx:46`, `OrganizationsView.tsx` (no `searchParams`) `[code]` | Route straight to `/dashboard/organizations/<id>`. |
| LAY-3 | P1 | Palette fires an org query on every keystroke (no debounce) and on every page even while closed. | `CommandPalette.tsx:17` `[code]` | `useDebouncedValue`, `enabled: isOpen`. |
| LAY-4 | P2 | "Impersonation" is dead code: only a listener + `OrgImpersonateModal` exist; nothing dispatches `quizbuzz_impersonate`, and there is no server-side impersonation. A toast would say "You are now viewing the system as X" while nothing changes. | `layout.tsx:99-137`, grep shows no dispatcher `[code]` | Delete listener, modal and the 3 localStorage keys. |
| LAY-5 | P2 | `quizbuzz_flag_updated` event is dispatched but never listened to. | `FeatureFlagsView.tsx:283` `[code]` | Delete. |
| LAY-6 | P2 | `<img>` for avatars/logos (7 sites), 13 `setState`-in-effect warnings, `window.location.href` with relative paths (4 sites). | ESLint `[code]` | Clean up in the same touch as each file. |

### 2.2 Login & auth

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| SEC-1 | P0 | Admin OTP: generated with `Math.random()`, stored **plaintext** in `platform_admins.otpCode`, compared with `!==`, and **no limit on wrong attempts** (6 digits, valid `OTP_EXPIRY_MINUTES`) → brute-forceable. No rate limit on `/auth/login` either. | `platform-auth.service.ts:44-120` `[code]` | `crypto.randomInt`, store a hash, constant-time compare, attempt counter (e.g. 5) that invalidates the code, per-IP+email rate limit via existing Redis. |
| SEC-2 | P0 | `OPS_JWT_ACCESS_SECRET`, `OPS_JWT_REFRESH_SECRET`, `OPS_METRICS_SECRET`, `OPS_SETTINGS_SECRET` have **public default values**; production would boot with them if the env var were missing. | `server/config/env.ts:9-29` `[code]` | In production, require them (no default) and reject known defaults at boot. |
| SEC-3 | P1 | Billing checkout returns users to `${mainApp}/org/settings?tab=billing…`; since Step 6 organizer URLs are `/org/[orgSlug]/…`. Works only through the legacy redirect, and only if that redirect keeps the query string. | `app/billing/checkout/page.tsx:144,149,247,311` vs `00-plan.md` Step 6 `[code]` | Verify against the running main app; if query is dropped, include `orgSlug` in the billing session and build the new URL. |
| SEC-4 | P2 | Login OTP printed to server console and returned in the response when `NODE_ENV=development`. Gated correctly; keep, but make sure staging isn't `development`. | `platform-auth.service.ts:70-80` | Document only. |

### 2.3 Overview

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| OVR-1 | P0 | **Repeated rows.** `getRecentOrgs` does `LEFT JOIN contacts c ON c."organizationId" = o.id` (and `org_members`), multiplying each org by its contact count. With `LIMIT 5` the list can be one org five times. | `overview.repository.ts:119-130`. Reproduced `[db]`: `01KZDY3D9383MQF0MJQSJ4NRMK` returned **4×** in the first 5 rows. | Replace the joins with the same `LIMIT 1` owner subquery used by the org list (shared fragment, §4). |
| OVR-2 | P1 | "Upcoming contests" has **no status filter** (includes DRAFT and CANCELLED) and the client hard-codes `status: 'PUBLISHED'`. It also keys on `startTime`, so a **WINDOW** contest that is open right now (startTime passed, `endTime` future) disappears. | `overview.repository.ts:89-112`, `lib/api/overview.ts` `[code]` | `status IN ('PUBLISHED','REGISTRATION_CLOSED','LIVE')`; for WINDOW use `endTime >= NOW()`; return real status + `timingMode`. |
| OVR-3 | P1 | "Reset Demo Data" button resets the localStorage mock DB (nothing real). | `OverviewView.tsx:49-53` `[code]` | Remove button + import of `lib/data/db`. |
| OVR-4 | P2 | Recent-org `planId` hard-coded `'starter'`; logo is a generated avatar. | `lib/api/overview.ts` | Return plan from the same source as the org list. |
| OVR-5 | P1 | Org-growth chart: `GROUP BY week` omits weeks with zero signups, so the x-axis skips and the trend looks steeper than it is. "Total participants" counts every status (ASSIGNED, PENDING_PAYMENT, ABSENT) with no breakdown. | `overview.repository.ts:73-87,53-56` `[code]` | `generate_series` for weeks; show registered vs assigned vs submitted. |
| OVR-6 | P1 | No institution KPIs (orgs with institution features on, learners, groups, WINDOW contests live). | — | Add (see §3). |

### 2.4 Organizations list

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| ORG-1 | P0 | **Status filter fails.** Options send `ACTIVE`/`SUSPENDED`; server schema is `z.enum(['all','active','suspended','deleted'])`. The request 400s; the view never reads `isError`, so it renders the "No Organizations Found" empty state. | `OrganizationsView.tsx:311-313` vs `organizations.validator.ts:7` `[code]` | One shared status-options constant (lowercase values); surface `isError` with a retry. |
| ORG-2 | P0 | **Plan filter does nothing.** Client sends `planSlug=<plan.id>` (an id, not a slug); schema accepts `planSlug` but controller → service → repository never use it. | `lib/api/organizations.ts:28`, `OrganizationsView.tsx:328`, `organizations.repository.ts:getOrganizationsList` `[code]` | Option value = `plan.slug`; filter on main `organizations."planSlug"` (treat `NULL` as `starter`) — or via ops subscriptions if you prefer ops as source of truth (decision D3). |
| ORG-3 | P1 | Sorting is client-side on the **current page of 8** only; "Sort by created" re-orders 8 rows, not the directory. `sort` exists in the schema but is unused. | `OrganizationsView.tsx:194-209` `[code]` | Server-side `sort` (whitelist: name, createdAt, memberCount, contestCount, participantCount) with `ORDER BY`. |
| ORG-4 | P1 | Search box says "name, slug, email, contact person…" but SQL matches name + slug only; also fires a request per keystroke. | placeholder `:286` vs repository `ILIKE` on `o.name`,`o.slug` `[code]` | Add owner email to the SQL; debounce. |
| ORG-5 | P0 | **"New Organization" always fails** ("handled via public tenant signup"); "Edit organization" on the detail page always fails ("managed by tenant owners"). | `lib/api/organizations.ts:116-135` `[code]` | Remove both buttons/modals (recommended, decision D1) or build real endpoints. |
| ORG-6 | P1 | "Delete organization" = `suspendOrganization(id, 'Soft-deleted by platform operator')`. Toast says deleted; the org stays in the list as SUSPENDED; the `deleted` filter value can never return rows. | `lib/api/organizations.ts:151-153` `[code]` | Decision D2: rename to "Suspend", or add a real soft-delete (`isDeleted = true`, audit, owner email). |
| ORG-7 | P1 | Bulk suspend loops sequentially and stops at the first error (e.g. one already suspended), leaving a partial result; success toast claims the full count. | `lib/api/organizations.ts:155-159` `[code]` | `Promise.allSettled`, skip already-suspended, report "n done, m failed". |
| ORG-8 | P1 | Row selection survives pagination/sort: Next/Prev don't clear `selectedRowIds`, so "N selected" can include rows no longer on screen and Bulk Suspend acts on them. | `OrganizationsView.tsx` pagination handlers `[code]` | Clear on page change (or key by id and show "selected on other pages"). |
| ORG-9 | P1 | No subscription row → UI invents "Starter (Free) / ACTIVE" (local DB: 1 of 3 orgs has `planSlug = null`). Indistinguishable from a real Starter subscription. | `organizations.service.ts:getOrganizationsList` `[code]` `[db]` | Show "No subscription record" badge; optionally create the default row on first sight. |
| ORG-10 | P2 | `useOrganizationDetail('')` is instantiated 3× on this page just to reach mutations (6 disabled queries + all mutations each time). | `OrganizationsView.tsx:90,123,144` | Split `useOrganizationActions(orgId)` from the read hook. |
| ORG-11 | P1 | No institution columns/filters (learners, groups, features on). | — | See §3 (add "Features" chips + filter "has institution mode"). |

### 2.5 Organization detail

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| DET-1 | P0 | Participants → **Payment filter "Paid" never matches**: UI value `PAID`; API returns `pay.status` (`SUCCESS/FAILED/PENDING/CREATED/CANCELLED/REFUNDED`) or `FREE`. The badge also paints `SUCCESS` and `FREE` red. | `OrgParticipantsTab.tsx:46,92-99,135-146` vs `organizations.repository.ts:getOrganizationParticipants` `[code]` | Shared payment-status constant; map SUCCESS→"Paid", FREE→"Free". |
| DET-2 | P1 | Status filter lists 3 of 9 statuses (no CHECKED_IN, IN_WAITING, DISQUALIFIED, ABSENT, PENDING_PAYMENT, **ASSIGNED**); `ASSIGNED` isn't even in the `ParticipantStatus` TS union. | `OrgParticipantsTab.tsx:70-74`, `lib/types.ts:84-91` vs main-app enum `[code]` | Derive options from one `PARTICIPANT_STATUS` constant that matches the main-app enum. |
| DET-3 | P1 | The tab (a) loads **every** participant of the org in one response, and (b) is fetched on page open even if the tab is never opened. `contestId` argument is accepted by the client but ignored by the API. All filtering is client-side. | `useOrganizations.ts:68-74`, `OrganizationDetailView.tsx:62`, `organizations.repository.ts` (no LIMIT) `[code]` | Server-side pagination + filters (`contestId`, `status`, `paymentStatus`, `audience`, `q`); fetch only when the tab is active. |
| DET-4 | P1 | Contests tab shows fabricated fields (`maxParticipants: 1000`, `registrationDeadline = startTime`) and none of the real institution ones. | `lib/api/organizations.ts:258-281` `[code]` | Return real `maxParticipants`, `registrationDeadline`, `timingMode`, `endTime`, `audience`, `questionSelection`, `showLeaderboard`, gradebook inclusion. |
| DET-5 | P1 | `organizations."logoUrl"` is never selected → header/edit modal always show the generated avatar even when the org has a logo. | `getOrganizationDetail` SELECT list `[code]` | Select `o."logoUrl"`. |
| DET-6 | P2 | Overview tab "Operational State" is always green, even for SUSPENDED. "Total Revenue Log" adds subscription payments (ops revenue) to contest fees (org money) under one number. | `OrgOverviewTab.tsx` `[code]` | Colour by state; split into "Subscription paid" and "Contest fees collected". |
| DET-7 | P1 | `useParticipants` is a closure that calls `useQuery` inside a non-hook function (ESLint `rules-of-hooks` error). | `useOrganizations.ts:68` | Make it a real `useOrgParticipants(orgId, filters, enabled)` hook. |
| DET-8 | P2 | Imports the mock `writeAuditLogEntry` (localStorage) — unused. | `OrganizationDetailView.tsx:9` | Remove. |
| DET-9 | P1 | `useOrganizationNames` issues one **org-detail + notes** request per distinct org on the messaging page (N+1, 2 calls each). | `useMessaging.ts:101-119`, `getOrganizationDetail` also fetches notes `[code]` | Server returns `organizationName` in the message list, or a single `GET /organizations?ids=`. Same pattern as `useOrganizations({limit:500})` in Flags, Ambassador Types and `limit:1000` in Bookings. |
| DET-10 | P1 | No institution section (learners, groups, portal-enabled, assigned tests, WINDOW/pool tests, gradebook) and no per-org feature-access view. | — | New "Institution" + "Features" panels (§3). |

### 2.6 Billing & Revenue

| ID | Sev | Finding | Evidence | Proposed fix |
|---|---|---|---|---|
| BIL-1 | P1 | The revenue area chart is computed in the browser from **the current page of 20 payments** (and re-orders by `.reverse()`), so it changes with pagination/filters and is not a revenue trend. | `BillingView.tsx:186-200` `[code]` | Server timeseries (`date_trunc('day')`) in the summary endpoint, with a date range. |
| BIL-2 | P1 | Payments search is not debounced; the API supports `dateFrom/dateTo` and `orgId` but the UI offers none. | `BillingView.tsx:525-540`, `lib/api/billing.ts:23-28` `[code]` | Reuse the Payments-page filter bar (debounce + `DateRangePicker` + org combobox). |
| BIL-3 | P1 | Two payment ledgers: Billing → Payments tab (`billing.repository`) and `/dashboard/payments` (`payment-details.repository`). Different SQL, different filters, same table. | both repos `[code]` | Keep Payments page as the ledger; make the Billing tab a summary + link (decision D4). |
| BIL-4 | P1 | "Total revenue / this month" sums **contest-registration payments** (money collected on behalf of organizations), next to MRR from subscriptions. Ops-side subscription payments (`OpsPayment`) and platform commission are not in the totals, so the headline is not "platform revenue". | `billing.repository.ts:getRevenueRollup`, `payouts` commission fields `[code]` | Decision D5: define the KPI set (subscription revenue, GMV, platform commission, gateway fees). |
| BIL-5 | P2 | Status breakdown omits CREATED/CANCELLED so the donut doesn't sum to the table; colour map contains a non-existent `PAID`. | `billing.repository.ts:119-136`, `BillingView.tsx:170-176` | Shared status constant. |
| BIL-6 | P2 | `ILIKE '%'+search+'%'` doesn't escape `%`/`_` (searching `_` matches everything). Same pattern in 6 repos. | `billing.repository.ts:32` etc. | `escapeLike()` helper (§4). |

### 2.7 Payments (reference page)

Works as intended: debounced search, page reset on filter change, end-of-day inclusive date range (`toIso`), retried-only filter. Only P2s: BIL-6 (LIKE escaping) and its local `toIso`, `CopyText`, `STATUS_STYLES` should become shared (§4).

### 2.8 Payouts (hidden from the sidebar)

| ID | Sev | Finding | Fix |
|---|---|---|---|
| PO-1 | P1 | Route `/dashboard/payouts` renders `BillingView` on the "payouts" tab while the nav item is hidden, so the same screen is reachable two ways and the sidebar highlights nothing. | Pick one entry (decision D4). |
| PO-2 | P2 | Investigation search requires ≥3 chars and matches `ct.email ILIKE $1` with no wildcard handling, so partial emails never match. | Document in placeholder or add `%…%`. |

### 2.9 Messaging

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| MSG-1 | P1 | Search input not debounced (one request per keystroke, 20-row table refetch). | `MessagingView.tsx:160` | Shared debounced filter hook. |
| MSG-2 | P1 | Org names resolved with N+1 requests (DET-9). | — | Server-join name. |
| MSG-3 | P2 | Channel filter offers WHATSAPP though compose is EMAIL-only by design (`z.literal('EMAIL')`). | `messaging.validator.ts` | Hide until enabled. |
| MSG-4 | P1 | Ops can't see **main-app** message failures (portal invites, assignment emails, results). Only ops-originated messages are listed. | — | Optional later: read-only tab over main `message_logs` (failed/queued), see §3. |

### 2.10 Bookings

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| BK-1 | P1 | Client fetches the first **100** bookings (`?limit=100`) and filters in the browser, though the server supports `page/status/search/startDate/endDate/dateMode`. Booking #101+ is invisible. | `lib/api/bookings.ts:22`, `bookings.repository.ts:197-231` `[code]` | Use server filters + pagination. |
| BK-2 | P1 | Date filter parses `YYYY-MM-DD` as UTC and adds 24h for the end date; the server then does `lte` on a midnight timestamp. Off-by-timezone at both ends. | `BookingsView.tsx:223-238`, repo `:217-221` | Shared `dayRangeToIso()` (end-of-day local). |
| BK-3 | P1 | "Provision" plays a scripted progress animation ("Initializing isolated Docker container instances…", "Provisioning multi-sharded Redis…") and then just flips `status = provisioned`. Nothing is provisioned. | `BookingsView.tsx:101-135` `[code]` | Replace with a plain confirmation ("mark as provisioned") unless real provisioning is wired. |
| BK-4 | P2 | Org name/email from `useOrganizations({limit:1000})`. | `BookingsView.tsx:41` | Server-join. |

### 2.11 Audit Log (3 tabs)

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| AUD-1 | P0 | **Ops tab: whole domains can't be filtered.** The hand-maintained list lacks `feature_flag.*` (toggle + org override set/remove), `ambassador_type.*`, `college.*`, `department.*`, `app_settings.*`, `unlisted_college/department.dismissed` — all actions the server really writes. For institution rollout the missing one is the most important: *who granted `gradebook` to which org*. | `OpsAuditLogTable.tsx:28-62` vs 42 actions written in `server/` `[code]` | Single `AUDIT_ACTIONS` constant used by the writer and both dropdowns (§4). |
| AUD-2 | P1 | **Main-app tab** lacks `gradebook.*` (category/term/settings/excused/override/marksheets — 7 actions), `payment.duplicate_captured`, `payment.manually_verified`, `submission.recovered`. | `MainAppAuditLogTable.tsx:31-43` vs `logAudit` call sites in main app `[code]` | Add; ideally fetch distinct `action` from the table so the list can't go stale. |
| AUD-3 | P2 | `actionPrefix` uses `LIKE 'prefix.%'` without escaping `_`, so `feature_flag`, `billing_portal`, `pricing_config`, `app_settings` also match look-alikes. | `audit-log*.repository.ts` | `escapeLike()`. |
| AUD-4 | P1 | The "Organization" filter on the **ops** tab filters `targetId`, which is a flag key / college id / plan id for non-org events, so it silently returns nothing for those rows. | `OpsAuditLogTable.tsx:120` | Label "Target ID"; add a real `organizationId` in metadata and filter on it. |
| AUD-5 | P2 | Page copy says "cryptographically signed… immutable". Nothing signs rows. | `AuditLogView.tsx:35` | Honest copy ("append-only"), or implement. |
| AUD-6 | P2 | Dates: `dateTo = new Date(x)` bound is exclusive of the chosen day unless the caller sends end-of-day (only Payments does). | audit repos | Shared date-range schema. |
| JT-1 | ✅ | Job Timeline queue dropdown matches the main app's 15 BullMQ queues — verified. | `lib/constants/queues.ts` vs `Quizbuzz-new/backend/src/queues` | none |

### 2.12 Feature Flags

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| FLG-1 | P0 | **Access model is invisible and the copy is wrong for OPT_IN.** `accessModel` only exists in the code registry; `mapFlag` doesn't return it. For OPT_IN flags the UI says "No organizations have an override — all follow the global default", but the real rule is *global ON = available; org OFF unless granted; global OFF = kill switch*. An operator can think flipping the global switch "enables it for everyone". | `lib/api/ops.ts:34-46`, `FeatureFlagsView.tsx:145`, `effective-flag-state.ts` (main) `[code]` | Return `accessModel` + `requires[]`; render a badge ("Opt-in per org" / "On for all"), correct copy, and a count of granted orgs. |
| FLG-2 | P1 | Ops' own `isFeatureEnabled()` ignores access model (OPT_IN with no override returns the global value; kill switch doesn't beat an override). Only `razorpay_gateway_active` (GLOBAL) uses it today, so it's latent — but it will give the wrong answer the first time an OPT_IN flag is checked in ops. | `is-feature-enabled.ts` vs main `computeOptInFlagState` `[code]` | Port the two compute functions to one shared module and use it in both this function and the new per-org endpoint. |
| FLG-3 | P1 | No dependency model: `institution_mode` and `gradebook` need `participant_portal` (main app enforces `LEARNER_GROUP_FLAGS = [institution_mode, participant_portal]`). Granting only one yields a feature that silently doesn't appear. | `feature-flags.ts:84-85` (main) vs registry `[code]` | Add `requires` to registry; warn on grant; show "Needs Participant Portal" chip. |
| FLG-4 | P1 | No per-organization view ("what does *this* org have?"). The only org UI is inside each flag's card. | — | Organization detail → **Features** panel: every flag, effective state, why (override / kill switch / not granted), grant/revoke. |
| FLG-5 | P1 | The three newest institution flags (`participant_portal`, `institution_mode`, `gradebook`) were committed during this session (`855e305 feature portal & gradebook`, not by me). Their descriptions say "members", contrary to the naming rule (portal test-takers are **Learners**; "members" = org team). | `git log`, `CLAUDE.local.md` naming rule | Fix wording only. |
| FLG-6 | P1 | Override `expiresAt` is stored and honoured by the main app, but the UI can't set it, and expired overrides still render as ENABLED (list filters on `removedAt IS NULL` only). | `feature-flags.repository.ts:listActiveOrgOverrides` | Add optional expiry; label/hide expired. |
| FLG-7 | P1 | Turning an **OPT_IN** flag's global switch OFF is a platform-wide kill switch for every org (e.g. the portal during a live contest) but no confirmation is shown, because confirmation only triggers for CRITICAL/WARNING severity and these are STANDARD. | `handleToggleClick` `[code]` | Confirm whenever turning off a flag that has active grants; show "N organizations affected". |
| FLG-8 | P1 | Ops DB is source of truth; mirroring to the main app is fire-and-forget (`console.error` on failure). If a mirror write fails, ops shows "granted" while the main app says "off", with no signal. | `feature-flags.service.ts:toggleFlag/setOrgOverride` | Return `mirrorStatus`; add "Verify sync" (compare both DBs) and repair action. |
| FLG-9 | P2 | Registry doc comment says for GLOBAL flags "global=false + anything → OFF", but the main app's `computeEffectiveFlagState` lets an active override win even when global is false. Code and docs disagree. | registry header vs `effective-flag-state.ts:28` | Fix the comment (code is the contract). |
| FLG-10 | P2 | `OrgOverridesPanel` pulls 500 orgs just to show names. | `FeatureFlagsView.tsx:54` | Server-join org name in the overrides response. |

### 2.13 Ops Metrics

| ID | Sev | Finding | Fix |
|---|---|---|---|
| MET-1 | P1 | Live metrics don't know about WINDOW contests: no timing mode, window end, "not started / in progress / auto-submitted" counts, or personal deadlines. Source is the main app's `ops-metrics` module (`LiveContestSummary` has only id/org/title/status). | Cross-repo (see §6): extend the main-app summary/snapshot, then add badges/columns here. |
| MET-2 | P2 | Polling intervals fine; error banner good. | — |

### 2.14 Hidden / mock

`Infra & Cost` (hidden) renders `lib/data/db.ts` mock data and says so in comments; `ops-metrics.service.ts` still references it. Keep hidden; delete the localStorage mock once Infra is either wired to real data or removed (LAY-1).

---

## 3. Institution-mode coverage matrix (main app ↔ Ops)

Source of truth for scope: `../Quizbuzz-new/CLAUDE.local.md` and `docs/institution-mode/00-plan.md`. Ops-side scope there: OPT_IN registry entries ✓ and *per-org visibility of the new features (groups and members counts)*; no billing work.

| # | Main-app feature (branch) | Flag | In Ops today | Gap | Phase-1 fix |
|---|---|---|---|---|---|
| 1 | WINDOW timing, entry cut-off, personal deadline, result hold, `showLeaderboard` | `window_contests` | Flag registered + committed | Contest list has no timing mode/window; Overview "upcoming" misses open windows (OVR-2); live metrics blind (MET-1) | Contests tab + Overview + metrics badges |
| 2 | Image questions (private bucket, presigned GET) | none | — | Nothing needed in Ops. Optional: storage prefix usage per org (not requested) | none (note) |
| 3 | Question sets & pools (`questionSelection`, `poolRules`, `setCount`) | `question_pools` | Flag registered + committed | Contest list doesn't show selection mode | Contests tab column |
| 4 | Participant portal (portalAccess, OTP, invites, last login) | `participant_portal` | Flag registered (commit `855e305`) | No "portal-enabled contacts" count per org; flag copy says "members" | Org Institution panel + wording |
| 5 | Org-slug URLs | none | — | Billing return URL predates it (SEC-3) | verify / adjust |
| 6 | Learner groups (tree, memberships, alumni), `Contest.audience`, `ASSIGNED` participants | `institution_mode` | Flag registered (commit `855e305`) | No group/learner counts; `ASSIGNED` unknown to Ops UI (types, filters, badges); `isPrivate` fully gone (✓ Ops never used it); usage SQL counts all participants incl. ASSIGNED — **matches** main-app plan-limit counting (✓) | Org Institution panel; shared participant-status constant |
| 7 | Gradebook (categories, terms, overrides, marksheets) | `gradebook` | Flag registered (commit `855e305`) | `gradebook.*` audit events not filterable (AUD-2); no per-org gradebook counts | Audit list + Institution panel |
| 8 | Flag dependency (`LEARNER_GROUP_FLAGS`) | — | Not modelled | FLG-3 | `requires[]` |

**Proposed read-only "Institution" panel** (Organization detail), one endpoint `GET /api/v1/ops/organizations/:id/institution`, all from the main DB, cheap grouped counts:

- Learners: active / alumni / portal-enabled / last portal login
- Groups: total, depth, learners in a group vs not
- Contests by `timingMode` (SCHEDULED/WINDOW), by `audience` (PUBLIC/PRIVATE_LINK/ASSIGNED), by `questionSelection` (ALL/SETS/POOL)
- Assigned participants: ASSIGNED vs started vs submitted vs ABSENT
- Gradebook: categories, terms, contests included, marksheets by status
- **Effective feature access** for the five institution flags with reason and dependency warnings (same as the Features panel in FLG-4)

And in the Organizations list: a "Features" cell (chips) and a filter "Institution mode: on/off".

---

## 4. Centralisation plan (reusable code, duplicated logic)

| # | Duplicated today | Count | Create | Replace in |
|---|---|---|---|---|
| C1 | Currency/number/date formatting (`toLocaleString('en-IN')`, `₹${…}`, manual `/100`) | 67 + 36 | `lib/format.ts` (`formatInr(n)`, `paiseToRupees()`, `formatDate`, `formatDateTime`) and a documented unit rule (PaymentConfig = rupees, Payment = paise) | all views, services |
| C2 | Status → label/colour maps (participant, contest, payment, message, booking, job) | ~10 maps, 6 badge implementations | `lib/constants/status.ts` (values match main-app enums; labels; tone) + `components/ui/StatusBadge.tsx` (dark-mode-safe) | Org tabs, Billing, Payments, Bookings, Overview donuts, Job timeline |
| C3 | Pagination footer | 11 ad-hoc, 1 shared (`TablePagination`) | Move `TablePagination` to `components/ui/Pagination.tsx` | Orgs, Colleges, Plans, 3 audit tables, Messaging, Payments |
| C4 | Filter state + page reset + debounce | 9 views, only 4 debounce | `useTableQuery({defaults, debounceKeys})` → `{params, setFilter, setPage, reset, hasFilters}` (page always resets on filter change) | Orgs, Billing, Messaging, Bookings, Org tabs, Audit tabs, Payments |
| C5 | Local-date → ISO bound (`toIso` in Payments; ad-hoc in Bookings; none in audit) | 3 | `lib/dates.ts: dayRangeToIso(range)`; server `dateRangeSchema` (inclusive end of day) | Payments, Bookings, Billing, audit |
| C6 | SQL param builder (`addParam`/`sqlParams.push`) | 5 repos | `server/db/sql.ts` (`SqlWhere` builder + `escapeLike`) | orgs, billing, payments, audit-main, job-checkpoints |
| C7 | Shared list-query schema (`page/limit/search/dateFrom/dateTo`) | 8 validators | `server/http/query-schemas.ts` | all validators |
| C8 | "Owner" subquery (name/email with fallbacks) | 3 (list, detail, recent-orgs — one already wrong, OVR-1) | `server/features/organizations/org-owner.sql.ts` | org repo, overview repo |
| C9 | Audit action catalogue | 2 UI lists + server strings | `lib/constants/audit-actions.ts` (typed) used by `writeAuditLogEntry` and both dropdowns | audit-writer, tables |
| C10 | Flag effective-state computation | main app + ops (diverging) | `server/features/feature-flags/flag-state.ts` (port of `computeEffectiveFlagState` / `computeOptInFlagState`) | `is-feature-enabled`, Features panel endpoint |
| C11 | Org avatar/logo URL | 3 dicebear strings | `lib/org-logo.ts` | list, detail, overview |
| C12 | Name resolution by id (N+1 / 500-1000 org fetches) | 4 | server joins `organizationName` (+ optional `?ids=`) | messaging, flags, ambassador, bookings |
| C13 | `CopyText`, `Field`, confirm dialogs, empty/error/loading states | 5+ | `components/ui/*` (also Phase 2 foundation) | Payments, Billing, Org tabs |
| C14 | Mock localStorage DB (`lib/data/db.ts`) feeding live shell | 1 | delete from live paths | layout, Overview, audit mock writer |

---

## 5. Lint / type debt to clear while touching files

`tsc` is already clean. Within every file edited in the fix steps, bring it to zero ESLint errors: unescaped `"`/`'` (22), `any` (140 repo-wide; only touch files being changed), `set-state-in-effect` (13), `rules-of-hooks` (1), unused imports (58). Do **not** attempt a repo-wide `any` purge in Phase 1 (it's Phase 2 hygiene).

---

## 6. Cross-repo items (flagged, NOT part of the Ops fix steps)

These need a change in `../Quizbuzz-new` (same branch); I won't touch it unless you say so.

1. **Ops-metrics WINDOW awareness** (MET-1): add `timingMode`, `windowEnd`, attempt counts to `LiveContestSummary` / snapshot.
2. **Billing return URL** (SEC-3): confirm legacy `/org/settings` redirect preserves `?tab=billing&subscription=…`.
3. **`OPT_IN_ONLY_FLAGS` ↔ registry parity check** — currently identical (6 keys). Consider a unit test in each repo so they can't drift (CLAUDE.local says to keep both in sync by hand).

---

## 7. Execution plan (proposed order; one step = one review checkpoint)

Nothing below has been started. Each step ends with `tsc` + `eslint` on touched files + a manual check list; no commits at any point (per your instruction). You can approve/skip/reorder any step.

| Step | Scope | Findings closed | Main files |
|---|---|---|---|
| **S1 Foundations** | `lib/format.ts`, `lib/constants/status.ts`, `StatusBadge`, `Pagination`, `useTableQuery`, `dayRangeToIso`, server `SqlWhere`/`escapeLike`/query schemas, `org-owner.sql.ts`, `flag-state.ts` | C1–C8, C10, C11 (enablers) | new files only |
| **S2 Organizations list** | filters (status/plan), server sort, search incl. email, error state, selection reset, bulk-suspend result, remove dead Create/Edit, Delete decision, subscription-less badge | ORG-1…ORG-10, LAY-2/3 | `OrganizationsView`, org repo/service/validator, `lib/api/organizations.ts`, `CommandPalette` |
| **S3 Overview** | fix duplicate recent orgs, upcoming contest statuses + WINDOW, remove demo reset, growth gaps, participant breakdown | OVR-1…OVR-5, LAY-1/4/5 | overview repo/service/view, layout |
| **S4 Org detail** | participants server-side paging + filters + statuses/payment fix, real contest fields, logo, hook fix, name N+1, tab laziness | DET-1…DET-9, MSG-2, BK-4 | org tabs, repo/controller/routes |
| **S5 Institution visibility** | `/organizations/:id/institution` endpoint + panel, Features panel (effective state, grant/revoke), Organizations-list Features chips + filter, Overview KPIs, contests columns | DET-10, ORG-11, OVR-6, FLG-4, §3 | new route/service/repo + 3 UI components |
| **S6 Feature flags** | accessModel + requires in API/registry, correct copy, dependency warnings, kill-switch confirmation, expiry, sync verify, wording fix, ops `isFeatureEnabled` | FLG-1…FLG-10 | registry, flag service/repo, view |
| **S7 Audit log** | `AUDIT_ACTIONS` catalogue, add missing domains (incl. `gradebook.*`), LIKE escaping, date bounds, target-id label, honest copy | AUD-1…AUD-6 | audit tables, repos |
| **S8 Billing / Bookings / Messaging** | server timeseries chart, filters + debounce, de-dup ledger, bookings server paging + TZ + honest provision, messaging debounce | BIL-1…6, PO-1/2, BK-1…3, MSG-1/3 | respective views/repos |
| **S9 Security & config** | OTP hardening + rate limit, secrets fail-fast in prod, checkout redirect check | SEC-1…SEC-3 | `platform-auth.service`, `env.ts`, checkout |
| **S10 Hygiene** | lint to zero on touched files, delete mock DB / dead modules | §5, C14 | misc |

Suggested priority if time is short before the early-Nov contest: **S2 → S3 → S6 → S5 → S4 → S7 → S9**, then the rest.

Verification approach per step: type-check, lint touched files, run the changed SQL against the local institution DB (data listed in §0), and click-test through the app in the browser pane once you give me a login to use (or you run it and I read logs).

---

## 8. Decisions I need from you before S2 starts

- **D1 — New/Edit Organization:** remove the buttons (my recommendation: Ops is read/operate, tenants self-sign-up) or build real endpoints?
- **D2 — "Delete" organization:** rename to "Suspend" (no data change) or implement a real soft-delete (`isDeleted`, hidden from lists, owner notified)?
- **D3 — Plan filter source of truth:** main DB `organizations.planSlug` (fast, one query) or ops `OrganizationSubscription` (authoritative, needs a 2-step lookup)? `planSlug` can be null/stale (1 of 3 local orgs).
- **D4 — Duplicate screens:** keep `/payments` as the single payment ledger and reduce Billing's tab to a summary? Give Payouts its own sidebar entry or keep it a Billing tab?
- **D5 — Billing KPI definitions:** what should "Revenue" mean for the platform (subscriptions only? + commission? + gateway-fee pass-through)?
- **D6 — Cross-repo:** may I touch `../Quizbuzz-new` for MET-1 (metrics) on the same branch, or leave it as a documented follow-up?
- **D7 — Flag registry file:** I'll edit it in S6 for wording and a `requires` field; I won't commit. Okay?

---

## 9. Appendix — evidence snippets

- OVR-1 reproduction (local institution DB): first 5 rows of the recent-orgs query returned org `01KZDY3D9383MQF0MJQSJ4NRMK` four times with owner `makasare.tv@gmail.com`.
- ORG-1: `z.enum(['all','active','suspended','deleted'])` (validator) vs `<option value="ACTIVE">` (view).
- FLG-1/2: main-app `computeOptInFlagState`: `global=false → false (kill switch)`; `global=true` & no active override → **false**; otherwise override value. Ops `isFeatureEnabled` returns `flag.isEnabled` when no override.
- Participant status distribution on local DB: SUBMITTED 112, ASSIGNED 26, ABSENT 18, REGISTERED 15, DISQUALIFIED 3, PENDING_PAYMENT 3 — the UI filter covers 3 of those 6.
- Local flag state: all 12 flags present and `true` in both ops (`feature_flags`) and main (`platform_feature_flags`) DBs, i.e. registry → main mirror works on this machine.

---

## 10. Progress log (nothing committed; all on `feature/institution-mode`)

### Done — S1 Foundations (centralisation), adopted in existing code
| Shared piece | New file | Replaced duplicates in |
|---|---|---|
| Money / number / avatar formatting + paise↔rupees rule | `lib/format.ts` | 22 files (≈110 inline `toLocaleString`/`₹{…}` sites) |
| Day-range → ISO bounds (end-of-day inclusive) | `lib/dates.ts` | Payments page (Bookings/Billing/audit follow in S7/S8) |
| One status catalogue (participant incl. `ASSIGNED`/`PENDING_PAYMENT`, contest, payment, org, booking, job, payout, transfer, message) | `lib/constants/status.ts` | Org tabs, Billing, Payments, Bookings, Job Timeline, Messaging |
| Status pill with light **and** dark tokens (`--tone-*` in `globals.css`; `dark:` variant now follows the `.dark` toggle) | `components/ui/StatusBadge.tsx` | 8 hand-rolled badge implementations removed |
| One table footer | `components/ui/Pagination.tsx` (moved from `TablePagination`) | Orgs, Colleges, Plans, 3 audit tables, Payments, Messaging, Org tabs, **and the 3 Billing tabs which had none** |
| Copy-to-clipboard value | `components/ui/CopyText.tsx` | Payments |
| Filter + page-reset + debounce hook | `lib/hooks/useTableQuery.ts` | Organizations, Billing ×3, Payments, Messaging |
| SQL param builder + `escapeLike` | `server/db/sql.ts` | orgs, billing, payments, audit-main, job-checkpoints (the 5 copies) |
| Shared list schema fields | `server/http/query-schemas.ts` | org list (others follow) |
| Owner name/email subqueries | `server/features/organizations/org-owner.sql.ts` | org list, org detail, **Overview recent-orgs (fixes OVR-1; verified: was 1 org ×4, now 3 distinct)** |
| Flag effective-state (GLOBAL vs OPT_IN, mirrors main app) | `server/features/feature-flags/flag-state.ts` | `isFeatureEnabled()` (fixes FLG-2) |
| Org logo fallback | `lib/format.ts#orgLogoFallback` | 3 dicebear copies |

Also fixed on the way: ORG-1 (status filter values), ORG-2 (plan filter now real, by plan slug on main `organizations."planSlug"`; `starter` also matches orgs with no plan), ORG-3 (server-side sort), ORG-4 (search now includes owner email, debounced, wildcard-safe), ORG-7 (bulk suspend reports per-org results), ORG-8 (selection cleared on page/filter change), ORG-10 (no more `useOrganizationDetail('')` ×3), DET-1/DET-2 (participant status + "Paid" filter now use the shared catalogue), DET-5 (logo is read), DET-7 (`rules-of-hooks` error), BIL-2 (debounce), BIL-5, **NEW BIL-7: the Billing Payments / Payouts / Transfers tabs had no pagination controls at all (only the first 20 rows were ever visible) — fixed**. Lint across the repo: 178 → 162 errors, 73 → 65 warnings; no file got worse.

### Done — Organization lifecycle (your decisions D1/D2)
- **Keep New / Edit** → now real: `POST /ops/organizations` (creates org + owner in the main DB in one transaction, mirroring the main app's own signup; assigns the plan; emails the owner the new `ORG_CREATED` mail) and `PATCH /ops/organizations/:id` (name, logo; slug is immutable). Super-admin only; audited (`org.created`, `org.updated`).
- **Suspend** (`org.suspended`) — owner **is** emailed. **Soft delete** (`DELETE /ops/organizations/:id`, `org.deleted`) — hidden from lists, reversible via **Restore** (`POST …/restore`, `org.restored`; returns to Suspended if it was suspended), owner is **not** emailed. List has a *Deleted* filter with a Restore button; the detail page shows a banner and Restore.
- **NEW finding (was missing from the audit, P0): the main app never checked `organizations.isActive`/`isDeleted`.** "Suspend" only sent an email; the org kept working. Fixed in `../Quizbuzz-new` (same branch, uncommitted), minimal and tested:
  - `backend/src/common/org-access.ts` (+ 3 unit tests) — one place that reads the flags (10 s cache).
  - Admin API: `authenticatedOrgMiddleware` refuses every request with `403 ORG_SUSPENDED` except `GET /auth/admin/me`, logout(-all) and switch-org.
  - Login: lands the admin in an active org; if every org is suspended → clear *suspended* message; if removed → *no longer available*. Deleted orgs vanish from the org switcher.
  - Frontend: `SuspendedScreen` replaces the dashboard (reason text, contact-support link, switch-org, sign out); login page shows the message instead of routing to verify-email; a tab left open re-checks on the first refused call.
  - Public/participant: public contest page, public listing, quiz entry (`authenticateParticipant`) and portal login/session now treat suspended or deleted orgs as not found.
  - Not touched on purpose: the quiz engine, submissions, proctoring, admin websockets already connected.

### Verified
- `tsc --noEmit` clean in ops and in the main backend + frontend; ops ESLint no worse (see above); main backend **242 / 242 tests pass** (incl. the engine characterization suite).
- Against the local institution DBs: every converted SQL path ran (list/detail/overview/billing/payments/audit/jobs); the lifecycle ran end-to-end (create → edit → suspend → delete → restore (back to suspended) → reactivate) with correct audit rows and **only** `ORG_CREATED`, `ORG_SUSPENDED`, `ORG_REACTIVATED` emails queued (none for delete/restore); admin gate ran against the real middleware + DB (active allowed, suspended blocked except me/logout, login refused, deleted blocked, restored allowed); public page/listing/portal went dark and came back. All smoke rows and queued jobs were cleaned up.

### NOT verified
- No click-through in a browser: I have no login for the ops dashboard or the main app, so the new Ops screens and the `SuspendedScreen` are type-checked and linted but not seen rendered. The dev server compiled the Organizations route with no errors. Please log in once (or give me a test login) and I'll walk the flows.
- Mid-quiz behaviour: participants already inside a live quiz keep their session (engine untouched), but a page refresh goes through quiz-entry and will be refused for a suspended org. This is the intended "frozen" behaviour; say if you'd rather exempt in-progress attempts.

### Things you need to know before merging anything
1. **Ops migration:** `prisma/migrations/20261017185832_add_org_created_template` (adds `ORG_CREATED` to `OpsMessageTemplate`) was created with `prisma migrate dev` and applied to **`quizbuzz_ops_institution` only**. Any other environment needs `prisma migrate deploy`.
2. `RESERVED_ORG_SLUGS` is now duplicated across repos (ops `org-slug.ts` ↔ main `organization.service.ts`); a comment marks it. Worth a shared test later.
3. Org creation attaches an existing admin as OWNER if the email already exists (no password change); otherwise creates an `emailVerified` admin with an unusable password and tells the owner to use *Forgot password*.

### Still open (next steps from §7)
S2 remainder (ORG-5 closed above; ORG-9 "No subscription" badge, ORG-11 institution chips), S3 Overview (OVR-2…6), S4 Org detail (server-side participants, real contest fields, name N+1), S5 Institution visibility, S6 Feature flags, S7 Audit log, S8 Billing/Bookings/Messaging remainder, S9 Security, S10 hygiene.

### Update — S2, S3, S4 done (still uncommitted, `feature/institution-mode` in both repos)
| Finding | What changed |
|---|---|
| LAY-2/3 | ⌘K palette opens the organization's page (was the list), is debounced, and only queries while open; shows a status chip for non-active orgs. |
| ORG-9 | Orgs with no subscription record are labelled "no subscription record" instead of passing off the free default as a real plan. |
| OVR-2 | "Live & Upcoming Contests": only PUBLISHED / REGISTRATION_CLOSED / LIVE (drafts and cancelled gone), live contests always listed, open **WINDOW** contests included with their window range, real status + Window badge shown. Verified on the local DB: the live window contest now appears. |
| OVR-3 | Demo-reset button removed. |
| OVR-4 | Recent orgs show their real plan and logo. |
| OVR-5 | Growth chart is zero-filled (every week present, ISO-year labels); participant KPI shows a breakdown (submitted / assigned / registered / absent) instead of a misleading caption; chart caption corrected. |
| LAY-1/4/5 | The shell no longer loads mock infra data on every page (`useFeatureFlags` split from `useOps`); dead impersonation code + modal and the unused flag event removed. |
| (new) | Overview feed / Audit Log used action names the server never writes (`org.activated`, `org.edited`…), so entries read as "Executed action …". One shared `describeAuditEntry()` (`lib/audit-describe.ts`) now words every real action incl. the new org.created / updated / deleted / restored and feature-flag events. |
| (new) | Overview `weeks` / `days` / `limit` params are validated (int, bounded) and passed as SQL parameters. |
| DET-3 | Participants tab is server-driven: 10 per page, search / quiz / status / payment filters run in SQL (verified: 163 participants → per-status and per-payment counts add up exactly; `%` in search is literal), fetched only when the tab is open. |
| DET-4 | Contests tab shows real `maxParticipants`, `registrationDeadline`, end time, and a **Format** column (Scheduled / Window, Assigned / Private link, Question sets / pool). |
| DET-6 | State shown as a badge (suspended/deleted no longer green); the single mixed "revenue" figure is split into *Subscription paid to QuizBuzz* and *Contest fees collected by the org*. |
| DET-8/9 | Mock audit import removed; Messaging resolves org names with one request (`GET /organizations/names`) instead of two per org. |

Still open from these steps: ORG-11 (institution chips on the list) moves to S5 with the data it needs.

### Update — S6 Feature flags done (uncommitted, `feature/institution-mode`)
| Finding | What changed |
|---|---|
| FLG-1 | API now returns `accessModel`, `requires`, `dependents`, `grantedOrgCount`, mirror state. Screen is grouped (Safety & critical · **Opt-in features** · Platform defaults); each card says **"Opt-in per organization"** or **"On for everyone"**, and for opt-in flags the master switch is explained as *grantable / kill switch*, not "enable for everyone". Panel wording is "Granted organizations (N)" / "Grant access" / "Revoke". |
| FLG-3 | Registry `requires` (`institution_mode` and `gradebook` → `participant_portal`, matching the main app's `LEARNER_GROUP_FLAGS` / `GRADEBOOK_FLAGS`; validated at build). Cards show "Needs Participant Portal". Granting an org a feature whose prerequisite it lacks returns a warning; switching a prerequisite off lists what else stops working. |
| FLG-5 | Descriptions say Learners, not members (refreshed in the local DB with `npm run flags:sync`). |
| FLG-6 | Grants can have an **end date**; past dates are rejected; expired grants are labelled and no longer counted. |
| FLG-7 | Switching a flag off that organizations use (or others depend on) asks first and states the blast radius. |
| FLG-8 | The write to the main app is now awaited and reported (toast "Saved in Ops, but the main app was not updated") instead of a silent `console.error`. New **Verify sync** per flag compares Ops with the main app (global value, missing / different / main-only grants) with **Re-sync**; main-only grants are never deleted unless you choose *Adopt* (copy into Ops) or *Remove*. A banner appears when any flag disagrees. |
| FLG-9 | Registry header comment now matches the main app's real GLOBAL rule. |
| FLG-10 | Override rows come back with the organization's name (no more fetching 500 orgs just to label them). |
| (new) | Real drift found on the local DB: the demo org's `institution_mode` grant exists only in the main app (written by `seed-demo.ts`, no Ops row) — Verify sync reports it; nothing was changed. |

Still open: FLG-4 (per-organization "what does this org have" panel) is built in S5.

**Local-data note:** my first smoke test replaced and then removed two real grants on "Austin's Organization" (`participant_portal`, `institution_mode`), and a too-eager repair removed the demo org's main-only `institution_mode` row. All three were restored exactly (Ops rows un-removed; main rows re-written as enabled / no expiry, which is what the demo seed writes). Repair was then changed so it can never delete main-only grants unless explicitly asked, and the test was re-run against a temporary org only.

### Update — S5 Institution visibility done (uncommitted, `feature/institution-mode`)
Everything below is read from the main app's database (the tables it actually enforces), so it is also right for grants written outside Ops.

| Where | What you see now |
|---|---|
| Org detail → **Institution** tab (`GET /organizations/:id/institution`) | Learners (active / alumni / portal-enabled / last portal login), groups (count, levels, learners grouped vs not), contests by timing mode · audience · question selection (+ window contests live now), participants of assigned tests by status, gradebook (categories, terms, tests included, marksheets by status). |
| Org detail → **Features** tab (`GET /organizations/:id/features`) (FLG-4) | Every per-org flag with the answer the main app will give, *why* (granted / not granted / global kill switch / override), and prerequisites that block it ("Granted, but blocked — needs Participant Portal"). One-click **Grant access** (reason + optional end date) and **Revoke** for opt-in features, with the same dependency warnings and main-app mirror feedback as the Flags page. Flags drift is shown ("main app differs"). |
| Organizations list (ORG-11) | **Institution** column with a chip per feature the org really has; new **Feature** filter (any institution feature, or one specific flag), server-side, composes with search / status / plan / sort. |
| Overview (OVR-6) | **Institution Mode Adoption** card: organizations per feature (with bars), active learners, portal-enabled contacts, groups, window contests (live now). Cached 60 s; a failure there cannot blank the Overview. |

Verified on the local DB (counts add up to the demo data: e.g. the demo org has 60 contacts → 32 active learners, 2 alumni, 44 portal-enabled, 11 groups, 11 contests (5 window, 8 assigned, 1 sets, 1 pool), 126 assigned participants by status, 5 gradebook categories). The list filter, chips, and Features states were checked for all three local orgs. No data was modified by these checks. The dev server compiled the org-detail, flags and Overview routes with no errors; the tabs themselves were not click-tested (no login).


## Update — S7 Audit log (done, uncommitted)

| Finding | Result |
|---|---|
| AUD-1 | `lib/constants/audit-actions.ts` is now the single catalogue for both tabs. Ops tab gained `feature_flag.*` (incl. org grants and `sync_repaired`), `ambassador_type.*`, `college.*`, `department.*`, `app_settings.*`, `unlisted_*.dismissed`, `org.created/updated/deleted/restored`, `payment.refunded`. |
| AUD-2 | Main tab gained `gradebook.*` (all 11 actions, incl. `marksheets_declared/withdrawn`), `payment.duplicate_captured`, `payment.manually_verified`, `submission.recovered`. In addition, `GET /ops/audit-log/actions` and `/audit-log/main-app/actions` return the distinct actions really in each table and `mergeActionGroups` folds them into the dropdowns, so a newly instrumented action appears without a UI change. |
| AUD-3 | Already covered: main tab uses `SqlWhere.prefix` (escaped); ops tab uses Prisma `startsWith`, which escapes wildcards. |
| AUD-4 | Ops "Organization ID" now sends `organizationId`: the org's own events **plus** events about it filed under another target (flag grants carry `metadata.organizationId`). Other org-scoped events whose metadata lacks `organizationId` will not match. |
| AUD-5 | Copy changed to "append-only record" / "Read-Only View". The invented "SHA256_RSA • 2048_BIT signature" cell in the expanded row is replaced by the Request ID. |
| AUD-6 | Both lists validate `dateFrom`/`dateTo` with the shared `dateRangeFields` and `paginationFields` (limit capped at 100). Both tabs have a DateRangePicker that sends whole-day bounds via `dayRangeToIso`. |

Also: ops audit entries now carry `requestId` to the client.
Checked on the local DBs: ops has 45 `feature_flag.*` rows, 19 rows match Austin's Organization via `organizationId`, a future date range returns 0, main has 14 `gradebook.*` rows. `tsc` clean; lint 155 errors (was 156), no new ones. Not click-tested (no login).

## Update — S9 Security (done, uncommitted)

| Finding | Result |
|---|---|
| SEC-1 | Login code from `crypto.randomInt`; only an HMAC (keyed with the access secret, bound to the admin id) is stored in `otpCode`; compared with `timingSafeEqual`; new `platform_admins.otpAttempts` — the code is burned after `OTP_MAX_ATTEMPTS` (default 5) wrong guesses. Redis rate limits (`server/lib/rate-limit.ts`): login 5/15 min per email and 20 per IP, verify-otp 30 per IP. Unknown email, wrong password and suspended account now return one message and cost one bcrypt compare. |
| SEC-2 | `env.ts` refuses to boot in production if `OPS_JWT_ACCESS_SECRET`, `OPS_METRICS_SECRET` or `OPS_SETTINGS_SECRET` is unset, under 16 chars, or a dev default. Build phase and dev are unaffected. `OPS_JWT_REFRESH_SECRET` is intentionally not checked — nothing reads it. `OPS_SETTINGS_SECRET` added to `.env.production.example`. |
| SEC-3 | Main app has no `/org/settings` route (it would resolve as org slug "settings"). The billing session now returns `organizationSlug`; checkout returns to `/org/<slug>/settings?tab=billing…`, falling back to `/org?tab=billing` (the entry page forwards to the active org and keeps the query). |
| SEC-4 | Unchanged by design (dev-only). |

Migration `20261017201403_add_admin_otp_attempts` applied to the local ops institution DB only (`prisma migrate deploy` elsewhere). Any code emailed before deploy stops working (it was plaintext) — admins just sign in again.
Verified with a temporary admin (removed afterwards): 5 wrong codes burn the code and the right one then fails; stored value ≠ plaintext; correct code logs in; counter resets on a new code; same message for unknown email/wrong password; 6th login attempt in a window → 429. Production boot check: defaults refused, real values and build phase accepted. `tsc` clean, lint unchanged (155). The emailed-code path and the checkout redirect were not exercised end to end.
Not done (main app, outside this repo's scope): its `BILLING_HANDOFF_SECRET` has a public default and fallback (`config/index.ts:53`, `onboarding.service.ts:206`); the ops side has no default, so production must set the same value on both.

## Update — S10 Hygiene (done, uncommitted)

- **Lint: 0 errors** (was 178 at the start of Phase 1, 155 before S10). 8 warnings left on purpose: 5 `<img>` for external avatar/logo URLs (`next/image` would need remote-host config) and 2 React Hook Form `watch()` compiler notices; `tsc` clean.
- **Mock data:** `lib/data/db.ts` (localStorage "mock DB") deleted. The hidden Infra page now reads plain constants from `lib/data/mock-infra.ts`. The unused client-side mock audit writer, `shouldFail`, and two unreferenced components (`ComingSoon`, `LazyCharts`) are removed.
- **`any` → real types (123 sites):** `catch (e: any)` → `unknown` + `errorMessage()` (`lib/errors.ts`); API mappers now use the server's own types (overview, plans, organizations, feature flags); the billing checkout page and its three routes have typed handoff/Razorpay payloads; `apiRequest` defaults to `unknown`. One deliberate `eslint-disable` remains: `AuditMetadata` (free-form JSON).
- **React hook errors:** `setState`-in-effect patterns replaced by `useResetOnChange` (render-time reset), `useSyncExternalStore` (mounted flag) and `useQuery` (plan edit impact). Impure `Date.now()` calls moved into lazy state.
- **Dead parameters:** fake `adminName: 'Super Admin'` / `adminRole` arguments removed from plan change, override revoke and pricing-config calls end to end (the server takes the actor from the session).
- **Real fixes found on the way:** the order route now rejects a handoff token without `organizationId`/`planSlug`; the S9 rate limiter now has a 1 s Redis timeout. Without it a dead Redis would have hung login, because the shared client retries forever.
- Not click-tested (no login). Dev server compiled every dashboard route (200) and the new API routes return the expected 401 when unauthenticated.

## S8 — proposal location (not yet built)

The S8 options (revenue KPI definitions, platform-payments ledger, Payouts entry, bookings fixes, how it fits the subscription build) are written up in the main repo, next to the subscription plan, so both sprints share one document: `Quizbuzz-new/docs/subscriptions/00-plan.md` §3a, §8b, §12a, "Phase R" in §15, and open decisions 10–15 in §17. Both branches merge to `main` and deploy only after the 2026-11-01 contest.
