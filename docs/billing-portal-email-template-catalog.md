# Subscription/Billing Email Template Catalog

Status: **List only, nothing built.** Covers every org-facing email needed across the subscription lifecycle audited and partly implemented in this repo (`docs/billing-portal-lifecycle-implementation-plan.md`). Grounded in what already exists: `server/templates/email.templates.ts` (the builder functions), the `OpsMessageTemplate` Prisma enum, and `MessagingService.enqueueMessage()` (queue → `message.worker.ts` → `email.provider.ts`).

**Important architectural fact that shapes several templates below**: this system has no auto-renewal. The checkout page says so explicitly ("This is a one-time charge for the selected period — no auto-renewal. You'll need to return here to renew when the period ends."). So there's no card-on-file, no "your card will be charged automatically" template — "renewal" emails here are all *reminders to come back and manually pay again*, not billing-attempt notices. Also, there's no trial concept anywhere in the schema (no `trialDays`, no `TRIALING` status) — trial-related templates are intentionally not in this list; add them only if trials become a real feature later.

One more fact worth knowing before reading the list: **most of the templates below already exist as defined email builders but are never actually triggered by any code path.** `enqueueMessage()` — the only way an email actually gets sent through this pipeline — is currently called from exactly one place in the whole repo: the generic manual-send admin endpoint (`messaging.controller.ts`). None of `subscriptions.service.ts`, the Razorpay webhook, or the reconciliation job call it. This was already flagged in `plan-enforcement-full-system-plan.md` (line 158) as a known gap. So for each template below I've marked whether it (a) exists and is wired, (b) exists but nothing calls it, or (c) doesn't exist yet at all — including whether the *underlying action* it would announce even has a working code path yet, since a few don't.

---

## 1. Purchase & payment

| Template | Trigger | Recipient | Status |
|---|---|---|---|
| **`BILLING_PAYMENT_SUCCESS`** | Razorpay webhook `payment.captured`, after `assignPlan()` succeeds — covers both a brand-new first purchase and a renewal/upgrade payment. | Org admin (the one who checked out) | Builder exists (`email.templates.ts:17`), enum value exists. Not called anywhere — `razorpay/webhook/route.ts` never invokes `enqueueMessage`. |
| **`BILLING_PAYMENT_FAILED`** | Razorpay webhook `payment.failed`. | Org admin | Builder exists (`email.templates.ts:25`). Not wired — same webhook route, `payment.failed` branch never sends anything today. |
| **`BILLING_REFUND_PROCESSED`** | Whenever an `OpsPayment.status` moves to `REFUNDED` (that enum value exists; nothing sets it yet — no refund action exists in the codebase at all). | Org admin | Doesn't exist. Lowest priority of this group since the refund *action* itself isn't built yet either — build the refund flow first, template second. |
| **`BILLING_RECEIPT`** *(optional, decide if distinct from PAYMENT_SUCCESS)* | Same trigger as `BILLING_PAYMENT_SUCCESS`, but a formatted receipt (base amount, credit applied, gateway fee, GST, total — the exact breakdown `OpsPayment` now stores per-payment) rather than a short confirmation note. | Org admin | Doesn't exist. Open question below (§4) on whether to merge this into `BILLING_PAYMENT_SUCCESS` or keep separate. |

## 2. Renewal & expiry (no auto-renewal — these are all "come back and pay" reminders)

