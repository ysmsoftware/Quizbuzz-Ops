# QuizBuzz — Super Admin / Developer Dashboard
## Design Specification (v1 — Discussion Draft)

**Purpose of this doc:** define what the platform-owner (you) needs to see and control across *all* organizations, lay out what already exists in the current schema/API vs. what's net-new, and propose a phased build order. No implementation in this doc — this is scoping only.

---

## 0. Where this sits relative to what exists today

Today's system has exactly two auth tiers:
- `Admin` — belongs to one or more `Organization`s via `OrgMember` (`OWNER` / `ADMIN` / `VIEWER`)
- `Contact` — quiz participants, OTP-based, no password

There is **no concept of a platform-level operator** anywhere in `schema.txt` or `quizbuzz-api-docs.md`. Every existing table (`Contest`, `Participant`, `Payment`, `Question`, etc.) is already scoped by `organizationId`, which is actually convenient — the super admin dashboard is mostly a **read-aggregation layer across orgs** plus a small number of **write paths that don't exist yet** (plan management, overrides, suspension, booking).

So this is a new, separate admin surface — not a bolt-on to the existing `/api/v1/admin/*` routes, which stay org-scoped and untouched.

---

## 1. Access & Auth (new, foundational)

This has to be built before anything else in this doc is usable, because everything downstream assumes a caller identity that isn't `Admin` or `Contact`.

**New model: `PlatformAdmin`**
- Not a row in `Admin` / `OrgMember` — a fully separate table and login flow
- Fields conceptually needed: id, email, passwordHash, role, isActive, 2FA secret/enabled, lastLoginAt
- Roles (start narrow, expand later):
  - `SUPER_ADMIN` — full control, including plan/pricing edits and impersonation
  - `SUPPORT` — read-only org view + impersonation for debugging, no billing edits
  - `BILLING_ADMIN` — plans, pricing calculator config, refunds — no impersonation
- Separate JWT audience/scope from org admin tokens, so an org `Admin` token can never hit `/super-admin/*` routes even if leaked, and vice versa
- Recommend a distinct subdomain (`admin.ysmquizbuzz.com` or similar) rather than a route under the main app, so it can have its own cookie domain, stricter CSP, and optionally IP allowlisting later
- 2FA should be mandatory here from day one — this surface can suspend orgs, refund money, and impersonate — it's a much higher-value target than an org admin login

**Impersonation ("log in as this org")** deserves its own callout: it's the single most useful support tool and also the single riskiest action on this whole dashboard. It should issue a short-lived, explicitly-scoped token (not a real `Admin` session), be visually unmistakable in the UI ("Viewing as Acme Corp — impersonated by you@yourco.com"), and be unconditionally logged (see §9 Audit Log). Never silently reuse a real admin's credentials.

---

## 2. Platform Overview (home screen)

The landing view — mostly counts and trends, all derivable from existing tables via aggregation queries, nothing new needed in the schema for this section.

| Widget | Source | Notes |
|---|---|---|
| Total organizations (active / suspended / deleted) | `Organization.isActive/isDeleted` | straightforward count |
| New orgs this week/month | `Organization.createdAt` | trend line |
| Total contests by status | `Contest.status` grouped count | DRAFT/PUBLISHED/LIVE/etc. |
| Total participants (platform-wide) | `Participant` count | |
| Total revenue (all-time / this month) | `Payment` where `status=PAID`, summed | needs org rollup, not new data |
| Contests currently LIVE right now | `Contest.status=LIVE` | this is your "is the ALB/ASG/ElastiCache infra currently up" indicator — ties directly to §8 |
| Upcoming contests in next 7 days | `Contest.startTime` | ops planning — lets you see go-live windows coming up before they happen |
| Infra mode indicator | not in DB today — comes from Terraform state / a small "current mode" flag your `go-live.sh`/`go-idle.sh` scripts should write somewhere readable (SSM parameter is the natural place, matching how `image-tag` is already stored) |

---

## 3. Organizations Management

