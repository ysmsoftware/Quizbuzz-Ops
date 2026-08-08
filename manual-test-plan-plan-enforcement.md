# Manual Test Plan — Plan Limit Enforcement (Phases 1–4)

Covers everything built so far: middleware enforcement + usage logging (Phase 1), additive/absolute overrides (Phase 2), real usage numbers in ops-next (Phase 3), and main-app error/usage UX (Phase 4). Phase 5 (ops-next-triggered emails + cross-app banner) isn't built yet, so it's not in here.

Test as two people (or two browser sessions): an **Organization Owner** in the main app, and a **Platform Admin** in `quizbuzz-ops-next`. Most test cases need both — you'll change something as the admin, then verify it as the owner, or vice versa.

## Before you start: set up a org you can actually hit limits on

Hitting real limits by creating 50 contests would take forever. Instead, put one test organization on tight limits so you can trigger blocks in a couple of clicks:

1. In ops-next, open the test org's **Subscription** tab.
2. Either assign it a plan with small limits, or leave whatever plan it has and add an override to shrink one field temporarily (e.g. set `maxContestsPerCycle` to an absolute `1`). An override doesn't need to only raise things — the same mechanism can lower them for testing purposes.
3. Keep a second, normal/unrestricted org around too, so you have a "should just work" baseline to compare against.

Have the org's Settings → Plan & Billing tab (main app) and its Subscription tab (ops-next) open side by side where possible — you'll be cross-checking numbers between them constantly.

---

## Section A — Main app, as the Organization Owner

### A1. Contest creation — the per-cycle limit

**Setup:** test org's effective `maxContestsPerCycle` is small (e.g. 1 or 2).

| Step | Action | Expected result |
|---|---|---|
| 1 | Create contests up to (not over) the limit | Each one succeeds normally |
| 2 | Try to create one more, past the limit | Request is blocked. You should see a toast/banner with a clear message like *"Your plan allows a maximum of N contest(s) per billing cycle. Upgrade your plan to create more."* — not a generic error, not a blank screen, not a raw "Internal Server Error" |
| 3 | Toast has an **Upgrade Plan** button | Clicking it takes you to Settings → Plan & Billing (the tab should open directly, no extra navigation needed) |

**Red flags:** a 500 page, a console-only error with nothing shown on screen, the contest silently not appearing with no explanation, or the toast showing generic text with no number/limit mentioned.

### A2. Per-contest participant cap vs. the plan

**Setup:** note the plan's effective `maxParticipantsPerContest`.

| Step | Action | Expected result |
|---|---|---|
| 1 | Create or edit a contest, set its own "max participants" field to a number **within** the plan limit | Succeeds |
| 2 | Set it to a number **above** the plan limit | Blocked with a message referencing `participantsPerContest` and the actual limit |
| 3 | Leave the contest's own "max participants" field **empty/unset** (no self-imposed cap) and register participants one by one up to the plan's limit, then try one more | The registration itself should be blocked once you hit the plan ceiling, even though the contest had no explicit cap set (this is the backstop check) |

### A3. Registration flow (public-facing, no login)

**Setup:** a published contest belonging to the constrained test org, at or near its participant limit.

| Step | Action | Expected result |
|---|---|---|
| 1 | Register a participant while under the limit | Succeeds, normal confirmation |
| 2 | Register one more once the contest is at its limit | Registration form shows a clear "contest is full" / limit-reached message — this is a **public** page, so double check it doesn't leak an internal error or stack trace to an anonymous visitor |

### A4. Questions per contest

**Setup:** note effective `maxQuestionsPerContest`.

| Step | Action | Expected result |
|---|---|---|
| 1 | Assign questions to a contest up to the limit | Succeeds |
| 2 | Try to assign more past the limit (single assign, and via bulk-assign if you use it) | Blocked, toast references `questionsPerContest` |
| 3 | Try "Auto-generate questions" requesting a count that would push the contest over the limit | Blocked *before* it starts generating — you shouldn't see it partially add questions and then fail partway |

### A5. Org member invites

**Setup:** note effective `maxOrgMembers`.

| Step | Action | Expected result |
|---|---|---|
| 1 | Invite members up to the limit | Each invite succeeds, invite email goes out |
| 2 | Invite one more past the limit | Blocked, toast references `orgMembers` |
| 3 | **Edge case:** re-send/reissue an invite to someone who already has a pending invite (not yet accepted), while already at the member limit | This should **succeed** — reissuing a pending invite doesn't create a new member, so it must not be blocked by the limit. If this gets blocked, that's a bug. |

### A6. Usage bars (Settings → Plan & Billing)

| Step | Action | Expected result |
|---|---|---|
| 1 | Open Settings → Plan & Billing on the constrained test org | A "Usage this cycle" section shows four bars: quizzes, participants (fullest quiz), questions (fullest quiz), team members |
| 2 | Compare the numbers shown to what you actually created in A1–A5 | Numbers should match reality, not be stuck at 0 or stale |
| 3 | Push a bar close to/at its limit | Bar turns amber near ~75%, red at 100% |
| 4 | Check the "resets in X days" text | Should roughly match the org's actual billing period end date (cross-check against ops-next's subscription period end) |

