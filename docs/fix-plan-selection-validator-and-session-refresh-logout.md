# Fix Doc: Onboarding Plan-Selection Validator + Ops Dashboard Refresh-Logout

Two bugs found while testing the Starter (₹1) plan billing handoff end-to-end. Both are diagnosed to the exact line. No code has been changed yet — this doc is the fix spec.

---

## Bug A — "Invalid input, expected 'free'" on Continue to Payment

**Repo:** `Quizbuzz-new` (main app)
**Symptom:** Org admin selects the ₹1 "Starter Test" plan during onboarding, clicks "Continue to Payment," and gets a validation error instead of being redirected to the ops checkout.

### Root cause

`backend/src/modules/onboarding/onboarding.validator.ts:62-64`

```ts
export const PlanSelectionStepSchema = z.object({
    planSlug: z.enum(["free"]),
});
```

This schema was written as a stub before the real plan catalog existed and was never updated. It hard-codes the only acceptable value to `"free"`.

### Why it fires

`frontend/app/org/onboarding/page.tsx` defaults `PLAN_SELECTION` state to `{ planSlug: 'starter-test' }` and, on submit, calls `saveStepMutation.mutateAsync(...)` first. That hits:

`PATCH /onboarding/step/plan_selection` → `onboarding.controller.ts` → `OnboardingService.saveStep()` (`onboarding.service.ts:97-131`) → `schema.safeParse(body)` against `PlanSelectionStepSchema`.