| Template | Trigger | Recipient | Status |
|---|---|---|---|
| **`SUBSCRIPTION_RENEWAL_REMINDER`** | New scheduled check: `currentPeriodEnd` within N days (e.g. 7 and 1 day out — two separate sends at different urgency, or one template parameterized by `daysRemaining`). Nothing in the codebase currently looks *forward* from now to a future expiry — only the reconciliation job's new expiry check (Phase C in the lifecycle plan) looks *backward* at already-lapsed periods. | Org admin | Doesn't exist — needs both the template and a new scheduled check (extend `subscription-reconciliation.job.ts` or add a sibling cron job). |
| **`SUBSCRIPTION_EXPIRED`** | The reconciliation job's expiry step (`server/jobs/subscription-reconciliation.job.ts`, the part just added in the lifecycle work) — currently only writes an audit log entry (`subscription.expired`), never emails the org. | Org admin | Doesn't exist. This is a direct, immediate follow-up to the expiry-enforcement work already shipped — the status transition exists, the notification doesn't. |
| **`SUBSCRIPTION_PAST_DUE`** | Would fire if a subscription's status ever became `PAST_DUE`. | Org admin | Builder exists (`email.templates.ts:34`), enum value exists (`SubscriptionStatus.PAST_DUE`) — but nothing in the entire codebase ever sets a subscription to `PAST_DUE`. Given there's no auto-renewal/card-on-file, it's not obvious what would ever trigger this state under the current model. Recommend treating this as dead/aspirational unless a specific "we tried to charge and it failed but haven't given up yet" flow gets designed — otherwise `SUBSCRIPTION_EXPIRED` already covers "period lapsed." |

## 3. Account status

