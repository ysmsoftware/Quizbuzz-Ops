# QuizBuzz Ops — Pending Mock-Backed Features

Every dashboard section that still runs on the in-browser fake database (`lib/data/db.ts`) instead of a real `app/api/v1/ops/*` route. Ordered by priority as discussed: Feature Flags and the Calculator/Bookings pair now, Infra & Cost last since it's a fundamentally different technical surface (AWS SDK integration) rather than more of the same pattern as everything else already built.

New modules built from this doc should follow the fixed architecture from `ops-dashboard-architecture-fixes-plan.md` from the start — constructor-injected repository interfaces, wired through `server/container.ts` — rather than the `new X()` pattern used before that fix existed. No reason to build three more modules against the pattern that's already being retired.

## 1. Feature Flags — priority: now

### Current state
`lib/api/ops.ts`'s `getFeatureFlags()` / `toggleFeatureFlag()` read/write `lib/data/db.ts`'s fake store. No server route exists.

### Ops DB schema (new)

```prisma
model FeatureFlag {
  id                String   @id @default(ulid())
  key               String   @unique
  label             String
  description       String
  isEnabled         Boolean  @default(false)
  scope             String   @default("global")
  updatedByAdminId  String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  updatedBy         PlatformAdmin? @relation(fields: [updatedByAdminId], references: [id])

  @@map("feature_flags")
}
```

Matches the existing `FeatureFlag` frontend type in `lib/types.ts` field-for-field.

### Backend module

```txt
server/features/feature-flags/
  feature-flags.repository.ts   IFeatureFlagsRepository — list, findByKey, toggle
  feature-flags.service.ts      business rule: toggling logs audit + returns updated flag
  feature-flags.controller.ts
  feature-flags.validator.ts
  feature-flags.types.ts
```

### Routes

```txt
GET   /api/v1/ops/flags                any authenticated platform admin
PATCH /api/v1/ops/flags/:key/toggle     SUPER_ADMIN only
```

Audit action: `feature_flag.toggled` (before/after `isEnabled` in metadata).

### Seed flags to ship with

Per the PRD's own examples (§5.10) — seed these disabled by default so this ships inert:

```txt
maintenance_mode
disable_new_registrations
disable_paid_contest_publishing
```

### Main app dependency — the part that makes this matter

A flag that only flips a boolean in the ops DB is decorative until the main app actually reads one. Recommend building `disable_paid_contest_publishing` first, since it slots in next to the payout contest-publish gate already shipped in `ContestService` — same check site, same `BadRequestError` pattern, just one more condition.

