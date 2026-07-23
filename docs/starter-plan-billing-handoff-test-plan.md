# ₹1 Starter Test Plan — Main App → Ops Billing Handoff, End-to-End

Goal: prove the whole subscription-payment path actually works — an org signs up in the main app, sees a real plan (not the current hardcoded stub), gets redirected to the ops dashboard to actually pay, ops owns and records that payment, and the result (plan, entitlements, audit trail) is visible correctly in both apps.

This is a bigger lift than "add a plan." The plan itself takes one API call. Everything else in this doc is what has to be built for the redirect-and-pay handoff to exist at all — right now it does not.

## 1. Current state (verified in code, 2026-07-22)

- Main app onboarding already has a real "Choose a Plan" step: `frontend/app/org/onboarding/page.tsx`'s `PlanSelectionStep`, fed by `GET /onboarding/plans` (`frontend/lib/api/onboarding.api.ts` → `backend/src/modules/onboarding/onboarding.service.ts`).
- That backend endpoint currently returns `STATIC_PLANS` — a hardcoded array in `onboarding.service.ts`, with the code comment *"Static plan stub — will be replaced by real ops-subscription call later."*
- Selecting a plan during onboarding does not persist anywhere yet — another code comment: *"Plan selection is stubbed — no plan data lives on the profile table."*
- Ops already has full plan/subscription CRUD (`/api/v1/ops/plans`, `/api/v1/ops/organizations/:orgId/subscription`) — verified correct in the payout/billing review.
- Ops has **no** customer-facing billing surface yet. No `app/api/v1/billing-portal/*` routes, no `app/billing/checkout/page.tsx`. Only the design exists, in `ops-dashboard-database-and-data-flows.md` §14 and `ops-dashboard-backend-phase1-2-guide.md` §6.6. Nothing has been built against that design.

So this plan is: seed one plan, then build the entire main-app-to-ops handoff and ops-side checkout that the earlier docs only sketched.

## 2. The test plan itself

Create a new plan distinct from the existing seeded `starter` (Free, ₹0) — reusing that slug and just changing its price would quietly turn your real free tier into a paid one for every org already on it. Use a clearly-named test plan instead:

```json
POST /api/v1/ops/plans
{
  "name": "Starter (Test — ₹1)",
  "slug": "starter-test",
  "description": "Test plan for validating the subscription payment handoff. Not for production orgs.",
  "price": 1.00,
  "currency": "INR",
  "billingCycle": "MONTHLY",
  "maxContestsPerCycle": 2,
  "maxParticipantsPerContest": 100,
  "maxQuestionsPerContest": 15,
  "maxOrgMembers": 1,
  "featureProctoring": false,
  "featureCertBranding": false,
  "featurePrioritySupport": false,
  "featureAnalyticsExport": false,
  "featureCustomDomain": false
}
```

Confirm the naming with whoever else looks at the plans list before running the test — a plan literally named "Test" showing up in the ops plans list next to real tiers is intentional here, but should be deactivated (`POST /plans/:planId/deactivate`) once the test is done so it can't be accidentally assigned to a real customer later.

## 3. Main app changes required

### 3.1 Replace the plan-catalog stub

`onboarding.service.ts`'s `getPlans()` should call a new ops-side public catalog endpoint (§4.1) instead of returning `STATIC_PLANS`. This alone is the first thing to verify in testing — the ₹1 test plan showing up in the real onboarding UI proves the catalog wiring works, before touching payment at all.

### 3.2 Persist the selection and branch on price

Today, picking a plan during onboarding is a no-op past local wizard state. That needs to become real:

- If the selected plan's price is `0`: onboarding completes normally, main app writes `planSlug`/`planStatus` directly (or, cleaner, calls ops's existing `POST /organizations/:orgId/subscription` under a narrow service-to-service credential — a decision to make, see §6).
- If the selected plan's price is `> 0`: onboarding still completes (the org exists, is active, defaults to the free tier in the meantime) but the "Choose a Plan" step's continue button becomes "Continue to Payment" and redirects the browser to the ops checkout URL instead of advancing the wizard locally. The org's plan only actually changes once the ops webhook confirms payment (§4.4) and writes back through the existing cache write-through.

### 3.3 New main-app endpoint: signed handoff

```txt
POST /api/backend-route/billing/handoff
  body: { organizationId, planSlug }
  → generates a short-lived signed token (org id, admin id, plan slug, issued-at, HMAC using a
    shared secret both apps hold — e.g. BILLING_HANDOFF_SECRET)
  → returns { checkoutUrl: "{OPS_BASE_URL}/billing/checkout?token=..." }
```

Frontend redirects the browser to `checkoutUrl`.

## 4. Ops changes required (net new)

### 4.1 `GET /api/v1/billing-portal/plans`

Public, no platform-admin auth. Returns only active plans' public fields (slug, name, description, price, currency, billing cycle, limits/features for display). Used by both the main app's backend (§3.1) and the checkout page itself.

### 4.2 `POST /api/v1/billing-portal/session`

