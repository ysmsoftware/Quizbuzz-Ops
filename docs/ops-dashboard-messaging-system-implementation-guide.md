# Ops Dashboard Messaging System — Implementation Guide

**Goal:** give `quizbuzz-ops-next` its own SMTP (Nodemailer) + WhatsApp messaging capability for platform-admin-initiated notifications to organization admins — billing events, subscription status changes, payout account status changes, etc. — built as a **Redis + BullMQ queue** system, deliberately modeled on the main app's existing, already-working messaging module.

This is **not** a replacement for the main app's messaging system. The main app's `backend/src/modules/messaging/*` continues to own participant-facing comms (registration confirmations, contest reminders, results, certificates). This guide adds a second, independent messaging system scoped to ops → organization-admin communication, living entirely inside `quizbuzz-ops-next` and its own database (`quizbuzz_ops`). Per the QuizBuzz engineering guideline ("every system must be extractable into microservice, independently deployable, loosely coupled"), these two messaging systems should stay decoupled rather than sharing a queue or a database.

---

## 1. Why copy the main app's architecture specifically

The main app's messaging module (`backend/src/modules/messaging/`, `backend/src/providers/{email,whatsapp,message}.provider.ts`, `backend/src/queues/index.ts`, `backend/src/workers/message.worker*.ts`) already solves the hard problems correctly:

| Problem | How the main app solves it |
|---|---|
| Don't block the request thread on an SMTP/WhatsApp API call | Producer writes a DB row (`status: QUEUED`) and enqueues a job; a separate worker process does the actual send |
| Provider-agnostic send call | `MessageProvider.getProvider(channel)` — Strategy/Factory pattern; callers never touch Nodemailer or the WhatsApp HTTP client directly |
| Content lives outside business logic | `MessageTemplateResolver` maps a `template` enum to subject/body builders — adding a template never touches the queue or worker code |
| Retries without corrupting state | BullMQ's own `attempts`/`backoff` retries the job; the repository's `updateStatus()` enforces a strict forward-only state machine (`QUEUED → PROCESSING → SENT/FAILED`, with `FAILED → QUEUED` allowed only as an explicit retry) |
| Env vars read before `dotenv.config()` runs | Providers are instantiated **lazily** (first call), not as top-level module constants — this bit the main app once already (535 SMTP auth errors on the VPS) |
| Workers must be independent (scaling rule) | The worker runs in its own Node process (`backend/src/worker.ts`), imports the same DI container, and is started/scaled independently of the API server |

Everything below reproduces this same shape, adapted for `quizbuzz-ops-next`'s Next.js App Router + `server/features/*` conventions.

---

## 2. Architecture comparison

| Layer | Main app (`Quizbuzz-new`) | Ops dashboard (`quizbuzz-ops-next`) — to build |
|---|---|---|
| API surface | Express routes → controller → service | Next.js route handlers (`app/api/v1/ops/messaging/*/route.ts`) → controller → service, via `server/container.ts` |
| DB | `MessageLog` model in the `quizbuzz` (main) DB, Prisma | New `OpsMessageLog` model in the `quizbuzz_ops` DB, Prisma (`prisma/schema.prisma` in ops-next) |
| Queue | BullMQ `Queue` in `backend/src/queues/index.ts`, backed by `ioredis` at `config.redis.*` | New BullMQ `Queue` in `server/queues/message.queue.ts`, backed by `ioredis` at `env.REDIS_URL` |
| Providers | `providers/email.provider.ts` (Nodemailer), `providers/whatsapp.provider.ts` (AiSensy REST) | Same two providers, ported into `server/providers/` |
| Templates | `templates/message-template-resolver.ts` + `email.templates.ts` + `whatsapp.templates.ts` | Same shape, ops-specific templates |
| Worker process | `backend/src/worker.ts` — dedicated Node entrypoint, separate from the Express API process | New `scripts/worker.ts` — dedicated Node entrypoint, separate from the `next start` process (see §9 — this is the one place the two repos structurally differ, because Next.js has no long-running "server process" of its own beyond `next start`) |
| DI | `container.ts` | `server/container.ts` (already exists — extend it) |

