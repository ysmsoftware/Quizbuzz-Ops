import nodemailer from 'nodemailer';
import { OpsMessageTemplate } from '@prisma/client';
import { messagingConfig } from '../config/messaging.config';
import { getEmailTemplate } from '../templates/email.templates';
import { IMessageProvider } from './message-provider.interface';
import { paymentAttachments } from '../features/invoices/payment-documents';

export class EmailProvider implements IMessageProvider {
  private transporter: nodemailer.Transporter;

  // Built lazily, inside the constructor — never as a module-level constant.
  // A module-level `nodemailer.createTransport(...)` reads env vars at
  // import time, which can run before env parsing/dotenv has completed
  // depending on import order, silently producing an unauthenticated
  // transporter. Constructing it on first use (see getEmailProvider below)
  // guarantees `messagingConfig` is fully populated first.
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: messagingConfig.smtp.host,
      port: messagingConfig.smtp.port,
      secure: messagingConfig.smtp.secure,
      auth: {
        user: messagingConfig.smtp.user,
        pass: messagingConfig.smtp.pass,
      },
    });
  }

  async send(template: OpsMessageTemplate, destination: string, params: Record<string, any>): Promise<any> {
    if (!destination) throw new Error('Destination is required');

    const { subject, html } = getEmailTemplate(template, params);

    // A receipt email carries both documents. If they can't be built, the email still goes.
    const attachments = template === 'BILLING_RECEIPT' && params.paymentId
      ? await paymentAttachments(params.paymentId).catch((err) => {
          console.error(`Could not attach documents for payment ${params.paymentId}:`, err);
          return [];
        })
      : [];

    return this.transporter.sendMail({
      from: messagingConfig.smtp.from,
      to: destination,
      subject,
      html,
      attachments,
    });
  }
}

let _emailProvider: EmailProvider | null = null;

/** Singleton accessor — reuses one SMTP transporter/connection pool for the process lifetime. */
export function getEmailProvider(): EmailProvider {
  if (!_emailProvider) _emailProvider = new EmailProvider();
  return _emailProvider;
}