**List view** — table of every org: name, slug, owner email, member count, contest count, participant count, current plan/tier, status, created date. Search + filter (by plan, by status, by activity recency) + sort.

**Org detail view (drill-down)** — this is where most of the "see their name, number, everything" requirement lands:
- Org profile (name, logo, website, slug, created date)
- Members list — name, email, role (from `OrgMember` + `Admin`)
- Contests list for this org, each with participant count, revenue, status
- Contacts (participants) for this org — name, phone, email, which contests they're in, registration/payment status per contest (this data already exists via `Contact` → `Participant` → `Payment`, just needs an org-scoped join exposed to this new surface)
- Payment/revenue history for the org
- Subscription & usage panel (see §5) — plan, usage-this-cycle vs. limits, override history
- Actions: suspend / reactivate / soft-delete org, impersonate, add internal notes/tags (simple CRM-style free text + tags for support context — new small model, `OrganizationNote`)

**Note on suspension:** `Organization` currently only has `isActive`/`isDeleted` booleans. That's probably enough to represent "suspended" (`isActive=false` without `isDeleted`), but you'll want the suspension to actually *do* something — e.g., block new contest creation and new registrations while still letting the org view historical data. That's a service-layer check to add later (`OrganizationService` checking `isActive` before any write), not a schema change.

---

## 4. Contest Analytics (platform-wide)

Aggregate view answering "what's normal usage look like across the platform":
- Avg contests per org, avg participants per contest, median/largest contest sizes
- Top orgs by contest count / by revenue / by participant count
- Filterable by date range
- A calendar/timeline view of scheduled `startTime`s across all orgs — this is genuinely useful operationally, since it tells you in advance when multiple orgs might need `go-live.sh` around the same window and whether ASG capacity (`min=2, max=10`) is enough for concurrent live contests from *different* orgs sharing the same infra

---

## 5. Subscription & Plan Management

This is the biggest net-new piece. Nothing in the current schema represents a plan, tier, or limit.

### 5.1 New model: `SubscriptionPlan` (the tier definitions)
Conceptually: id, name (e.g. "Starter", "Growth", "Enterprise"), slug, price, billing cycle (monthly/annual), and a set of limits + feature flags:
- `maxContestsPerCycle`
- `maxParticipantsPerContest`
- `maxQuestionsPerContest`
- `maxOrgMembers`
- feature flags: proctoring enabled, certificate branding/custom template, priority support, custom domain, analytics export, etc.
- `isActive` (so old plans can be retired without breaking orgs still on them)

Editing a plan here changes the limit for **every org on that plan** — this is the "tweak it and change it globally" behavior you described.

### 5.2 New model: `OrganizationSubscription` (per-org assignment)
Links an `Organization` to a `SubscriptionPlan`, plus:
- current period start/end
- status (active / past_due / cancelled)
- **overrides** — this is the per-org exception mechanism you described ("give this one org +2 contests this month" or "unlimited participants until date X") without touching their actual tier. Store as a small structured override set (e.g. a JSON field or a separate `SubscriptionOverride` table if you want history/expiry per override) so overrides can expire and be audited independently of the plan itself.

### 5.3 Usage tracking
You already have a pattern for this: `ContestAnalyticsSnapshot` snapshots per-contest stats every 15 min via a worker. The subscription system needs the same idea but rolled up **per org per billing cycle** — contests created this cycle, participants registered this cycle, etc. Two ways to get there:
- Compute on-the-fly from existing tables (`Contest`, `Participant`) filtered by `createdAt` within the current cycle — simplest, no new table, fine at your current scale
- Or add a periodic snapshot table if computing live becomes expensive — not needed yet

Either way, the dashboard needs a usage view per org: progress bars against each limit ("3/5 contests used this cycle", "420/500 participants used across contests this cycle").

### 5.4 Enforcement
Once plans exist, contest creation / participant registration need a limit check somewhere in the service layer (`ContestService.create`, `RegistrationService.register`) that reads the org's active plan + overrides before allowing the action. This is a backend change beyond the dashboard itself, but it's the whole point of having tiers — worth flagging now so it's not forgotten as "dashboard-only."