---

## 3. Prisma schema additions (`quizbuzz-ops-next/prisma/schema.prisma`)

Ops's Prisma models never hold a Prisma-level relation to `Organization` — the organization lives in the *other* database (`quizbuzz`, accessed read-mostly via `queryMainDb`/raw `pg.Pool`). Every existing ops model that needs to reference an org (e.g. `OrganizationNote`, `OrganizationSuspension`, `OpsPayment`) just stores `organizationId: String` with no `@relation`. Follow that same pattern here.

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
  recipient      String             // email address or E.164 phone
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

Run `npx prisma migrate dev --name add_ops_messaging` locally (the sandbox this guide was written in has no network access to Prisma's binary mirror, so this migration must be generated and applied on your machine, same as the earlier payout migration).

IDs are generated app-side with the existing `generateUlid()` helper (`server/utils/ulid.ts`) — do **not** add `@default(ulid())` at the Prisma level; every other ops model follows the app-generates-the-id convention (see `audit-writer.ts`'s `id: generateUlid()`).

---

## 4. Dependencies to add

`quizbuzz-ops-next/package.json` currently has **no** `ioredis`, `bullmq`, or `nodemailer` — these need adding:

```bash
npm install ioredis bullmq nodemailer
npm install -D @types/nodemailer
```

Also add a `worker` script (see §9):

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start -p 3010",
  "worker": "tsx scripts/worker.ts",
  "lint": "next lint",
  "db:seed": "node prisma/seed.js"
}
```

(`tsx` needs adding as a devDependency too — `npm install -D tsx` — for running the TypeScript worker entrypoint directly, matching how the main app can run workers without a separate build step in dev.)

---

## 5. Config (extend `server/config/env.ts`)

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` already exist in `env.ts` (lines 21-25) but are currently unused anywhere in the codebase. `REDIS_URL` also already exists (line 8) and is likewise unused. Add the WhatsApp and queue-tuning vars alongside them:

```ts
// server/config/env.ts — additions to envSchema
WHATSAPP_API_URL: z.string().optional(),
WHATSAPP_API_KEY: z.string().optional(),
MESSAGE_QUEUE_PREFIX: z.string().default('ops'),
MESSAGE_QUEUE_RETRY_ATTEMPTS: z.coerce.number().default(3),
MESSAGE_QUEUE_BACKOFF_DELAY_MS: z.coerce.number().default(5000),
```

Create `server/config/messaging.config.ts` (mirrors the main app's `config.messaging.*` namespace so the two codebases read the same way):

```ts
import { env } from './env';

export const messagingConfig = {
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM ?? env.SMTP_USER,
  },
  whatsapp: {
    url: env.WHATSAPP_API_URL,
    apiKey: env.WHATSAPP_API_KEY,
  },
  queue: {
    prefix: env.MESSAGE_QUEUE_PREFIX,
    retryAttempts: env.MESSAGE_QUEUE_RETRY_ATTEMPTS,
    backoff: { type: 'exponential' as const, delay: env.MESSAGE_QUEUE_BACKOFF_DELAY_MS },
  },
};
```

---

## 6. Redis client (`server/lib/redis.ts`)

```ts
import Redis from 'ioredis';
import { env } from '../config/env';

// maxRetriesPerRequest: null is required by BullMQ — without it, BullMQ's
// blocking commands (used internally for job polling) will throw after
// ioredis's default retry limit instead of blocking indefinitely.
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('[redis] connected'));
redis.on('error', (err) => console.error('[redis] error', err));
```

---

## 7. Queue (`server/queues/message.queue.ts`)

```ts
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { messagingConfig } from '../config/messaging.config';

export const messageQueue = new Queue('ops-message-queue', {
  connection: redis,
  prefix: messagingConfig.queue.prefix,
  defaultJobOptions: {
    attempts: messagingConfig.queue.retryAttempts,
    backoff: messagingConfig.queue.backoff,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  },
});
```

---

## 8. Providers (`server/providers/`)

### `email.provider.ts` — direct port of the main app's pattern

```ts
import nodemailer from 'nodemailer';
import { messagingConfig } from '../config/messaging.config';
import { OpsMessageTemplate } from '@prisma/client';
import { getEmailTemplate } from '../templates/email.templates';

export interface IEmailProvider {
  send(template: OpsMessageTemplate, destination: string, params: Record<string, any>): Promise<any>;
}

export class EmailProvider implements IEmailProvider {
  private transporter: nodemailer.Transporter;

  // Built lazily in the constructor (not as a module-level constant) so env
  // vars are guaranteed to be loaded first — the main app hit real 535 auth
  // failures on its VPS from doing this at module-load time. Same risk here.
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: messagingConfig.smtp.host,
      port: messagingConfig.smtp.port,
      secure: messagingConfig.smtp.port === 465,
      auth: { user: messagingConfig.smtp.user, pass: messagingConfig.smtp.pass },
    });
  }

  async send(template: OpsMessageTemplate, destination: string, params: Record<string, any>) {
    if (!destination) throw new Error('Destination is required');
    const { subject, html } = getEmailTemplate(template, params);
    return this.transporter.sendMail({
      from: messagingConfig.smtp.from,
      to: destination,
      subject,
      html,
    });
  }
}

let _emailProvider: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (!_emailProvider) _emailProvider = new EmailProvider();
  return _emailProvider;
}
```

### `whatsapp.provider.ts` — same REST-call shape as the main app

If ops uses the same AiSensy (or equivalent WhatsApp Business API) account as the main app, this can hit the identical endpoint — just with its own `WHATSAPP_API_URL`/`WHATSAPP_API_KEY` so the two systems' sends are independently rate-limited and independently attributable in the provider's dashboard.

```ts
import { messagingConfig } from '../config/messaging.config';
import { OpsMessageTemplate } from '@prisma/client';
import { getWhatsAppTemplate } from '../templates/whatsapp.templates';

export interface IWhatsAppProvider {
  send(template: OpsMessageTemplate, destination: string, params: Record<string, any>): Promise<any>;
}

export class WhatsAppProvider implements IWhatsAppProvider {
  async send(template: OpsMessageTemplate, destination: string, params: Record<string, any>) {
    if (!destination) throw new Error('Destination is required');
    if (!messagingConfig.whatsapp.url) throw new Error('WHATSAPP_API_URL is not configured');

    const { campaignName, templateParams } = getWhatsAppTemplate(template, params);

    const response = await fetch(messagingConfig.whatsapp.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${messagingConfig.whatsapp.apiKey}`,
      },
      body: JSON.stringify({
        apiKey: messagingConfig.whatsapp.apiKey,
        campaignName,
        destination,
        userName: params.name,
        templateParams: templateParams.map(String),
        source: 'Ops Dashboard',
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error('WhatsApp send failed');
    return data;
  }
}
```

### `message-provider.factory.ts` — Strategy/Factory, identical shape to the main app's `MessageProvider`

```ts
import { OpsMessageChannel } from '@prisma/client';
import { EmailProvider } from './email.provider';
import { WhatsAppProvider } from './whatsapp.provider';

let emailProvider: EmailProvider | null = null;
let whatsappProvider: WhatsAppProvider | null = null;

export class MessageProviderFactory {
  static getProvider(channel: OpsMessageChannel) {
    switch (channel) {
      case 'EMAIL':
        if (!emailProvider) emailProvider = new EmailProvider();
        return emailProvider;
      case 'WHATSAPP':
        if (!whatsappProvider) whatsappProvider = new WhatsAppProvider();
        return whatsappProvider;
      default:
        throw new Error(`Unsupported message channel: ${channel}`);
    }
  }
}
```

---

## 9. Templates (`server/templates/`)

`email.templates.ts` and `whatsapp.templates.ts` each export a lookup keyed by `OpsMessageTemplate`. Start with the templates the current call sites actually need (see §13):

```ts
// server/templates/email.templates.ts
import { OpsMessageTemplate } from '@prisma/client';

export function getEmailTemplate(template: OpsMessageTemplate, params: Record<string, any>) {
  switch (template) {
    case 'BILLING_PAYMENT_SUCCESS':
      return {
        subject: `Payment received — ${params.planName}`,
        html: `<p>Hi ${params.adminName},</p><p>We've received your payment of ₹${params.amount} for the <strong>${params.planName}</strong> plan.</p>`,
      };
    case 'BILLING_PAYMENT_FAILED':
      return {
        subject: `Payment failed — ${params.planName}`,
        html: `<p>Hi ${params.adminName},</p><p>Your payment of ₹${params.amount} for the <strong>${params.planName}</strong> plan did not go through. Reason: ${params.reason || 'unknown'}.</p>`,
      };
    case 'SUBSCRIPTION_PAST_DUE':
      return {
        subject: `Action needed: your ${params.planName} subscription is past due`,
        html: `<p>Hi ${params.adminName},</p><p>Your subscription payment is past due. Please update billing to avoid service interruption.</p>`,
      };
    case 'SUBSCRIPTION_CANCELLED':
      return {
        subject: `Your subscription has been cancelled`,
        html: `<p>Hi ${params.adminName},</p><p>Your ${params.planName} subscription has been cancelled effective ${params.effectiveDate}.</p>`,
      };
    case 'PAYOUT_ACCOUNT_LINKED':
      return {
        subject: `Your payout account is now active`,
        html: `<p>Hi ${params.adminName},</p><p>Your organization's Razorpay payout account has been linked and is now active. Contest fee payouts will begin processing automatically.</p>`,
      };
    case 'PAYOUT_ACCOUNT_STATUS_CHANGED':
      return {
        subject: `Payout account status update`,
        html: `<p>Hi ${params.adminName},</p><p>Your payout account status changed to <strong>${params.status}</strong>. ${params.reason ? `Reason: ${params.reason}` : ''}</p>`,
      };
    default:
      return { subject: 'Notification from QuizBuzz', html: `<p>${params.body || ''}</p>` };
  }
}
```

`whatsapp.templates.ts` follows the same `switch`, returning `{ campaignName, templateParams }` per template — campaign names must match whatever templates are pre-approved on the WhatsApp Business API account being used.

---

## 10. Repository (`server/features/messaging/messaging.repository.ts`)

The one piece of business logic worth copying exactly is the main app's **forward-only state machine** in `updateStatus()` — it's what stops a stalled/retried BullMQ job from corrupting a message that's already `SENT`.

```ts
import { prisma } from '../../db/ops-prisma';
import { OpsMessageStatus } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';

export interface IMessagingRepository {
  create(data: any): Promise<any>;
  findById(id: string, organizationId?: string): Promise<any>;
  findFailed(organizationId: string): Promise<any[]>;
  updateStatus(id: string, toStatus: OpsMessageStatus, additionalData?: any): Promise<any>;
  incrementAttempt(id: string): Promise<void>;
}

const STATUS_ORDER: Record<string, number> = {
  QUEUED: 0,
  PROCESSING: 1,
  SENT: 2,
  DELIVERED: 3,
  FAILED: 2,
};

export class MessagingRepository implements IMessagingRepository {
  async create(data: any) {
    return prisma.opsMessageLog.create({ data: { id: generateUlid(), ...data } });
  }

  async findById(id: string, organizationId?: string) {
    return prisma.opsMessageLog.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
    });
  }

  async findFailed(organizationId: string) {
    return prisma.opsMessageLog.findMany({ where: { status: 'FAILED', organizationId } });
  }

  async updateStatus(id: string, toStatus: OpsMessageStatus, additionalData: any = {}) {
    const current = await prisma.opsMessageLog.findFirst({ where: { id }, select: { status: true } });
    if (!current) return null;

    const currentOrder = STATUS_ORDER[current.status] ?? -1;
    const targetOrder = STATUS_ORDER[toStatus] ?? -1;

    if (toStatus === 'QUEUED' && current.status !== 'FAILED') {
      throw new Error(`Cannot reset status to QUEUED unless FAILED. Current: ${current.status}`);
    } else if (current.status === 'FAILED' && toStatus === 'PROCESSING') {
      // BullMQ retry re-enters PROCESSING directly without cycling through QUEUED — valid.
    } else if (toStatus === current.status) {
      return this.findById(id); // no-op, stalled-job re-delivery
    } else if (targetOrder < currentOrder) {
      throw new Error(`Invalid state transition: ${current.status} -> ${toStatus}`);
    }

    await prisma.opsMessageLog.updateMany({
      where: { id },
      data: { status: toStatus, ...additionalData, updatedAt: new Date() },
    });

    return this.findById(id);
  }

  async incrementAttempt(id: string) {
    await prisma.opsMessageLog.update({ where: { id }, data: { attemptCount: { increment: 1 } } });
  }
}
```

---

## 11. Service (`server/features/messaging/messaging.service.ts`)

```ts
import { IMessagingRepository, MessagingRepository } from './messaging.repository';
import { messageQueue } from '../../queues/message.queue';
import { OpsMessageChannel, OpsMessageTemplate } from '@prisma/client';

