import { z } from 'zod';
import { LeadStatus, PlatformAdminRole } from '@prisma/client';
import { prisma } from '../../db/ops-prisma';
import { handoffSecret } from '../invoices/handoff-secret';
import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { okResponse, errorResponse } from '../../http/envelope';
import { parseQueryParams, parseRequest } from '../../http/validation';
import { verifyJwt } from '../../utils/jwt';
import { generateUlid } from '../../utils/ulid';

const leadTokenSchema = z.object({
  organizationId: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).nullable().optional(),
  organization: z.string().trim().max(200).nullable().optional(),
  message: z.string().trim().max(2000).nullable().optional(),
  learners: z.number().int().min(0).max(10_000_000).nullable().optional(),
  source: z.string().trim().max(50),
});

const listSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const updateSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  notes: z.string().max(5000).optional(),
});

const PAGE_SIZE = 25;

/** The main app signs a short-lived token with the shared billing secret, so nobody can fill this table from outside. */
export async function createLeadFromToken(req: Request) {
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return errorResponse('Token is required', 'VALIDATION_ERROR', null, 400);
  const secret = handoffSecret();
  if (!secret) return errorResponse('Billing is not available right now.', 'GATEWAY_NOT_CONFIGURED', null, 503);
  let claims: unknown;
  try {
    claims = verifyJwt(token, secret);
  } catch {
    return errorResponse('Invalid or expired token', 'UNAUTHENTICATED', null, 401);
  }
  const parsed = leadTokenSchema.safeParse(claims);
  if (!parsed.success) return errorResponse('Invalid lead', 'VALIDATION_ERROR', null, 400);
  const lead = await prisma.salesLead.create({ data: { id: generateUlid(), ...parsed.data } });
  return okResponse({ id: lead.id }, 'Lead recorded.');
}

export async function listLeads(req: Request) {
  await getSessionAdmin();
  const { status, page } = parseQueryParams(req, listSchema);
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.salesLead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.salesLead.count({ where }),
  ]);
  return okResponse({ rows, total }, 'Leads retrieved.');
}

export async function updateLead(req: Request, id: string) {
  await requireRole([PlatformAdminRole.SUPER_ADMIN, PlatformAdminRole.BILLING_ADMIN, PlatformAdminRole.SUPPORT]);
  const data = await parseRequest(req, updateSchema);
  return okResponse(await prisma.salesLead.update({ where: { id }, data }), 'Lead updated.');
}
