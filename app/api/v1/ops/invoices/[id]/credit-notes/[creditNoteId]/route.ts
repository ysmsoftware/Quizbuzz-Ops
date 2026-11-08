import { invoicesController } from '@/server/features/invoices/invoices.controller';
import { handleRouteError } from '@/server/http/errors';

export const runtime = 'nodejs';

/** The credit note's saved PDF. */
export async function GET(_req: Request, context: { params: Promise<{ id: string; creditNoteId: string }> }) {
  try {
    const { id, creditNoteId } = await context.params;
    return await invoicesController.creditNoteDocument(id, creditNoteId);
  } catch (err) {
    return handleRouteError(err);
  }
}