| Template | Trigger | Recipient | Status |
|---|---|---|---|
| **`ORG_SUSPENDED`** | An ops admin suspending an organization. | Org admin(s) | Builder exists (`email.templates.ts:70`), enum value exists — but there is no suspend action anywhere in `organizations.service.ts` at all yet (deeper gap than "email not wired": the underlying admin capability itself isn't built). |
| **`ORG_REACTIVATED`** | An ops admin reactivating a suspended organization. | Org admin(s) | Same situation — builder and enum exist (`email.templates.ts:78`), no underlying reactivate action exists yet. |
| **`SUBSCRIPTION_CANCELLED`** | An explicit cancel action (org-initiated or ops-initiated) — distinct from `SUBSCRIPTION_EXPIRED` (passive lapse). | Org admin | Builder exists (`email.templates.ts:41`), and `OrganizationSubscription.cancelledAt` exists in the schema — but nothing anywhere ever writes to `cancelledAt`. No cancel endpoint exists yet. |

## 4. Add-ons / limit changes (the "your quota went up" emails you asked for)

| Template | Trigger | Recipient | Status |
|---|---|---|---|
| **`SUBSCRIPTION_LIMIT_INCREASED`** *(maps to `addOverride()`)* | `subscriptions.service.ts#addOverride()` — an ops admin grants a manual override (e.g. "+50 participants per contest" or a feature flag turned on) on top of the org's plan. | Org admin | Doesn't exist yet, but already scoped in `plan-enforcement-full-system-plan.md` (§Phase 5, line 158) as a known next step — this catalog entry confirms and names it. Needs the template plus an `enqueueMessage()` call added right after `addOverride()`'s existing `writeAuditLogEntry`. |
| **`SUBSCRIPTION_LIMIT_DECREASED`** *(maps to `removeOverride()`)* | `subscriptions.service.ts#removeOverride()` — an override expires (via the existing override-expiry cron) or is manually revoked. Tells the org their temporary boost ended, not just that it was granted. | Org admin | Doesn't exist. The "granted" half is planned per above; the "revoked" half isn't mentioned anywhere yet — worth building both together since they're the same event pair. |
| **`SUBSCRIPTION_PLAN_CHANGED`** | `subscriptions.service.ts#changePlan()` (ops-admin-triggered plan swap) — separate from a paid upgrade, which is really just `BILLING_PAYMENT_SUCCESS` since it went through checkout. | Org admin | Builder exists (`email.templates.ts:48`). Not wired — also called out in the same `plan-enforcement-full-system-plan.md` line as the overrides above. |

## 5. Internal / ops-facing (different audience — not the organization)

| Template | Trigger | Recipient | Status |
|---|---|---|---|
| **Cache-sync-failure alert** | `subscription.cache_sync_failed` audit entries (written both from `assignPlan()` and the reconciliation job, added in the lifecycle work) — currently visible only by manually checking the audit log UI. | Platform/ops team, not the org | Doesn't exist as an email at all. If repeated failures should actively page someone instead of waiting for a human to browse the audit log, this needs its own channel — doesn't belong in `OpsMessageTemplate`/`email.templates.ts` at all, since those are exclusively for `organizationId`-scoped, org-facing mail (confirmed by the schema comment on `PLATFORM_ADMIN_OTP` explaining why *that* template had to work around the same constraint). A Slack webhook or a separate ops-alert email list is the right shape here, not a new org template. |

---

## 3.1 Recipient resolution — a shared prerequisite, not yet built

Every template above needs to resolve "who is the org admin" from an `organizationId`. `plan-enforcement-full-system-plan.md` already flags this exact gap (`findOrgOwnerContact()` doesn't exist yet) and raises an open question worth deciding before building any of the above: does a billing/lifecycle email go to the org's OWNER only, or to every active admin/member on the org? The existing pattern in `order/route.ts`/`session/route.ts` (which already carry `adminEmail`/`adminName` on the handoff token for the person who initiated checkout) only covers the checkout-time actor — it doesn't help for events triggered by an ops admin days later (suspend, override, expiry), where there's no "current request's admin" to read from. This resolver is a one-time build that every template in sections 1–4 depends on.

---

## Suggested build order

1. **Recipient resolution** (§3.1) — blocks everything else.
2. **`BILLING_PAYMENT_SUCCESS` / `BILLING_PAYMENT_FAILED`** — wire the two templates that already exist into the webhook route. Zero new templates, just the missing `enqueueMessage()` calls plus recipient resolution.
3. **`SUBSCRIPTION_EXPIRED`** — direct, small follow-up to the expiry-enforcement work already shipped; the trigger point already exists in `subscription-reconciliation.job.ts`.
4. **`SUBSCRIPTION_LIMIT_INCREASED` / `SUBSCRIPTION_LIMIT_DECREASED`** — matches what `plan-enforcement-full-system-plan.md` already scoped; do these together since they're a pair.
5. **`SUBSCRIPTION_RENEWAL_REMINDER`** — needs a new forward-looking scheduled check, not just a template; more work than the others.
6. **`SUBSCRIPTION_PLAN_CHANGED`** — wire the existing template into `changePlan()`.
7. **`ORG_SUSPENDED` / `ORG_REACTIVATED` / `SUBSCRIPTION_CANCELLED`** — lowest priority as *emails*, since the underlying admin actions (suspend/reactivate/cancel) don't exist yet either; building the actions themselves is the real prerequisite work here, not the templates.
8. **`BILLING_REFUND_PROCESSED`** — same situation as above; no refund action exists yet.
9. **Cache-sync-failure alerting** (§5) — separate infrastructure decision (Slack vs. ops email list), not blocked by anything above.
10. **`SUBSCRIPTION_PAST_DUE`** — hold; unclear what would ever trigger it under the current no-auto-renewal model. Revisit only if a specific new flow needs it.

## Open decisions before building

1. **Receipt vs. confirmation** — does `BILLING_PAYMENT_SUCCESS` get the full itemized breakdown (base, credit applied, gateway fee, GST, total) inline, or does that need its own `BILLING_RECEIPT` template? Recommend folding it into `BILLING_PAYMENT_SUCCESS` — one send per payment, not two.
2. **Recipient scope** — org OWNER only, or every active admin/member? (Same open question already on record in `plan-enforcement-full-system-plan.md`.)
3. **Renewal reminder cadence** — how many days out, and how many separate reminders (e.g. 7-day + 1-day) vs. one template reused with a `daysRemaining` param?
4. **Channel** — email only, or should any of these also go out over WhatsApp (the provider/queue infrastructure already supports it, gated by `WHATSAPP_MESSAGING_ENABLED`, currently off)? Recommend starting email-only and revisiting per-template if WhatsApp gets turned on generally.

Nothing in this catalog has been implemented. Let me know which templates (and which order) to build.