### A7. General negative-testing checklist for the main app

Go through A1–A5 again but specifically watching for these failure signs — if you see any of these, something's broken:
- A raw HTTP status code or JSON blob shown directly on screen.
- A generic "Something went wrong" with no specifics and no Upgrade button.
- The action actually going through anyway (data got created despite being over the limit) — this is the worst-case bug, it means enforcement isn't really blocking.
- The toast appearing but the Upgrade button doing nothing, or landing on the wrong page/tab.

---

## Section B — ops-next, as the Platform Admin

### B1. Viewing current effective limits

| Step | Action | Expected result |
|---|---|---|
| 1 | Open the test org's Subscription tab | Shows current plan, its base limits, and a quota/usage grid |
| 2 | With no overrides active, effective value should equal the plan's base value | e.g. if the plan says 2 contests/cycle and there's no override, the grid shows 2, not overridden |

### B2. Additive override ("+1" behavior)

This is the core new behavior — confirm it actually adds rather than replaces.

| Step | Action | Expected result |
|---|---|---|
| 1 | Note the current effective value for `maxContestsPerCycle` (say it's 2) | — |
| 2 | Click "Add Custom Override" → select the field → choose **"Add to current limit"** (should be the default) → enter `1` → enter a reason (required — try submitting with it blank first, should be rejected) | Live preview should show "Current: 2 → New: 3" before you even submit |
| 3 | Submit | Override appears in the table as `+1`. The quota grid's effective value updates to 3 |
| 4 | Switch to the main app (as owner) and check Settings → Plan & Billing, or just try creating a 3rd contest | The main app should now allow 3 contests this cycle, not still be capped at 2 — this confirms the sync from ops-next to the main app actually happened |

### B3. Absolute override ("set exact") behavior

| Step | Action | Expected result |
|---|---|---|
| 1 | Add another override on a **different** field, this time choosing **"Set exact limit to"**, entering e.g. `10` | Preview shows "Current: X → New: 10" regardless of what X was |
| 2 | Submit and confirm the effective value is now exactly 10, not X+10 | Confirms absolute mode replaces rather than stacks |

### B4. Stacking multiple additive overrides

| Step | Action | Expected result |
|---|---|---|
| 1 | On a field that already has one active `+1` additive override, add a second additive override of `+1` with a different reason | Effective value should now be base + 2 (both stack) |
| 2 | Check the overrides table | Both rows should be visible, each with its own reason, each showing `+1` |

### B5. Unlimited override

| Step | Action | Expected result |
|---|---|---|
| 1 | Add an override and check "Unlimited Quota" instead of entering a number | Submits successfully — this previously had a latent bug where "Unlimited" silently stored an invalid number instead of actually being unlimited, so specifically confirm the effective value now shows "Unlimited" / ∞, not some garbage number or a save error |

### B6. Revoking an override

| Step | Action | Expected result |
|---|---|---|
| 1 | Revoke one of the overrides you added above (with a reason) | Effective value drops back down to reflect only the remaining active overrides |
| 2 | Check the main app again | The tighter (or looser) limit should be reflected there too — same sync check as B2 step 4 |

### B7. Expiring overrides

| Step | Action | Expected result |
|---|---|---|
| 1 | Add an override with an expiration date a few minutes in the future | Shows as active immediately |
| 2 | Wait for it to pass, then refresh the subscription tab and check the main app | Once expired, it should no longer count toward the effective limit — the value should fall back to what it'd be without that override, without you having to manually revoke it |

### B8. Usage numbers accuracy (the fixed dashboard metrics)

| Step | Action | Expected result |
|---|---|---|
| 1 | As the owner, create a known number of contests this cycle (say, 2), and create one contest with a known participant count and a known question count | — |
| 2 | As the admin, check the org's quota/usage grid in ops-next | "Quizzes per Period" used-count should show exactly 2 (contests created *this billing cycle only* — if you have older contests from a previous cycle, they must **not** be counted here) |
| 3 | Check the participants/questions usage numbers | Should reflect the single fullest contest's counts, not a sum across every contest the org has ever run |

---

## Section C — Cross-system sanity checks

These catch the "it works on one side but the two systems disagree" class of bug.

| Check | How | Expected |
|---|---|---|
| Sync latency | Immediately after adding/revoking an override in ops-next, check the main app without waiting | Should reflect the change right away (sync happens synchronously on override add/remove, not on a delay) |
| No override still enforces correctly | Pick an org with zero overrides | Its behavior should exactly match its plan's base limits — no phantom overrides, no drift |
| Blocked-but-should-be-allowed | If something gets blocked that you believe should be allowed given the current effective limits shown in ops-next | This is a real bug — note the exact numbers shown in both places and flag it |

---

## What "correct" looks like, in one paragraph

Right case (under the limit): the action just succeeds, same as before any of this was built — no visible change in experience. Wrong case (over the limit): the action never happens (no partial creation, no silent success), the user sees a specific, human-readable message naming which limit and what the number is, there's an Upgrade Plan button that goes somewhere useful, and nothing resembling a raw error code, stack trace, or blank/broken page ever reaches the screen. If you see the action succeed when it should've been blocked, that's the most serious class of bug — flag it first.
