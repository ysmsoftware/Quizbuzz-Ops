import { GET as opsHealthGET } from '../v1/ops/health/route';

export const runtime = 'nodejs';

export async function GET() {
  return opsHealthGET();
}