Accepts the signed handoff token from §3.3. Verifies signature and expiry (recommend a 10-minute TTL), resolves `{ organizationId, planSlug }`, returns a short-lived billing session (signed cookie scoped to `/billing/*`, separate from `ops_access_token`). Reject with a clear error page if the token is expired or invalid — this is a customer-facing surface, not an operator one, so error messages should stay generic (no stack traces, no internal IDs beyond what's needed).

### 4.3 `app/billing/checkout/page.tsx`

Customer-facing (org admin, not platform admin). Shows plan name/price, a "Pay ₹1" button. On click, calls:

```txt
POST /api/v1/billing-portal/subscription/order
  → creates OpsPayment (organizationId, purpose: 'subscription', amount: 100 (paise), status: PENDING,
    razorpayOrderId)
  → returns Razorpay order details + key id for the checkout widget
```

Opens the Razorpay checkout widget client-side exactly like the main app's contest-fee checkout does today.

### 4.4 `POST /api/v1/billing-portal/razorpay/webhook`

Source of truth, same principle as the main app's contest-payment webhook — the frontend verify call (if any) is a convenience, not authoritative.

```txt
payment.captured
→ verify Razorpay webhook signature
→ mark OpsPayment PAID, paidAt = now()
→ call subscriptionsService.assignPlan(organizationId, planId, SYSTEM_ACTOR) — reuses the
  already-built, already-audited assign-plan path, which itself calls syncOrgPlanLimitsCache
→ write audit billing_portal.payment_succeeded

payment.failed
→ mark OpsPayment FAILED
→ write audit billing_portal.payment_failed
```

### 4.5 Audit trail — this is the part you specifically asked to verify

Add these actions, all logged even though the actor is an org admin, not a platform admin (see §6 for how `actorId` is handled when there's no `PlatformAdmin` row for that person):

```txt
billing_portal.checkout_started    — session token validated, checkout page rendered
billing_portal.payment_attempted   — Razorpay order created (§4.3)
billing_portal.payment_succeeded   — webhook payment.captured (§4.4)
billing_portal.payment_failed      — webhook payment.failed, or an abandoned/expired session
```

`checkout_started` and `payment_attempted` are what let you see "user tried to pay and didn't finish" in the Audit Log view, not just successful payments — recording only success would hide exactly the failure/abandonment cases you said you want visible.

### 4.6 Redirect back

On success, checkout page redirects to `{MAIN_APP_FRONTEND_URL}/org/settings?tab=billing&subscription=success`. On failure/cancel, redirect with `?subscription=failed` so the main app can show a clear retry prompt.

## 5. Manual test script

1. Create the test plan (§2) via ops as `SUPER_ADMIN` or `BILLING_ADMIN`.
2. In the main app, sign up a fresh org admin and go through onboarding to "Choose a Plan." Confirm the ₹1 test plan appears in the real list (proves §3.1/§4.1 wiring, independent of payment).
3. Select it, confirm "Continue to Payment" appears instead of a normal "Next" step.
4. Click through — confirm the browser lands on `{OPS_BASE_URL}/billing/checkout?token=...` with the correct org name and ₹1 shown.
5. Pay with a Razorpay test-mode card/UPI.
6. Confirm the webhook fires: `OpsPayment.status = PAID` in the ops DB.
7. Confirm `OrganizationSubscription` now exists for that org on the test plan.
8. Confirm the main app's `Organization.planSlug` / `planStatus` / `planLimitsCache` were updated (check via main app Settings, or directly in the main DB).
9. Confirm the browser redirected back to the main app with a visible success state.
10. Open the ops Audit Log view. Confirm all four actions from §4.5 are present, in order, with correct org/plan/amount metadata.
11. **Negative test** — repeat from step 2 with a fresh org, but abandon the checkout page without paying (close the tab). Confirm `checkout_started` and (if you got as far as opening the Razorpay widget) `payment_attempted` are logged, no `payment_succeeded`, and the org's plan cache in the main app was **not** changed.
12. **Negative test 2** — use a Razorpay test card designed to fail. Confirm `payment_failed` is logged and, again, no plan cache change on the main app side.
13. Clean up: deactivate the test plan (`POST /plans/:planId/deactivate`) so it can't be assigned to a real org afterward.

## 6. Open decisions to make before building

- **Shared secret for the handoff token.** Needs to live in both apps' env as the same value (e.g. `BILLING_HANDOFF_SECRET`) — decide who owns rotating it.
- **Razorpay account.** Confirm whether ops's `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (already present in `quizbuzz-ops-next/.env`) point at the same Razorpay merchant account as the main app's, or a separate one. Either is workable, but the webhook secret and order/payment IDs must not be cross-checked against the wrong account's signature.
- **Audit actor for org-admin-initiated actions.** `PlatformAuditLog.actorId` is a foreign key to `PlatformAdmin` — an org admin has no row there. Recommend `actorId: null`, `actorLabel: "{orgAdminName} (ORG_ADMIN via billing-portal)"`, with the real org admin id/email carried in `metadata` instead. Don't silently attribute these to `SYSTEM` — that would make the audit trail say a person's payment attempt was a system action, which defeats the point of auditing it.
- **Free-plan persistence path.** Whether the main app writes `planSlug`/`planStatus` directly on free-plan selection, or calls ops's existing subscription-assign endpoint under a service credential, either works — pick one and document it, don't leave both partially wired.