export interface IMessagingService {
  enqueueMessage(organizationId: string, opts: {
    channel?: OpsMessageChannel;
    template: OpsMessageTemplate;
    recipient: string;
    subject?: string;
    params?: Record<string, any>;
  }): Promise<void>;
  retryMessage(id: string, organizationId: string): Promise<any>;
  retryFailedMessages(organizationId: string): Promise<{ count: number }>;
  updateMessageStatus(id: string, status: any, additionalData?: any): Promise<any>;
  incrementAttempt(id: string): Promise<void>;
}

export class MessagingService implements IMessagingService {
  constructor(private repo: IMessagingRepository = new MessagingRepository()) {}

  async enqueueMessage(organizationId: string, opts: {
    channel?: OpsMessageChannel;
    template: OpsMessageTemplate;
    recipient: string;
    subject?: string;
    params?: Record<string, any>;
  }) {
    const message = await this.repo.create({
      organizationId,
      channel: opts.channel ?? 'EMAIL',
      template: opts.template,
      recipient: opts.recipient,
      subject: opts.subject ?? null,
      params: opts.params ?? null,
      status: 'QUEUED',
    });

    // jobId = message.id makes re-enqueueing the same message idempotent —
    // BullMQ will not create a duplicate job for a jobId already in the queue.
    await messageQueue.add('send-message', { messageLogId: message.id }, { jobId: message.id });
  }

