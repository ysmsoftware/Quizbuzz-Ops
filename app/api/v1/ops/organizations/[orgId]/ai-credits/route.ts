import { z } from 'zod';
import { PlatformAdminRole } from '@prisma/client';
import { getSessionAdmin, requireRole } from '@/server/http/auth-guard';
import { parseRequest } from '@/server/http/validation';
import { okResponse } from '@/server/http/envelope';
import { handleRouteError } from '@/server/http/errors';
import { prisma } from '@/server/db/ops-prisma';
import { grantFreeTopUp } from '@/server/features/invoices/ai-credits';
import { assertOrgExists } from '@/server/features/organizations/org-exists';

export const runtime = 'nodejs';

/** Every top-up the org has had, bought or given, newest first. */
export async function GET(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    await getSessionAdmin();
    const { orgId } = await context.params;
    const rows = await prisma.aiCreditTopUp.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return okResponse(rows, 'AI credit top-ups.');
  } catch (err) {
    return handleRouteError(err);
  }
}

const grantSchema = z.object({
  credits: z.number().int().min(1).max(1_000_000),
  months: z.number().int().min(1).max(24).default(12),
  reason: z.string().trim().min(1, 'Reason is required'),
});

/** Free credits from ops. Super admin only, like any complimentary grant. */
export async function POST(req: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const { orgId } = await context.params;
    await assertOrgExists(orgId);
    const row = await grantFreeTopUp(orgId, await parseRequest(req, grantSchema), { id: admin.id, email: admin.email, name: admin.name, role: admin.role });
    return okResponse(row, `${row.credits} credits added.`);
  } catch (err) {
    return handleRouteError(err);
  }
}
