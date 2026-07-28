# Contest Calculator & Bookings — Backend Implementation Guide

Status: **Draft for review — no backend code written yet.**
Scope: Phase 4 of `docs/ops-dashboard-prd.md` ("Pricing Calculator and Booking Flow"). Everything here is scoped to replacing the mock data behind `/dashboard/calculator` and `/dashboard/bookings`. Infra & Cost (`/dashboard/infra`) is explicitly **out of scope** and its nav tab has been hidden (not removed — see below).

---

## 1. What changed already

- `app/dashboard/layout.tsx`: the `infra` entry in `NAV_ITEMS` now carries `hidden: true` and both the desktop and mobile sidebars render a new `VISIBLE_NAV_ITEMS` (a filtered view) instead of `NAV_ITEMS` directly. The route (`/dashboard/infra`), its page, `InfraMonitoringView.tsx`, and all of `InfraStatus`/`ScalingConfig` mock plumbing are untouched — nothing was deleted, the tab just no longer renders in the sidebar. Direct navigation to the URL still works.
- No other files were modified. Everything below is a plan, not an implementation.

---

## 2. Current state audit — what's actually mock right now

I read every file behind these two screens. Confirmed 100% mock, zero backend:

| Layer | File | Status |
|---|---|---|
| Pages | `app/dashboard/calculator/page.tsx`, `app/dashboard/bookings/page.tsx` | Thin wrappers, nothing to change |
| Views | `components/views/ContestCalculatorView.tsx`, `components/views/BookingsView.tsx` | Fully built UI, only talk to hooks — **no changes needed for the backend cutover** |
| Hooks | `lib/hooks/useBookings.ts` (`usePricingConfig`, `useBookings`, `useBookingDetail`) | Thin React Query wrappers over `lib/api/bookings.ts` — **no changes needed**, they don't know or care that the functions underneath are mock |
| API layer | `lib/api/bookings.ts` | Reads/writes an in-browser `localStorage` blob via `getDatabase()`/`saveDatabase()`. This is the file that has to change. |
| Data | `lib/data/db.ts` | `INITIAL_PRICING_CONFIG`, `INITIAL_CONTEST_BOOKINGS` seed the mock DB; `MockDatabase.pricingConfig` / `.contestBookings` hold live mock state in `localStorage` under key `quizbuzz_super_admin_mock_db` |
| Types | `lib/types.ts` | `PricingConfig`, `BookingPricingBreakdown`, `ContestBooking` — these already match what a real API should return, keep them as-is |
| Server | *(none)* | There is no `server/features/bookings/` or `server/features/pricing-config/` directory. No Prisma models for pricing config or bookings. No API routes under `app/api/v1/ops/bookings/*`. |
| Audit | `lib/api/auditLog.ts` → `writeAuditLogEntry()` | This is a **second, mock-only** audit writer (distinct from the real one at `server/audit/audit-writer.ts`). It's explicitly commented as "still used by `lib/api/{ops,bookings}.ts` ... which remain mocked pending later phases." Both calculator and bookings write through this today. |

This confirms exactly what you described: everything downstream of the UI is fake. The good news is the UI/hooks layer was clearly built anticipating a real backend — `lib/api/bookings.ts` is the only file that needs a full rewrite, and it already has the right function signatures.

### Two things worth flagging before scoping the build

1. **Price integrity.** Today `ContestCalculatorView.tsx` computes the estimate client-side and sends that exact `pricingBreakdown` object to `createBooking()`. A real backend must **not** trust that payload — it should recompute the quote server-side from the submitted parameters (duration, questions, participants, add-ons) against the *current* `PricingConfig`, and persist its own number. Otherwise a modified client (or a stale tab with an old config cached) could mint an arbitrary quoted price. No UI change needed for this — the contract just changes on the server.
2. **Schema was already planned for this.** `prisma/schema.prisma`'s `AuditTargetType` enum already contains `BOOKING` and `PRICING_CONFIG`, and `OpsPayment` already has a `bookingId String?` column with no model using it yet. Someone clearly scoped this phase before. This guide's schema additions plug directly into that.

---