  async retryMessage(id: string, organizationId: string) {
    const message = await this.repo.findById(id, organizationId);
    if (!message) throw new Error('Message not found');
    if (message.status !== 'FAILED') {
      throw new Error(`Cannot retry message with status ${message.status}`);
    }
    const updated = await this.repo.updateStatus(id, 'QUEUED', { retryCount: { increment: 1 } });
    await messageQueue.add('send-message', { messageLogId: id }, { jobId: `retry-${id}-${Date.now()}` });
    return updated;
  }

  async retryFailedMessages(organizationId: string) {
    const failed = await this.repo.findFailed(organizationId);
    for (const msg of failed) {
      await this.repo.updateStatus(msg.id, 'QUEUED', { retryCount: { increment: 1 } });
      await messageQueue.add('send-message', { messageLogId: msg.id }, { jobId: `retry-${msg.id}-${Date.now()}` });
    }
    return { count: failed.length };
  }

  async updateMessageStatus(id: string, status: any, additionalData: any = {}) {
    return this.repo.updateStatus(id, status, additionalData);
  }

  async incrementAttempt(id: string) {
    await this.repo.incrementAttempt(id);
  }
}
```

---

## 12. Worker (`server/workers/message.worker.ts` + `server/workers/message.worker.service.ts`)

`message.worker.service.ts` — the actual processing logic (destination resolution, provider dispatch, status transitions, attempt-count based failure):

```ts
import { MessagingService } from '../features/messaging/messaging.service';
import { MessageProviderFactory } from '../providers/message-provider.factory';

