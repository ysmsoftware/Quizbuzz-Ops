# Ops Dashboard Messaging System — Implementation Guide

**Status: implemented.** This doc originally proposed the design; the code described below has since been written into the repo (see the file list in each section). What's left is environment/infra setup only — `npm install`, a Prisma migration, and Redis/SMTP credentials — not further coding. Where this doc says "add" or "create," read it as "this file already exists; here's what it does and why."

**Goal:** give `quizbuzz-ops-next` its own SMTP (Nodemailer) + WhatsApp messaging capability for platform-admin-initiated notifications to organization admins — billing events, subscription status changes, payout account status changes, etc. — built as a **Redis + BullMQ queue** system, modeled on the main app's existing, already-working messaging module.

This is **not** a replacement for the main app's messaging system. The main app's `backend/src/modules/messaging/*` continues to own participant-facing comms (registration confirmations, contest reminders, results, certificates). This is a second, independent messaging system scoped to ops → organization-admin communication, living entirely inside `quizbuzz-ops-next` and its own database (`quizbuzz_ops`).

---

## 0. Channel policy: WhatsApp is fully built, but hidden

Every piece of WhatsApp infrastructure is implemented and functionally complete — `WhatsAppProvider`, the WhatsApp template catalog, the provider factory's `WHATSAPP` branch, the `OpsMessageChannel.WHATSAPP` enum value, the worker's ability to process a WhatsApp job. None of it is dead code, and none of it needs to be written later.

What's deliberately restricted is **who can ask for it**:

1. **The public "send message" API only accepts `EMAIL`.** `messaging.validator.ts`'s `SendMessageSchema` types `channel` as `z.literal('EMAIL')`, not `z.nativeEnum(OpsMessageChannel)`. A request body with `channel: "WHATSAPP"` fails validation before it reaches the service — so no UI built against this endpoint can ever offer a WhatsApp option, because the endpoint itself won't accept it. Enabling it later for admin-composed messages is a one-line change (swap the literal back to the native enum).
2. **Internal/system-triggered sends are gated by a config flag, not code.** Call sites like billing/subscription/payout events call `MessagingService.enqueueMessage()` directly with a typed `SendMessageInput`, bypassing the DTO above. As defense in depth, `enqueueMessage()` itself checks `messagingConfig.whatsapp.enabled` (backed by `WHATSAPP_MESSAGING_ENABLED`, **default `false`**) and rejects a `WHATSAPP` channel request with a clear error if the flag is off.

This is the Open/Closed principle applied literally: the messaging system is *open* for the WhatsApp channel to be extended/used, but *closed* against modification — turning it on is a config flip (`WHATSAPP_MESSAGING_ENABLED=true` + populate `WHATSAPP_API_URL`/`WHATSAPP_API_KEY` + relax the one Zod literal), not a coding project. It also mirrors the QuizBuzz engineering guideline's scaling philosophy: behavior changes should come from config, not code changes.

---

## 1. Why this shape — architecture comparison

| Problem | Main app's solution (copied here) |
|---|---|
| Don't block the request thread on an SMTP/WhatsApp API call | Producer writes a DB row (`status: QUEUED`) and enqueues a BullMQ job; a separate worker process does the actual send |
| Provider-agnostic send call | `MessageProviderFactory.getProvider(channel)` — Strategy/Factory pattern; callers never touch Nodemailer or the WhatsApp HTTP client directly |
| Content lives outside business logic | Per-channel template lookup tables map a `template` enum to subject/body (or campaign+params) builders — adding a template never touches the queue or worker code |
| Retries without corrupting state | BullMQ's own `attempts`/`backoff` retries the job; the repository's `updateStatus()` enforces a strict forward-only state machine |
| Env vars read before config is ready | Providers are instantiated **lazily** (first call via a singleton getter), not as top-level module constants |
| Workers must be independent (scaling rule) | The worker runs in its own Node process (`scripts/worker.ts`), started/scaled independently of `next start` |

