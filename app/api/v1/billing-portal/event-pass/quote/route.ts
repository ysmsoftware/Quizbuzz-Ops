import { z } from 'zod';
import { okResponse, errorResponse } from '@/server/http/envelope';
import { eventPassQuote } from '@/lib/pricing/event-pass';

/** Public: the landing page's Event Pass calculator asks here, so it always shows the price ops books at. */
const quoteSchema = z.object({
  participants: z.number().int().min(1).max(1_000_000),
  extraContests: z.number().int().min(0).max(5).optional(),
  aiQuestionsHundreds: z.number().int().min(0).max(100).optional(),
  whatsapp: z.boolean().optional(),
  engineer: z.boolean().optional(),
  entryFee: z.number().min(0).max(100_000).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = quoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid calculator input', 'VALIDATION_ERROR', parsed.error.flatten(), 400);
  // The revenue-share percent is ours to set per deal, so the public quote always uses the standard one.
  return okResponse(eventPassQuote(parsed.data), 'Event Pass quote.');
}