---

## 6. Billing & Revenue

- Revenue dashboard: if/when subscriptions launch, MRR/ARR; regardless, total revenue from the existing one-time `Payment` flow (Razorpay) rolled up by org and by month
- Transaction list — effectively an org-agnostic view over the existing `Payment` table, with org name joined in
- Refunds — `Payment.status = REFUNDED` already exists as an enum value; the dashboard needs an action to *trigger* one (calls Razorpay refund API, updates `Payment.refundedAt`), which today has no route at all — worth noting there's currently no refund endpoint in the API docs
- Failed payment / dunning view once subscriptions exist (not needed for pure one-time-payment model)

---

## 7. Pay-Per-Contest Calculator ("AWS-style" pricing estimator)

This is the second major net-new subsystem, and it's genuinely interesting because you can ground the pricing in real numbers you already have from the load-test work — this isn't a guess, you have actual per-instance costs.

### 7.1 Inputs (from the user/org)
- Contest name
- Duration (minutes/hours)
- Number of questions
- Number of participants
- Optional add-ons: proctoring on/off, certificate generation on/off, priority support

### 7.2 Pricing model — should be config, not code
In keeping with your own engineering guidelines doc (no hardcoded limits, config-agnostic business logic), the calculator's formula itself should read from a `PricingConfig` / `PricingRule` table, not be hardcoded in a service method. Suggested cost components, each independently tunable:
- **Base booking fee** (flat, covers overhead — DB rows, cert storage, etc.)
- **Per-participant cost** — this is real, since participant count directly drives which ASG tier you spin up (your own docs show `quiz_inst_count = min(10, max(2, ceil(participants/1000)))`, and each `c6i.large` instance runs ~$0.17-0.20/hr). The calculator can literally reuse that same formula to estimate instance-hours, then price it.
- **Per-question cost** — smaller, but real (storage, seed/shuffle compute, more Redis payload per participant per your own `~18.6KB/participant` breakdown in the incident log)
- **Duration-based infra cost** — instance-hours × duration, plus ElastiCache (~$8/day per your cost table) prorated for the contest window
- **Add-on costs** — proctoring, certificates, priority support as flat or per-participant surcharges
- **Margin/markup multiplier** — a single config value so you can adjust profitability without touching the formula

### 7.3 Output
A line-item breakdown exactly like the AWS calculator — "Base fee: ₹X, Compute (N instances × H hours): ₹Y, Redis: ₹Z, Add-ons: ₹W → Total: ₹Total" — so the buyer can see *why* it costs what it costs, not just a single number.