## 3. Target architecture (matches the rest of the codebase exactly)

Every other domain (`organizations`, `payouts`, `plans`, `billing`, ...) follows the same layering, described in the PRD as "Layered backend, not route-handler sprawl":

```
app/api/v1/ops/bookings/**/route.ts   →  thin, calls controller, wraps in try/catch + handleRouteError
server/features/bookings/
  bookings.types.ts        →  response DTOs, query param types
  bookings.validator.ts    →  zod schemas (body + query)
  bookings.repository.ts   →  raw Prisma/SQL against quizbuzz_ops (this feature is 100% ops-owned data, no main-app DB reads needed except resolving an organization's name/email when organizationId is set)
  bookings.service.ts      →  business rules, price recomputation, status transitions, calls writeAuditLogEntry()
  bookings.controller.ts   →  auth guard + role guard, parses input, calls service, returns okResponse()
server/container.ts        →  wire up repo → service → controller singletons
```

I'm proposing **one feature module** (`bookings`) that owns both the pricing config and the booking lifecycle, the same way `payouts` owns both payout accounts and route transfers as one cohesive domain. They're tightly coupled (a quote can't be calculated without the config) and the PRD treats "Pricing Calculator and Booking Flow" as a single phase.

Auth/role pattern (copied verbatim from `payouts.controller.ts` / `plans.controller.ts`):
- Reads: `getSessionAdmin()` — any authenticated role (`SUPER_ADMIN`, `SUPPORT`, `BILLING_ADMIN`).
- Writes that touch pricing or commit a quote: `requireRole([SUPER_ADMIN, BILLING_ADMIN])` — matches the PRD's role table (`SUPPORT` "Cannot edit pricing... unless explicitly allowed") and matches what `ContestCalculatorView.tsx` already enforces client-side via `isAuthorizedToConfig`.

---

## 4. Data model additions

Two new models in `prisma/schema.prisma`, plus one new enum. No changes needed to `AuditTargetType` (already has `BOOKING` and `PRICING_CONFIG`) or `OpsPayment` (already has `bookingId`).

```prisma
enum BookingStatus {
  QUOTED
  PAID
  PROVISIONED
  COMPLETED
  CANCELLED
}

// Singleton settings row — always read/written via id "pricing_default".
// Same pattern as a settings table; enforced by convention (repository always
// upserts on that fixed id) rather than a DB-level singleton constraint.
model PricingConfig {
  id                                   String   @id @default("pricing_default")
  currency                             String   @default("INR")
  baseBookingFee                       Decimal  @db.Decimal(10, 2)
  perParticipantCost                   Decimal  @db.Decimal(10, 2)
  perQuestionCost                      Decimal  @db.Decimal(10, 2)
  perInstanceHourCost                  Decimal  @db.Decimal(10, 2)
  participantsPerInstance              Int
  elastiCachePerDayCost                Decimal  @db.Decimal(10, 2)
  addOnProctoringEnabled               Boolean  @default(true)
  addOnProctoringFlatCost              Decimal  @db.Decimal(10, 2)
  addOnCertificatesEnabled             Boolean  @default(true)
  addOnCertificatesPerParticipantCost  Decimal  @db.Decimal(10, 2)
  addOnPrioritySupportEnabled          Boolean  @default(true)
  addOnPrioritySupportFlatCost         Decimal  @db.Decimal(10, 2)
  marginMultiplier                     Decimal  @db.Decimal(5, 3)
  updatedById                          String?
  updatedByName                        String
  createdAt                            DateTime @default(now())
  updatedAt                            DateTime @updatedAt

  updatedBy PlatformAdmin? @relation(fields: [updatedById], references: [id])

  @@map("pricing_configs")
}

model ContestBooking {
  id                    String        @id
  status                BookingStatus @default(QUOTED)

  // organizationId is an opaque id into the MAIN app's Organization table —
  // no Prisma relation, same convention as OpsPayment.organizationId, because
  // ops does not own that table. Nullable because a booking can be quoted for
  // a prospect that has no organization account yet.
  organizationId        String?
  organizationName      String?
  organizationEmail     String?

  contestName           String
  durationMinutes       Int
  questionCount         Int
  participantCount      Int

  addOnProctoring       Boolean
  addOnCertificates     Boolean
  addOnPrioritySupport  Boolean

  // Frozen quote snapshot at time of creation — deliberately never recomputed
  // even if PricingConfig changes later (this is the whole point of "Quote
  // Isolation" already described in the UI's confirm-save modal copy).
  pricingBreakdown      Json

  desiredStartTime      DateTime?
  quotedAt              DateTime      @default(now())
  paidAt                DateTime?
  provisionedAt         DateTime?
  cancelledAt           DateTime?
  cancellationReason    String?

  paymentMethod         String?
  paymentReference      String?
  opsPaymentId          String?       @unique

  createdById           String
  createdByName         String

  createdAt             DateTime      @default(now())
  updatedAt              DateTime     @updatedAt

  createdBy PlatformAdmin @relation(fields: [createdById], references: [id])
  opsPayment OpsPayment?  @relation(fields: [opsPaymentId], references: [id])

  @@index([status])
  @@index([organizationId])
  @@index([quotedAt])
  @@map("contest_bookings")
}
```

Notes on choices:
- `pricingBreakdown` is `Json` rather than seven separate Decimal columns. It's a frozen snapshot, not something queried/aggregated at the SQL level today, so a JSON blob mirroring `BookingPricingBreakdown` from `lib/types.ts` 1:1 keeps the mapping trivial. If/when Billing & Revenue rollups need to aggregate booking revenue in SQL, normalize `total` (at minimum) into its own column then — flagged as a fast-follow, not blocking.
- `OpsPayment` gets a reverse relation added (`booking ContestBooking?`) so a payment can be traced back to its booking — this is what makes booking revenue show up in `billing.repository.ts`'s existing rollups later without a second payments table.
- `PlatformAdmin` needs two new reverse relations added (`pricingConfigUpdates PricingConfig[]`, `contestBookings ContestBooking[]`), same pattern as its existing `orgNotes` relation.

Migration: standard `npx prisma migrate dev --name add_bookings_and_pricing_config` against the ops DB. Nothing touches the main app database or its migrations.

---

## 5. API surface

All under `/api/v1/ops/bookings/*`, following the existing envelope (`okResponse`/`errorResponse`) and error classes (`NotFoundError`, `ConflictError`, `ValidationError`) from `server/http/`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/ops/bookings/pricing-config` | any authenticated | Current pricing engine config, for the calculator's live estimate and the settings form's initial values |
| `PUT` | `/api/v1/ops/bookings/pricing-config` | `SUPER_ADMIN`, `BILLING_ADMIN` | Update config. Writes `pricing_config.updated` audit entry with before/after, same shape as today's mock version |
| `GET` | `/api/v1/ops/bookings` | any authenticated | List bookings. Query: `page`, `limit`, `status` (`all\|QUOTED\|PAID\|PROVISIONED\|COMPLETED\|CANCELLED`), `search`, `startDate`, `endDate`, `dateMode` (`quoted\|scheduled`) — mirrors the filters already built into `BookingsView.tsx` |
| `POST` | `/api/v1/ops/bookings` | `SUPER_ADMIN`, `BILLING_ADMIN` | Create a quote. Body: contest params + org selection (existing org id, or new prospect name/email). Server recomputes `pricingBreakdown` from current config — client-submitted pricing is ignored. Writes `booking.created` audit entry |
| `GET` | `/api/v1/ops/bookings/[id]` | any authenticated | Booking detail |
| `PATCH` | `/api/v1/ops/bookings/[id]/status` | `SUPER_ADMIN`, `BILLING_ADMIN` | Status transition. Body: `{ status, paymentMethod?, paymentReference?, cancellationReason? }`. Validates legal transitions server-side (see §7). Writes `booking.status_changed` audit entry |

This is a smaller surface than payouts/organizations because the UI doesn't need anything more — I checked `BookingsView.tsx` and `ContestCalculatorView.tsx` line by line and these five endpoints cover every mutation and every read the components perform.

---

## 6. Phase 4a — Contest Calculator (pricing config + quote math)

Build and ship this first, independent of the booking lifecycle, since the calculator's live estimate only needs `GET/PUT pricing-config` plus the quote math.

1. **Extract the pure math.** `calculateBookingEstimate()` currently lives in `lib/api/bookings.ts` (client-only). Move it to a new dependency-free file, e.g. `lib/pricing/estimate.ts`, exporting the same function signature. Both the client (for the live "as you type" preview in `ContestCalculatorView.tsx`) and the new `bookings.service.ts` (for the authoritative server-side calculation on quote creation) import this one copy — no logic duplication, no drift between what the client previews and what the server charges.
2. **Repository**: `getPricingConfig()` → `prisma.pricingConfig.findUnique({ where: { id: 'pricing_default' } })`, falling back to creating the row from the same defaults currently in `INITIAL_PRICING_CONFIG` if it doesn't exist yet (first-run bootstrap, avoids a manual seed step). `updatePricingConfig()` → `prisma.pricingConfig.upsert(...)`.
3. **Service**: on update, resolve `updatedByName` from the acting admin, call `writeAuditLogEntry(actor, 'pricing_config.updated', AuditTargetType.PRICING_CONFIG, 'pricing_default', 'Pricing Calculator Settings', { changes, oldConfig })` — same event name and shape the mock version already uses, so nothing downstream (Audit Log page) needs to change.
4. **Frontend cutover**: rewrite `getPricingConfig`/`updatePricingConfig` in `lib/api/bookings.ts` to call `apiRequest('/api/v1/ops/bookings/pricing-config')` instead of `getDatabase()`. `usePricingConfig()` in `lib/hooks/useBookings.ts` needs zero changes — it just calls the same function names.
5. **Role gate**: `ContestCalculatorView.tsx` already gates the Settings tab client-side via `isAuthorizedToConfig`. The real `PUT` endpoint must enforce the same role check server-side (`requireRole([SUPER_ADMIN, BILLING_ADMIN])`) since client-side gating is not security.

At the end of 4a: the calculator's "Quoting Tool" tab computes live estimates against a real, persisted pricing config, and "Engine Settings" writes real, audited config changes. The "Convert to Booking Quote" button still won't persist anywhere real until 4b ships — that's fine, ship them as one PR/deploy if you'd rather not have a half-working calculator live, but they're logically separable if you want a smaller first review.

---

## 7. Phase 4b — Booking lifecycle (quoting, pipeline, payment recording)

This is the part that gives your internal team the calendar/pipeline view you described: how many bookings exist, what stage each is in, quoted vs. paid vs. provisioned.

### 7.1 Creating a quote
`POST /api/v1/ops/bookings`:
1. Validate input against a zod schema mirroring `calculatorSchema` from the frontend (contest name, org mode existing/new, duration, question count, participant count, add-ons, optional desired start time).
2. If `orgMode === 'existing'`, resolve the organization's name/email via `queryMainDb` (a 3-column lookup exactly like `payouts.repository.ts`'s `getOrganizationDetail()` — `SELECT id, name, slug ... WHERE id = $1 AND "isDeleted" = false`) so bad org ids are rejected with `NotFoundError` before a quote is created.
3. Load the current `PricingConfig` and run `calculateBookingEstimate()` server-side — **this is the authoritative price**, not whatever the client sent.
4. Persist the `ContestBooking` row with `status: QUOTED`, `quotedAt: now()`.
5. Write `booking.created` audit entry (same event name/shape as today).
6. Return the created booking so the frontend can `router.push('/dashboard/bookings?bookingId=...')` exactly as it does now.

### 7.2 Status transitions
`PATCH /api/v1/ops/bookings/[id]/status` enforces the same 5-state machine already drawn in `BookingsView.tsx`'s stepper UI: `QUOTED → PAID → PROVISIONED → COMPLETED`, with `CANCELLED` reachable from `QUOTED`, `PAID`, or `PROVISIONED`. Reject illegal jumps (e.g. `QUOTED → PROVISIONED`) with `ConflictError`, same defensive style as `payouts.service.ts`'s `retryTransfer()`.

**On transition to `PAID`** — this is "the payment process" you mentioned. For this phase, keep it what the UI already builds: **admin-recorded manual reconciliation**, not a live customer checkout. The "Reconcile Cash Receipt" modal already collects a payment method (Credit Card/Razorpay/Bank Transfer/Manual Ledger) and a reference string — that's a support/sales person confirming money already arrived by whatever channel, not a payment gateway integration. Concretely:
1. Create an `OpsPayment` row (`purpose: 'CONTEST_BOOKING'`, `bookingId` set to this booking, `organizationId`, `amount` from the frozen `pricingBreakdown.total`, `status: 'PAID'`, `paidAt: now()`). This is what makes booking revenue show up in `billing.repository.ts`'s rollups later without inventing a second ledger.
2. Set `ContestBooking.paidAt`, `.paymentMethod`, `.paymentReference`, `.opsPaymentId`.
3. Audit: `booking.status_changed` with `oldStatus/newStatus/paymentMethod`.

A live Razorpay checkout for self-serve bookings (matching the `billing-portal` pattern already used for subscription checkout) is a legitimate later upgrade — but per your own framing, that only matters once this admin tool is proven out and you're ready to redirect main-app users into it. Building it now would be speculative; the manual-reconciliation path is what the UI already implements and is a complete, usable MVP for an admin-assisted sales flow.

**On transition to `PROVISIONED`** — keep this as a status flag flip only, same as today's simulated progress bar in `BookingsView.tsx`. No real AWS/container provisioning call. That's explicitly out of scope (it's the same infra work you're deferring for `/dashboard/infra`). Just set `provisionedAt` and audit the transition. If you want to keep the UI's fake progress animation for now as an "internal drama" cue that something is happening, that's a frontend-only decision with no backend implication — the endpoint returns immediately either way.

**On transition to `COMPLETED`/`CANCELLED`** — straightforward field + audit writes, no external calls, matches current mock behavior 1:1.

### 7.3 Frontend cutover
Rewrite `getBookings`, `getBooking`, `createContestBooking`, `updateBookingStatus` in `lib/api/bookings.ts` to call `apiRequest(...)` against the endpoints above. `lib/hooks/useBookings.ts` (all three hooks: `useBookings`, `useBookingDetail`, and `usePricingConfig` from 4a) needs **zero changes** — confirmed by reading the file, it only imports function names from `lib/api/bookings.ts` and has no mock-specific logic. Same for `BookingsView.tsx` and `ContestCalculatorView.tsx` — neither imports `lib/data/db.ts` directly.

---

## 8. What does NOT need to change

Worth stating explicitly since it's most of the visible surface area:
- `components/views/ContestCalculatorView.tsx`
- `components/views/BookingsView.tsx`
- `lib/hooks/useBookings.ts`
- `lib/types.ts` (`PricingConfig`, `BookingPricingBreakdown`, `ContestBooking` already match the shapes above)
- `app/dashboard/calculator/page.tsx`, `app/dashboard/bookings/page.tsx`

All of the actual work is: two new Prisma models, one new server feature module, five route handlers, and a rewrite of `lib/api/bookings.ts`'s function bodies (not signatures).

---

## 9. Verification checklist before calling this done

- [ ] `npx prisma migrate dev` applies cleanly against the ops DB; `prisma generate` picks up `PricingConfig`/`ContestBooking`/`BookingStatus`.
- [ ] `GET pricing-config` on a fresh DB bootstraps the default row instead of 500ing.
- [ ] `PUT pricing-config` as `SUPPORT` → `403 FORBIDDEN`; as `BILLING_ADMIN` → succeeds and writes an audit row visible on `/dashboard/audit-log`.
- [ ] Create a quote against an existing org, and against a "new prospect" — both appear correctly in the bookings list with the right org label.
- [ ] Quoted total from the calculator's live preview matches the total actually persisted by `POST /bookings` (proves the shared `lib/pricing/estimate.ts` module isn't drifting between client preview and server authority).
- [ ] Changing `PricingConfig` after a quote exists does **not** change that booking's frozen `pricingBreakdown` (Quote Isolation).
- [ ] Full status walk: `QUOTED → PAID → PROVISIONED → COMPLETED` on one booking, `QUOTED → CANCELLED` on another; illegal transition (e.g. `QUOTED → COMPLETED` directly) rejected with a clear error.
- [ ] Marking a booking `PAID` creates a matching `OpsPayment` row with `bookingId` set.
- [ ] List filters (status, search, date range/mode) behave the same as they do against mock data today.
- [ ] Audit log shows real actor name/role (not "System Operator" placeholder) for every booking/pricing-config mutation.

---

## 10. Rollout order

1. Prisma migration (models + enum + `PlatformAdmin`/`OpsPayment` reverse relations).
2. `server/features/bookings/` (types → validator → repository → service → controller), extract `lib/pricing/estimate.ts`.
3. Route handlers under `app/api/v1/ops/bookings/**`, register in `server/container.ts`.
4. Rewrite `lib/api/bookings.ts` function bodies only.
5. Manual QA against the checklist in §9.
6. Write `docs/api/bookings-api.md` in the same format as `docs/api/payouts-api.md` (base path, per-endpoint request/response examples) — useful reference doc, not blocking.
7. Only then: trim mock data (§11).

---

## 11. On deleting the mock data file — important nuance

You asked to delete `lib/data/db.ts` entirely once this is done. **That's not fully possible yet**, and I'd rather flag that now than have it be a surprise later. I checked every remaining consumer:

| Consumer | Uses | Still needed after this phase? |
|---|---|---|
| `lib/api/bookings.ts` | `getDatabase`/`saveDatabase`, `INITIAL_PRICING_CONFIG`, `INITIAL_CONTEST_BOOKINGS` | **No** — fully removable once §7 ships |
| `lib/api/ops.ts` | `getDatabase`/`saveDatabase` for Feature Flags (and infra status/scaling config) | Yes — Feature Flags and Infra are separate, later phases (PRD Phase 5) and untouched by this guide |
| `lib/api/auditLog.ts` | Its **mock-only** `writeAuditLogEntry()` (distinct from the real `server/audit/audit-writer.ts` one) | Partially — bookings/pricing-config stop calling it once they move server-side, but it's also called by `OrganizationDetailView.tsx` for impersonation-session logging, which is unrelated to this phase |
| `components/views/OverviewView.tsx` | `resetDatabaseToSeed()` — a "reset demo data" dev button | Yes, as long as any mock domain remains |

So the honest plan is:
- **After 4a/4b ship**: remove `PricingConfig`/`ContestBooking` from `MockDatabase`'s interface in `lib/data/db.ts`, delete `INITIAL_PRICING_CONFIG`/`INITIAL_CONTEST_BOOKINGS`, and drop `'pricing_config' | 'booking'` from the `targetType` union in `lib/api/auditLog.ts`'s mock writer. This is real, meaningful cleanup and safe to do immediately.
- **Full deletion of `lib/data/db.ts`** has to wait until Feature Flags and Infra & Cost (PRD Phase 5, currently hidden/deferred per your instruction) also get real backends, since they're the other two domains still reading/writing that file. Your dashboard's own PRD already sequences this as a later phase — this isn't new scope I'm inventing, just surfacing it so "remove the mock file" doesn't get treated as done prematurely.

I'd suggest treating "shrink `db.ts` to just flags/infra" as the literal last step of this phase, and full deletion as a checkbox in whatever phase finally builds real Feature Flags + Infra endpoints.

---

## 12. Explicitly out of scope for this guide

- Infra & Cost / AWS integration (`/dashboard/infra`, `InfraMonitoringView.tsx`, `InfraStatus`, `ScalingConfig`) — tab hidden, code untouched, per your instruction.
- Feature Flags backend.
- Live Razorpay checkout for bookings (self-serve). Manual reconciliation only, per §7.2.
- Real AWS container provisioning on the `PAID → PROVISIONED` transition. Status flag only.
- Redirecting main-app end users into this calculator. Per your description, that's a later integration once this admin tool is proven — the main app should just point users to "contact us" for now, no work needed here for that.
