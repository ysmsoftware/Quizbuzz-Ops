import { PlatformAdminRole } from '@prisma/client';
import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { okResponse, errorResponse } from '../../http/envelope';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { prisma } from '../../db/ops-prisma';
import { assertOrgExists } from '../organizations/org-exists';
import { invoiceDocument, pdfResponse, receiptDocument } from './billing-documents';
import { invoicesService as service } from './invoices.service';
import { billingSettingsSchema, invoiceActionSchema, issueInvoiceSchema, listInvoicesSchema, recordPaymentSchema, voidPaymentSchema } from './invoices.validator';

const BILLING = [PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN];
const SUPER = [PlatformAdminRole.SUPER_ADMIN];
const actorOf = (a: { id: string; email: string; name: string; role: PlatformAdminRole }) => ({ id: a.id, email: a.email, name: a.name, role: a.role });

export class InvoicesController {
  async list(req: Request) {
    await getSessionAdmin();
    return okResponse(await service.list(parseQueryParams(req, listInvoicesSchema)), 'Invoices retrieved.');
  }

  async issue(req: Request, orgId: string) {
    const admin = await requireRole(BILLING);
    const input = await parseRequest(req, issueInvoiceSchema);
    await assertOrgExists(orgId);
    return okResponse(await service.issue(orgId, input, actorOf(admin)), 'Invoice issued.');
  }

  async recordPayment(req: Request, id: string) {
    const admin = await requireRole(BILLING);
    return okResponse(await service.recordPayment(id, await parseRequest(req, recordPaymentSchema), actorOf(admin)), 'Payment recorded.');
  }

  async voidPayment(req: Request, id: string, paymentId: string) {
    const admin = await requireRole(SUPER);
    const { reason } = await parseRequest(req, voidPaymentSchema);
    return okResponse(await service.voidPayment(id, paymentId, reason, actorOf(admin)), 'Payment voided.');
  }

  async act(req: Request, id: string) {
    const input = await parseRequest(req, invoiceActionSchema);
    const admin = await requireRole(input.action === 'void' || input.action === 'write_off' ? SUPER : BILLING);
    return okResponse(await service.act(id, input, actorOf(admin)), 'Invoice updated.');
  }

  async document(id: string) {
    await getSessionAdmin();
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (!invoice) return errorResponse('Invoice not found', 'NOT_FOUND', null, 404);
    return pdfResponse(await invoiceDocument(invoice));
  }

  async receipt(id: string, paymentId: string) {
    await getSessionAdmin();
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    const payment = invoice?.payments.find((p) => p.id === paymentId);
    if (!invoice || !payment?.receiptNumber) return errorResponse('Receipt not found', 'NOT_FOUND', null, 404);
    return pdfResponse(await receiptDocument(invoice, payment, invoice.payments));
  }

  async proof(id: string, paymentId: string) {
    await getSessionAdmin();
    const proof = await prisma.paymentProof.findFirst({ where: { paymentId, payment: { invoiceId: id } } });
    if (!proof) return errorResponse('No proof on this payment', 'NOT_FOUND', null, 404);
    return new Response(Buffer.from(proof.data), {
      headers: {
        'Content-Type': proof.contentType,
        'Content-Disposition': `attachment; filename="${proof.fileName.replace(/[^\w.-]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  async getSettings() {
    await getSessionAdmin();
    return okResponse(await service.getSettings(), 'Billing settings retrieved.');
  }

  async saveSettings(req: Request) {
    const admin = await requireRole(SUPER);
    return okResponse(await service.saveSettings(await parseRequest(req, billingSettingsSchema), actorOf(admin)), 'Billing settings saved.');
  }
}

export const invoicesController = new InvoicesController();