How the main app reads it without calling ops synchronously on every contest-create request (matches the PRD's cache-driven philosophy, same reasoning as `planLimitsCache`): main app backend polls `GET /api/v1/ops/flags` (or a narrower public equivalent) on an interval — every 30-60 seconds — and caches the result in Redis with a short TTL. `ContestService` reads the cached value, never blocks on a live ops call. Document this as a decision point rather than assuming a synchronous call is acceptable.

## 2. Pricing Calculator (`PricingConfig`) — priority: now, build before/alongside Bookings

### Why this comes first

Bookings' price quote depends entirely on this configuration. If Bookings ships without a real backend for the calculator config, it will compute quotes against the same in-browser mock data it's supposed to be replacing — the dependency the user flagged needs to be explicit, not incidental. Build order: this section, then §3.

### Current state

`lib/api/bookings.ts`'s `calculateBookingEstimate(params, config: PricingConfig)` is already a clean, pure function that takes the config as a parameter — it doesn't reach into the mock DB itself. That's good; it means fixing the *source* of `config` (this section) is sufficient, the calculation logic itself doesn't need to change.

### Ops DB schema (new)

Single global config, not per-organization — model as a singleton row rather than a real multi-row table, since there's exactly one calculator configuration the whole platform uses:

```prisma
model PricingConfig {
  id                       String   @id @default("default") // singleton — always this literal id
  currency                 String   @default("INR")
  baseBookingFee           Decimal  @db.Decimal(10, 2)
  perParticipantCost       Decimal  @db.Decimal(10, 2)
  perQuestionCost          Decimal  @db.Decimal(10, 2)
  perInstanceHourCost      Decimal  @db.Decimal(10, 2)
  participantsPerInstance  Int
  elastiCachePerDayCost    Decimal  @db.Decimal(10, 2)
  addOns                   Json     // { proctoring: {enabled, flatCost}, certificates: {enabled, perParticipantCost}, prioritySupport: {enabled, flatCost} }
  marginMultiplier         Decimal  @db.Decimal(4, 2)
  updatedByAdminId         String?
  updatedAt                DateTime @updatedAt

  updatedBy                PlatformAdmin? @relation(fields: [updatedByAdminId], references: [id])

  @@map("pricing_configs")
}
```

### Backend module

```txt
server/features/pricing-config/
  pricing-config.repository.ts   IPricingConfigRepository — get(), update()
  pricing-config.service.ts      get() returns seeded defaults if no row exists yet; update() audits
  pricing-config.controller.ts
  pricing-config.validator.ts
  pricing-config.types.ts
```

### Routes

```txt
GET   /api/v1/ops/pricing-config    any authenticated platform admin (Calculator page reads this)
PATCH /api/v1/ops/pricing-config    SUPER_ADMIN, BILLING_ADMIN
```

Audit action: `pricing_config.updated`, with the full before/after diff in metadata — this is a platform-wide pricing change, worth a complete record, not just "updated."

### Frontend change

`lib/hooks/` gets a real `usePricingConfig()` replacing whatever reads `lib/data/db.ts` today. The Calculator page's save action calls the real `PATCH`. This is the one piece that must land before §3 is useful — Bookings quoting against a config that isn't the one an admin actually saved would silently produce wrong prices.

## 3. Bookings (`ContestBooking`) — priority: now, depends on §2

### Current state

`lib/api/bookings.ts` — quote creation, status transitions, all against the mock DB. `ContestBooking` type already defined in `lib/types.ts` with the full lifecycle (`quoted → paid → provisioned → completed/cancelled`) matching the PRD's `BookingStatus` enum design.

### Ops DB schema (new)

```prisma
model ContestBooking {
  id                    String        @id @default(ulid())
  status                BookingStatus @default(QUOTED)
  organizationId        String?
  organizationName      String?
  organizationEmail     String?
  contestName           String
  durationMinutes       Int
  questionCount         Int
  participantCount      Int
  addOnsSelected        Json          // { proctoring, certificates, prioritySupport }
  pricingBreakdown      Json          // snapshot of the computed quote at time of creation — see note below
  desiredStartTime      DateTime?
  quotedAt              DateTime      @default(now())
  paidAt                DateTime?
  provisionedAt         DateTime?
  cancelledAt           DateTime?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  @@index([status])
  @@index([organizationId])
  @@map("contest_bookings")
}
```

### Backend module

```txt
server/features/bookings/
  bookings.repository.ts    IBookingsRepository
  bookings.service.ts       createQuote recomputes price server-side (see below), status transitions
  bookings.controller.ts
  bookings.validator.ts
  bookings.types.ts
```

### The one correctness rule that matters here

`createQuote` must call the §2 pricing-config service and recompute `pricingBreakdown` **server-side**, using whatever the client submitted (duration/questions/participants/add-ons) as inputs only — never accept a client-submitted price. `pricingBreakdown` is then stored as a snapshot on the booking row precisely so that a later change to `PricingConfig` doesn't retroactively alter the price of a quote that's already been shown to a customer.

### Routes

```txt
GET    /api/v1/ops/bookings                 list/filter by status
POST   /api/v1/ops/bookings                 create quote (recomputes price, see above)
GET    /api/v1/ops/bookings/:id             detail
PATCH  /api/v1/ops/bookings/:id/status      transition (admin-assisted per PRD §5.7 — no self-serve payment yet)
```

Audit actions: `booking.created`, `booking.status_changed`.

Payment collection for bookings (the `quoted → paid` transition) is out of scope for this pass — PRD explicitly says "admin-assisted first, self-serve later." Mark paid manually with an audit entry for now; a real Razorpay order/webhook for bookings can reuse the same shape being built for the billing-portal subscription flow (see `starter-plan-billing-handoff-test-plan.md`) once that pattern exists.

## 4. Infra & Cost Monitoring — priority: last, deferred

### Why it's different from the other three

Feature Flags, Pricing Calculator, and Bookings are all "the same shape of work" — a Prisma model in `quizbuzz_ops`, a repository/service/controller module, a route, an audit action. Infra & Cost requires actual AWS SDK calls (Auto Scaling Group describe, ElastiCache describe, Cost Explorer or manual cost math) — real cloud credentials and a genuinely different integration surface, not more of the same pattern. That's the reason to do it last rather than a reflection of it being unimportant.

### What's needed when it's time

- Read-only IAM credentials scoped to: `autoscaling:Describe*`, `elasticache:Describe*`, and either Cost Explorer API access or a manually-maintained cost-per-resource estimate table (Cost Explorer has a real dollar cost per API call and a data lag, worth deciding against a simpler estimate approach first).
- `server/features/infra/` — repository wraps the AWS SDK client, service maps to the existing `InfraStatus`/`ScalingConfig` frontend types.
- No writes in the first pass — this is a monitoring view (per PRD §5.8), not a control plane, unless/until you decide ops should be able to trigger scale-up/down directly.

### For now

Leave it mocked. No work planned this cycle. Revisit once AWS read-access credentials are actually available to provision.

## 5. Also still mock, not raised by name but worth tracking

Impersonation (`OrganizationDetailView.tsx`'s "Impersonate" action) still only dispatches a browser event and writes a mock audit entry — no real token issuance. This is explicitly a Phase 3 item per the PRD, not part of this pass; noted here so the full mock inventory stays in one place.