export class MessageWorkerService {
  constructor(private messagingService: MessagingService) {}

  async process(messageLogId: string) {
    const log = await this.messagingService['repo'].findById(messageLogId);
    if (!log) throw new Error('Message log not found');
    if (log.status === 'SENT') return; // already delivered — don't resend on a stalled-job re-delivery

    const provider = MessageProviderFactory.getProvider(log.channel);

    try {
      await this.messagingService.updateMessageStatus(log.id, 'PROCESSING');
      const response = await provider.send(log.template, log.recipient, log.params ?? {});
      await this.messagingService.updateMessageStatus(log.id, 'SENT', {
        providerMsgId: response?.messageId ?? null,
        sentAt: new Date(),
        metadata: response ?? null,
      });
    } catch (error) {
      await this.messagingService.incrementAttempt(log.id);
      // Only flip to FAILED once BullMQ's own retries are exhausted (attempts=3 by default,
      // see messagingConfig.queue.retryAttempts) — mirrors the main app exactly.
      if (Number(log.attemptCount) + 1 >= 3) {
        await this.messagingService.updateMessageStatus(log.id, 'FAILED', {
          failureReason: (error as Error).message,
        });
      }
      throw error; // rethrow so BullMQ's 'failed' event fires and its own backoff/retry applies
    }
  }
}
```

`message.worker.ts` — the BullMQ `Worker` wrapper:

```ts
import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { messagingConfig } from '../config/messaging.config';
import { MessageWorkerService } from './message.worker.service';
import { messagingService } from '../container';