### 7.4 Booking flow
1. Org (existing or new) fills the calculator → gets a quote
2. Quote is stored (new model: `ContestBooking` — status `QUOTED → PAID → PROVISIONED → COMPLETED/CANCELLED`), with the pricing snapshot frozen at quote time (important — if you tune `PricingConfig` later, past quotes shouldn't retroactively change)
3. Payment via existing Razorpay flow (`POST /register/:contestSlug` + `/payments/verify` pattern already exists — this booking flow can reuse the same verification mechanics, just against a `ContestBooking` instead of a `Participant`)
4. On payment success → contest gets created/provisioned for that org, possibly with the `startTime`/`duration` pre-filled from the quote
5. This booking effectively becomes an input to §4's "upcoming live contests" calendar — a paid one-time booking is a scheduling commitment your infra needs to know about ahead of time for `go-live.sh` pre-warming

This should probably be **admin-assisted at first** (you or support fill it in when someone calls/emails) rather than a fully public self-serve page, given you're a solo engineer — the self-serve public version is a natural phase-2.

---

## 8. Infra & Cost Monitoring

Ties directly into your existing two-mode Terraform setup rather than duplicating it:
- Current mode (idle/live) — surfaced from wherever `go-live.sh`/`go-idle.sh` record state (SSM param recommended, matching your existing `image-tag` pattern)
- Active ASG instance count, ElastiCache status — can pull straight from AWS APIs (CloudWatch/ASG describe calls) rather than needing new DB tables
- A simple running "estimated AWS spend this month" counter, built from your own documented cost table (permanent ~$35-40/mo + per-contest ephemeral costs), so you can sanity-check actual AWS billing against expected

This section is lower priority than orgs/plans/billing — it's a nice-to-have ops view, not something a customer-facing dashboard needs.

---

## 9. Audit Log

Every write action taken from this dashboard needs a row: which `PlatformAdmin`, what action, which org, what changed (before/after where relevant), timestamp. New model: `PlatformAuditLog`. This matters most for: impersonation, plan/override edits, suspensions, refunds. Given the sensitivity of this whole surface, I'd treat "no audit log" as a blocker for shipping impersonation and refunds specifically — those two actions shouldn't go live without it.

---

## 10. Feature Flags / Global Settings (optional, later)

- Platform-wide toggles (e.g., maintenance-mode banner shown to all orgs, disabling new registrations platform-wide during a deploy)
- Not urgent — nice-to-have once the core dashboard is stable

---

## 11. New Data Model Summary (net-new, not in current `schema.txt`)

| Model | Purpose |
|---|---|
| `PlatformAdmin` | Super-admin login, separate from `Admin` |
| `SubscriptionPlan` | Tier definitions + limits + feature flags |
| `OrganizationSubscription` | Org ↔ plan assignment, current period, status |
| `SubscriptionOverride` *(optional, could fold into above)* | Per-org custom allowances with expiry |
| `OrganizationNote` | Support/CRM free-text notes + tags on an org |
| `PricingConfig` / `PricingRule` | Tunable inputs for the contest calculator |
| `ContestBooking` | One-time pay-per-contest quote → payment → provisioning lifecycle |
| `PlatformAuditLog` | Every sensitive super-admin action |

Everything else this dashboard needs (org lists, contest stats, participant details, payment history) is **read-aggregation over tables that already exist** — no changes needed there.

---

## 12. New API Surface (route groups, no implementation)

```
/api/v1/super-admin/auth/*                        — separate login, 2FA
/api/v1/super-admin/organizations                  — list, detail, suspend, notes
/api/v1/super-admin/organizations/:id/impersonate  — scoped short-lived token
/api/v1/super-admin/organizations/:id/subscription — view/edit plan + overrides
/api/v1/super-admin/contests                        — platform-wide aggregate views
/api/v1/super-admin/plans                            — CRUD subscription tiers
/api/v1/super-admin/billing/transactions             — payment rollups, refunds
/api/v1/super-admin/pricing-config                   — tune calculator formula
/api/v1/super-admin/bookings                         — calculator quotes + booking lifecycle
/api/v1/super-admin/audit-log                        — read-only log view
/api/v1/super-admin/infra                            — mode, ASG status, cost estimate
```

All of these live under a distinct route prefix and auth guard, entirely separate from `/api/v1/admin/*` (org-scoped) and `/api/v1/auth/admin/*` (org admin login) that already exist.

---

## 13. Suggested Phasing (solo-engineer-realistic)

**Phase 1 — Read-only visibility (highest value, lowest risk)**
Platform overview, org list, org detail drill-down, contest/participant/payment rollups. No writes except suspend/reactivate. This alone answers "how many orgs, how many contests, who are the participants" — your immediate ask.

**Phase 2 — Subscription & plans**
`SubscriptionPlan`, `OrganizationSubscription`, usage-vs-limit view, per-org overrides, enforcement checks in `ContestService`/`RegistrationService`.

**Phase 3 — Billing depth + audit log + impersonation**
Refund actions, audit logging (should ship *with* impersonation/refunds, not after), transaction rollups.

**Phase 4 — Pricing calculator + booking flow**
Start admin-assisted (you fill in the calculator for a lead), then self-serve public version once the formula is validated against a few real bookings.

**Phase 5 — Infra/cost monitoring, feature flags**
Nice-to-have polish once the core is stable.

---

*This document reflects the state of `schema.txt`, `quizbuzz-api-docs.md`, and `DEPLOYMENT_PLAN.md` as currently in the project. No code has been written or modified — this is scoping only.*
