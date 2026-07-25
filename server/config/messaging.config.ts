import { env } from './env';

/**
 * Central, env-driven config for the messaging system. Nothing in the
 * provider/service/worker layers should read `process.env` directly —
 * everything flows through this object, same convention as the rest of
 * `server/config/*`.
 *
 * `whatsapp.enabled` is the single switch that turns WhatsApp on. It is
 * read once here at startup, not re-checked per request, matching the
 * "config parsed once at startup" rule used everywhere else in this repo.
 */
export const messagingConfig = {
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM ?? env.SMTP_USER,
  },
  whatsapp: {
    url: env.WHATSAPP_API_URL,
    apiKey: env.WHATSAPP_API_KEY,
    // Feature flag, not a capability flag: the WhatsAppProvider class is
    // fully implemented and can be exercised directly regardless of this
    // value (e.g. from a script or a future admin-only tool). This flag
    // only gates whether MessagingService.enqueueMessage() will accept a
    // WHATSAPP channel through the normal application flow.
    enabled: env.WHATSAPP_MESSAGING_ENABLED,
  },
  queue: {
    name: 'ops-message-queue',
    prefix: env.MESSAGE_QUEUE_PREFIX,
    retryAttempts: env.MESSAGE_QUEUE_RETRY_ATTEMPTS,
    backoff: { type: 'exponential' as const, delay: env.MESSAGE_QUEUE_BACKOFF_DELAY_MS },
    workerConcurrency: env.MESSAGE_WORKER_CONCURRENCY,
  },
} as const;