export function startMessageWorker() {
  const workerService = new MessageWorkerService(messagingService);

  const worker = new Worker(
    'ops-message-queue',
    async (job) => {
      if (job.name === 'send-message') {
        await workerService.process(job.data.messageLogId);
      }
    },
    { connection: redis, prefix: messagingConfig.queue.prefix, concurrency: 10 }
  );

  worker.on('ready', () => console.log(`[ops-message-worker] ready, prefix=${messagingConfig.queue.prefix}`));
  worker.on('failed', (job, err) => console.error(`[ops-message-worker] job ${job?.id} failed: ${err.message}`));
  worker.on('completed', (job) => console.log(`[ops-message-worker] job ${job.id} completed`));

  return worker;
}
```

---

## 13. Wiring into `server/container.ts`

Add alongside the existing repository/service/controller exports, in the same three-block style already used for every other feature:

```ts
import { MessagingRepository } from './features/messaging/messaging.repository';
import { MessagingService } from './features/messaging/messaging.service';
import { MessagingController } from './features/messaging/messaging.controller';

// ─── Repositories ──────────────────────────────────────────
export const messagingRepository = new MessagingRepository();

// ─── Services ───────────────────────────────────────────────
export const messagingService = new MessagingService(messagingRepository);

// ─── Controllers ────────────────────────────────────────────
export const messagingController = new MessagingController(messagingService);
```

`messaging.controller.ts` and the route files under `app/api/v1/ops/messaging/*/route.ts` follow the exact shape already used for `platform-auth` and `payouts` (`parseRequest`, `okResponse`, `getSessionAdmin()` guard) — no new pattern needed there.

Suggested endpoints:

```
POST /api/v1/ops/messaging/send                — manual send (admin composes a message to an org)
GET  /api/v1/ops/messaging/:id                 — message detail
POST /api/v1/ops/messaging/:id/retry           — retry one FAILED message
POST /api/v1/ops/messaging/retry-failed        — retry all FAILED messages
GET  /api/v1/ops/messaging/organization/:orgId — message history for one org
```

---

## 14. Deployment — the one real structural difference from the main app

The main app's Express server and its BullMQ worker are **already** two separate processes (`backend/src/index.ts` vs `backend/src/worker.ts`), so adding a worker there was just "add another file that imports the container and starts."

`quizbuzz-ops-next` is a Next.js app whose only production process today is `next start -p 3010`. A BullMQ `Worker` needs a long-lived process holding an open connection to Redis and continuously polling/blocking for jobs — that does not fit inside a Next.js request handler (each API route invocation is request-scoped, not a persistent process, even under `next start`).

So: run the worker as a **second, independent process**, exactly the way the main app's guideline #4.3/#6.3 requires ("no in-memory storage... all state must be in Redis/DB", "workers must be independent, no shared memory, no dependency on API instance"):

```ts
// scripts/worker.ts
import { startMessageWorker } from '../server/workers/message.worker';

console.log('[ops-worker] starting...');
startMessageWorker();

process.on('uncaughtException', (err) => console.error('[ops-worker] uncaught exception', err));
process.on('unhandledRejection', (reason) => console.error('[ops-worker] unhandled rejection', reason));
```

Run it via the new `npm run worker` script (added in §4), as its own PM2/systemd unit (or Docker service) alongside `npm start`:

```
pm2 start "npm run start"  --name ops-web
pm2 start "npm run worker" --name ops-worker
```

This keeps scaling config-driven and code-free, matching the QuizBuzz scaling contract: more load → increase `ops-worker` instance count and `concurrency`, no code changes.

---

## 15. Integration points — where the rest of ops-next should call this

The module is only useful once real events fire it. Wire these in as part of this work, not as a follow-up:

- **`server/features/billing/billing.service.ts`** — on successful Razorpay webhook/payment confirmation, call `messagingService.enqueueMessage(orgId, { template: 'BILLING_PAYMENT_SUCCESS', ... })`; on a failed/attempted payment (the same audit-trail event the starter-plan test plan already requires capturing), call it with `BILLING_PAYMENT_FAILED`.
- **`server/features/subscriptions/subscriptions.service.ts`** — on transition to `PAST_DUE` or `CANCELLED`, enqueue the matching template.
- **`server/features/payouts/payouts.service.ts`** — `attachLinkedAccount()` (already calls `writeAuditLogEntry`) and `updatePayoutStatus()` should each also call `messagingService.enqueueMessage()` right next to their existing audit-log call, using `PAYOUT_ACCOUNT_LINKED` / `PAYOUT_ACCOUNT_STATUS_CHANGED`.

Use `SYSTEM_ACTOR`-style attribution (same idea as `audit-writer.ts`'s `SYSTEM_ACTOR`) for messages triggered by webhooks/background jobs rather than a live admin action.

---

## 16. Testing checklist

1. `npm install` picks up `ioredis`, `bullmq`, `nodemailer` with no peer-dep conflicts.
2. `npx prisma migrate dev --name add_ops_messaging` applies cleanly against `quizbuzz_ops`.
3. `npm run worker` starts and logs `[ops-message-worker] ready` without crashing (confirms Redis connectivity via `REDIS_URL`).
4. Call `messagingService.enqueueMessage()` directly from a scratch script (or temporarily from an existing route) with `channel: 'EMAIL'` and a real SMTP-reachable address — confirm the row moves `QUEUED → PROCESSING → SENT` and the email actually arrives.
5. Force a failure (bad SMTP password) and confirm: the row reaches `FAILED` only after 3 attempts, `failureReason` is populated, and `retry-failed` re-queues it.
6. Confirm a message for an org with no WhatsApp number configured fails cleanly with "Destination is required" rather than throwing an unhandled exception that crashes the worker process.
7. Wire one real call site (payout status change is the smallest) and confirm end-to-end: admin action → audit log entry AND a queued message → worker sends it → `OpsMessageLog` row shows `SENT`.