Since `"starter-test" !== "free"`, `safeParse` fails and `BadRequestError(parsed.error.issues[0].message)` is thrown — that message is literally "Invalid input, expected 'free'" (Zod's default enum mismatch message). This happens *before* the correctly-implemented `createHandoffToken()` / redirect-to-ops-checkout logic in the same page ever runs, so the user never reaches the payment screen.

Everything downstream of this schema — `getPlans()` fetching the live catalog from ops, `createHandoffToken()`, the JWT handoff, the `/onboarding/handoff` route — is correct and doesn't need changes.

### Fix

Loosen the schema to accept any non-empty slug. Real validation of "does this plan actually exist and is it purchasable" already happens on the ops side (ops's `/api/v1/billing-portal/plans` and `/subscription/order` endpoints look up the plan by slug against `SubscriptionPlan` and will reject anything invalid there). The onboarding step schema's only job is to confirm the client sent *a* slug.

```ts
// ─── PLAN_SELECTION step ──────────────────────────────────────────────────────

export const PlanSelectionStepSchema = z.object({
    planSlug: z.string().min(1, "Please select a plan"),
});
```

No other file needs to change for this bug. `onboarding.service.ts`'s `saveStep()` PLAN_SELECTION branch (line 122-126) already just advances the step to `COMPLETED` without persisting the slug, and the handoff/redirect flow reads the slug straight from the frontend's selected plan state, not from what was saved in this step — so this is a pure validation-gate fix with no ripple effects.

### Optional hardening (not required to unblock testing)

If it's worth defending against typos or stale frontend state, `saveStep()` could instead validate the slug against the live catalog:

```ts
if (upperStep === "PLAN_SELECTION") {
    const plans = await this.getPlans();
    if (!plans.some(p => p.slug === (data as any).planSlug)) {
        throw new BadRequestError(`Unknown plan: ${(data as any).planSlug}`);
    }
    await this.repo.advanceStep(orgId, OnboardingStep.COMPLETED);
    return;
}
```

This is a nice-to-have, not part of the required fix.

---

## Bug B — Ops dashboard logs the user out on browser refresh

**Repo:** `quizbuzz-ops-next`
**Symptom:** After logging in successfully, refreshing any `/dashboard/*` page bounces the operator back to `/login`, even though the session cookie is still valid.

### What's NOT the bug (ruled out)

- Cookie-setting on the server: `server/features/platform-auth/platform-auth.controller.ts` sets `ops_access_token` / `ops_refresh_token` correctly (httpOnly, `sameSite: 'lax'`, `path: '/'`, correct maxAge).
- `getSessionAdmin()` (`server/http/auth-guard.ts`): reads the cookie and verifies the JWT correctly.
- `GET /api/v1/ops/auth/me` (`app/api/v1/ops/auth/me/route.ts` → `platformAuthController.me()`): correctly calls `getSessionAdmin()` and returns the admin.
- There is no root-level `middleware.ts` doing a conflicting server-side redirect.

The server-side auth stack is sound. The bug is entirely client-side, in a race between two pieces of state.

### Root cause

`lib/hooks/useAuth.ts`:

```ts
const [localSession, setLocalSession] = useState<AdminSession | null | undefined>(undefined);

useEffect(() => {
  setLocalSession(getCurrentSessionSync());   // reads localStorage, but only AFTER first render
}, []);

const { data: session, isLoading, refetch } = useQuery({
  queryKey: ['auth', 'session'],
  queryFn: getCurrentSession,                 // the real check — calls GET /auth/me
  initialData: localSession || undefined,     // localSession is still `undefined` on first render
});
```

`app/dashboard/layout.tsx:52-126`:

```ts
const { admin, logout } = useCurrentAdmin();   // isLoading is available but not destructured/used

useEffect(() => {
  if (!admin) {
    router.push('/login');                     // fires immediately if admin is falsy
  }
}, [admin, router]);

if (!admin) return null;
```

On a hard refresh, React state (`localSession`) always initializes to `undefined` on the very first render — the `useEffect` that populates it from `localStorage` only runs *after* that first render commits. So on that first render, `useQuery`'s `initialData` evaluates to `undefined`, meaning `session` (returned as `admin`) is `undefined` too — indistinguishable from "definitely logged out." The layout's guard effect doesn't check `isLoading`, so it treats that transient `undefined` as a real logged-out state and calls `router.push('/login')` immediately.

The real check (`getCurrentSession()` → `GET /api/v1/ops/auth/me`, which reads the valid cookie and would succeed) is still in flight in the background — but by the time it resolves, the browser has already navigated away.

This reproduces on **every** hard refresh, deterministically, regardless of cookie validity — it's a render-timing bug, not an intermittent one.

### Fix

Make the redirect guard wait for the query to actually settle before deciding the user is logged out.

**`lib/hooks/useAuth.ts`** — no changes needed; `isLoading` is already returned (line 92).

**`app/dashboard/layout.tsx`**:

```diff
- const { admin, logout } = useCurrentAdmin();
+ const { admin, isLoading, logout } = useCurrentAdmin();
```

```diff
- // Auth guard: localStorage-based session, so this must be client-side
- useEffect(() => {
-   if (!admin) {
-     router.push('/login');
-   }
- }, [admin, router]);
-
- if (!admin) return null;
+ // Auth guard: wait for the session query to settle before deciding the
+ // user is logged out. Without the isLoading check, the transient
+ // `admin === undefined` state on first render (before initialData /
+ // the real /auth/me check resolves) gets misread as "not authenticated"
+ // and redirects on every hard refresh even with a valid cookie.
+ useEffect(() => {
+   if (!isLoading && !admin) {
+     router.push('/login');
+   }
+ }, [admin, isLoading, router]);
+
+ if (isLoading) return null; // or a loading skeleton
+ if (!admin) return null;
```

That's the minimal fix. It does not require touching the `localStorage`-cache pattern in `lib/api/auth.ts` — that pattern is only used to avoid a flash of "logged out" UI while the real check runs, and is orthogonal to this bug.

### Note for the architecture-fixes follow-up (not required now)

`lib/api/auth.ts` maintains a parallel `localStorage` session cache (`quizbuzz_super_admin_session`) alongside the real httpOnly-cookie session. It's not the cause of this bug, but it is a second source of truth that could drift from the server (e.g., if the cookie expires server-side but localStorage still holds a stale admin object, the UI would look logged-in until the next `/auth/me` refetch fails). Worth flagging for a future cleanup pass; out of scope here since the user asked to keep OTP-based auth as-is and not touch the auth model further this round.

---

## Summary of changes required

| File | Repo | Change |
|---|---|---|
| `backend/src/modules/onboarding/onboarding.validator.ts` | Quizbuzz-new | `planSlug: z.enum(["free"])` → `planSlug: z.string().min(1)` |
| `app/dashboard/layout.tsx` | quizbuzz-ops-next | Destructure `isLoading`, gate the redirect effect and early-return on it |

Both are one-line-class fixes. No schema migrations, no config changes, no dependency changes.