| Layer | File(s) |
|---|---|
| Config | `server/config/env.ts` (schema additions), `server/config/messaging.config.ts` |
| Redis client | `server/lib/redis.ts` |
| Queue | `server/queues/message.queue.ts` |
| Provider contract | `server/providers/message-provider.interface.ts` |
| Providers | `server/providers/email.provider.ts`, `server/providers/whatsapp.provider.ts` |
| Provider factory | `server/providers/message-provider.factory.ts` |
| Templates | `server/templates/email.templates.ts`, `server/templates/whatsapp.templates.ts` |
| Feature module | `server/features/messaging/{messaging.types,messaging.validator,messaging.repository,messaging.service,messaging.controller}.ts` |
| DI wiring | `server/container.ts` (extended) |
| API routes | `app/api/v1/ops/messaging/{send,templates,retry-failed,[id],[id]/retry,organization/[orgId]}/route.ts` |
| Worker | `server/workers/message.worker.service.ts`, `server/workers/message.worker.ts`, `scripts/worker.ts` |
| Data model | `prisma/schema.prisma` — `OpsMessageChannel`, `OpsMessageStatus`, `OpsMessageTemplate` enums + `OpsMessageLog` model |

---

## 2. Data model (`prisma/schema.prisma`)

Ops's Prisma models never hold a Prisma-level relation to `Organization` — the organization lives in the *other* database (`quizbuzz`), accessed read-mostly via `queryMainDb`/raw `pg.Pool`. Every existing ops model that references an org (`OrganizationNote`, `OrganizationSuspension`, `OpsPayment`) just stores `organizationId: String` with no `@relation`. `OpsMessageLog` follows the same pattern:

```prisma
enum OpsMessageChannel {
  EMAIL
  WHATSAPP
}

enum OpsMessageStatus {
  QUEUED
  PROCESSING
  SENT
  DELIVERED
  FAILED
}

enum OpsMessageTemplate {
  BILLING_PAYMENT_SUCCESS
  BILLING_PAYMENT_FAILED
  SUBSCRIPTION_PAST_DUE
  SUBSCRIPTION_CANCELLED
  SUBSCRIPTION_PLAN_CHANGED
  PAYOUT_ACCOUNT_LINKED
  PAYOUT_ACCOUNT_STATUS_CHANGED
  ORG_SUSPENDED
  ORG_REACTIVATED
  CUSTOM
}

model OpsMessageLog {
  id             String             @id
  organizationId String
  channel        OpsMessageChannel
  template       OpsMessageTemplate
  recipient      String
  subject        String?
  params         Json?
  metadata       Json?
  status         OpsMessageStatus   @default(QUEUED)
  providerMsgId  String?
  sentAt         DateTime?
  deliveredAt    DateTime?
  failureReason  String?
  retryCount     Int                @default(0)
  attemptCount   Int                @default(1)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([organizationId])
  @@index([status, createdAt])
  @@index([template])
  @@map("ops_message_logs")
}
```

The `channel` enum includes `WHATSAPP` even though it's not reachable through the public API today — this is deliberate, so enabling WhatsApp later never requires another migration, only the config change described in §0.

IDs are generated app-side with the existing `generateUlid()` helper (`server/utils/ulid.ts`), matching every other ops model's convention — there is no `@default(ulid())` at the Prisma level.

**Remaining step (environment-specific, not code):** run `npx prisma migrate dev --name add_ops_messaging` against your local `quizbuzz_ops` database, then `npx prisma generate`. This sandbox's shell has no route to `binaries.prisma.sh` (confirmed: `prisma generate` here fails with `403 Forbidden` fetching the schema-engine binary), so this step could not be executed as part of writing this code and must be run locally.

---

## 3. Dependencies

Already added to `package.json` and installed in this environment (`bullmq`, `ioredis`, `nodemailer` confirmed present in `node_modules`; `tsx` and `@types/nodemailer` added as devDependencies):

```json
"dependencies": {
  "bullmq": "^5.34.4",
  "ioredis": "^5.4.2",
  "nodemailer": "^6.9.16"
},
"devDependencies": {
  "@types/nodemailer": "^6.4.17",
  "tsx": "^4.19.2"
}
```

New script:

```json
"worker": "tsx scripts/worker.ts"
```

Run `npm install` locally to sync your `package-lock.json` / local `node_modules` with these additions.

---

## 4. Config

`server/config/env.ts` gained:

```ts
WHATSAPP_API_URL: z.string().optional(),
WHATSAPP_API_KEY: z.string().optional(),
WHATSAPP_MESSAGING_ENABLED: z.coerce.boolean().default(false),
MESSAGE_QUEUE_PREFIX: z.string().default('ops'),
MESSAGE_QUEUE_RETRY_ATTEMPTS: z.coerce.number().default(3),
MESSAGE_QUEUE_BACKOFF_DELAY_MS: z.coerce.number().default(5000),
MESSAGE_WORKER_CONCURRENCY: z.coerce.number().default(10),
```

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` and `REDIS_URL` already existed in `env.ts` before this work but were unused anywhere in the codebase — they're now consumed by `server/config/messaging.config.ts`, `server/lib/redis.ts`, and `server/providers/email.provider.ts`.

`server/config/messaging.config.ts` is the single object every messaging file reads from — no file below reads `process.env` directly. `messagingConfig.whatsapp.enabled` is the flag described in §0.

**Remaining step:** populate `.env.local` with real `SMTP_*` and (when ready) `WHATSAPP_*` values. Nothing sends until these are set — `EmailProvider`'s `nodemailer.createTransport()` will simply fail auth against empty credentials.

---

## 5. Redis + Queue

`server/lib/redis.ts` — `ioredis` client with `maxRetriesPerRequest: null` (required by BullMQ's blocking commands) and a global-singleton guard so Next.js hot-reload in dev doesn't open a new connection per reload.

`server/queues/message.queue.ts` — one BullMQ `Queue` (`ops-message-queue`), `defaultJobOptions` sourced entirely from `messagingConfig.queue` (attempts, backoff, prefix).

---

## 6. Providers

`server/providers/message-provider.interface.ts` defines the channel-agnostic contract (`IMessageProvider.send(template, destination, params)`). Both `EmailProvider` and `WhatsAppProvider` implement it — this is the Dependency Inversion piece: the worker and factory depend on the interface, never on a concrete provider class.

`server/providers/email.provider.ts` — Nodemailer transporter, built **lazily inside the constructor** (not a module-level constant) so env vars are guaranteed loaded first, exposed via a `getEmailProvider()` singleton accessor.

`server/providers/whatsapp.provider.ts` — AiSensy-style REST call via `fetch`, same shape as the main app's `WhatsAppProvider`. Fully functional; simply not reachable through the normal send path per §0.

`server/providers/message-provider.factory.ts` — `MessageProviderFactory.getProvider(channel)`, a `switch` over `OpsMessageChannel` with an exhaustiveness check (`const _exhaustive: never = channel`) so adding a new channel to the Prisma enum without adding a factory case is a compile error, not a runtime surprise. The factory has **no knowledge of the WhatsApp policy** — it will happily construct a `WhatsAppProvider` if asked. That's intentional: the policy decision belongs in exactly one place (`MessagingService.enqueueMessage`), not scattered across every place a provider gets looked up.

---

## 7. Templates

`server/templates/email.templates.ts` and `server/templates/whatsapp.templates.ts` each export a `Record<OpsMessageTemplate, Builder>` covering all ten templates (billing success/failure, subscription past-due/cancelled/plan-changed, payout linked/status-changed, org suspended/reactivated, custom). Adding an eleventh template means adding one entry to each map — no other file changes.

---

## 8. Feature module (`server/features/messaging/`)

- **`messaging.types.ts`** — `SendMessageInput`, `MessageLogResult`, `PaginatedMessagesResult` DTOs.
- **`messaging.validator.ts`** — `SendMessageSchema` (the `channel: z.literal('EMAIL')` restriction from §0 lives here), `PaginationQuerySchema`.
- **`messaging.repository.ts`** — DB access only, `IMessagingRepository` interface + `MessagingRepository` implementation. Owns the forward-only status state machine (`QUEUED → PROCESSING → SENT/DELIVERED`, `FAILED → QUEUED` allowed as an explicit retry, same-state writes treated as a no-op for stalled-job redelivery) — copied faithfully from the main app's `messaging.repository.ts`.
- **`messaging.service.ts`** — `IMessagingService` interface + `MessagingService` implementation. Owns `enqueueMessage`, `retryMessage`, `retryFailedMessages`, and the WhatsApp gate from §0. Constructor takes `IMessagingRepository` (defaulted to `new MessagingRepository()`), matching this repo's established default-parameter DI pattern (see `PayoutsService`, `PlatformAuthController`).
- **`messaging.controller.ts`** — thin HTTP layer: `getSessionAdmin()`/role guard, Zod parse, delegate to service, `okResponse()`. Manual sends and retries also write a `PlatformAuditLog` entry (`org.message_sent` / `org.message_retried`, `AuditTargetType.ORGANIZATION`) via the existing `writeAuditLogEntry()` helper — consistent with how `payouts.service.ts` audits `attachLinkedAccount`/`updatePayoutStatus`.

---

## 9. Wiring (`server/container.ts`)

Extended with the same three-block pattern (repository → service → controller) used for every other feature:

```ts
export const messagingRepository = new MessagingRepository();
export const messagingService = new MessagingService(messagingRepository);
export const messagingController = new MessagingController(messagingService);
```

---

## 10. API routes

```
POST /api/v1/ops/messaging/send                       — compose & send (EMAIL only, see §0)
GET  /api/v1/ops/messaging/templates                   — template catalog, for a future compose UI
GET  /api/v1/ops/messaging/:id                          — message detail
POST /api/v1/ops/messaging/:id/retry                     — retry one FAILED message
POST /api/v1/ops/messaging/retry-failed?organizationId=  — retry all FAILED messages for an org
GET  /api/v1/ops/messaging/organization/:orgId          — message history for one org
```

All routes follow the existing `route.ts` convention exactly: `export const runtime = 'nodejs'`, delegate straight to `server/container.ts`'s controller instance, catch into `handleRouteError()`.

---

## 11. Worker & deployment

`server/workers/message.worker.service.ts` — pure processing logic (destination resolution isn't needed here since `recipient` is already resolved at enqueue time, unlike the main app which resolves from a `Contact` relation): loads the log, skips if already `SENT`, resolves the provider via the factory, transitions `PROCESSING → SENT` on success or increments the attempt count and flips to `FAILED` after 3 attempts on failure, rethrows so BullMQ's own retry/backoff still applies. Deliberately talks to the repository directly rather than through `MessagingService`, to avoid a service ↔ worker circular dependency.

`server/workers/message.worker.ts` — the BullMQ `Worker` wrapper (`concurrency` from `messagingConfig.queue.workerConcurrency`).

`scripts/worker.ts` — the standalone process entrypoint.

**The one real structural difference from the main app:** the main app's Express server and its BullMQ worker are already two separate processes. `quizbuzz-ops-next`'s only production process today is `next start -p 3010`, and a BullMQ `Worker` needs a long-lived, blocking connection — that doesn't fit inside a request-scoped API route handler. So the worker must run as a **second, independent process**:

```
pm2 start "npm run start"  --name ops-web
pm2 start "npm run worker" --name ops-worker
```

Scaling from there is config-only: raise `MESSAGE_WORKER_CONCURRENCY` and/or the `ops-worker` PM2 instance count, no code changes — same contract as the main app's queue system.

---

## 12. Integration points — wire these in next

The module works end-to-end but nothing calls it yet. This is the natural next step, not part of this pass:

- **`server/features/billing/billing.service.ts`** — on payment success/failure, call `messagingService.enqueueMessage({ organizationId, template: 'BILLING_PAYMENT_SUCCESS' | 'BILLING_PAYMENT_FAILED', recipient: adminEmail, params: {...} })`.
- **`server/features/subscriptions/subscriptions.service.ts`** — on transition to `PAST_DUE`/`CANCELLED`.
- **`server/features/payouts/payouts.service.ts`** — `attachLinkedAccount()` and `updatePayoutStatus()` (which already call `writeAuditLogEntry`) should each also call `enqueueMessage()` right next to that audit-log call.

---

## 13. Testing checklist

1. `npm install` (sync lockfile) → `npx prisma migrate dev --name add_ops_messaging` → `npx prisma generate` — all three must be run locally; none could be executed from this environment (no network route to `binaries.prisma.sh`).
2. `npm run worker` starts and logs `[ops-message-worker] ready` (confirms `REDIS_URL` connectivity).
3. `POST /api/v1/ops/messaging/send` with `channel: "WHATSAPP"` in the body → expect a 400 validation error (confirms §0's DTO restriction is actually enforced, not just documented).
4. `POST /api/v1/ops/messaging/send` with `channel` omitted (defaults to `EMAIL`) and a real address → row moves `QUEUED → PROCESSING → SENT`, email arrives.
5. Call `messagingService.enqueueMessage({ ..., channel: 'WHATSAPP' })` directly (e.g. from a scratch script) with `WHATSAPP_MESSAGING_ENABLED` unset → expect the service to throw "WhatsApp channel is not yet enabled." Then set the flag to `true` and confirm the same call succeeds and reaches `WhatsAppProvider.send()` — this proves the hidden channel is real, working code, not a stub.
6. Force an SMTP auth failure (bad password) → confirm the row reaches `FAILED` only after 3 attempts, `failureReason` is populated, and `POST /retry-failed` re-queues it.
7. Wire one real call site (payout status change is the smallest) and confirm end-to-end: admin action → audit log entry AND a queued message → worker sends it → `OpsMessageLog` row shows `SENT`.
