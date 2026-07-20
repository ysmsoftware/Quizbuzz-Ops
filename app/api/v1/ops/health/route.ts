import { prisma } from '../../../../../server/db/ops-prisma';
import { queryMainDb } from '../../../../../server/db/main-db-pool';
import { okResponse, errorResponse } from '../../../../../server/http/envelope';

export const runtime = 'nodejs';

export async function GET() {
  try {
    let opsDbOk = false;
    let mainDbOk = false;

    // Verify Ops Database
    try {
      await prisma.$queryRaw`SELECT 1`;
      opsDbOk = true;
    } catch (err) {
      console.error('Health Check: Ops DB connection failed:', err);
    }

    // Verify Main Database
    try {
      await queryMainDb('SELECT 1');
      mainDbOk = true;
    } catch (err) {
      console.error('Health Check: Main DB connection failed:', err);
    }

    const responseBody = {
      status: opsDbOk && mainDbOk ? 'ok' : 'error',
      opsDb: opsDbOk ? 'ok' : 'error',
      mainDb: mainDbOk ? 'ok' : 'error',
    };

    if (opsDbOk && mainDbOk) {
      return okResponse(responseBody, 'Health check passed', 200);
    }

    return errorResponse(
      'Health check failed: One or more databases are unreachable',
      'DATABASE_UNREACHABLE',
      responseBody,
      503
    );
  } catch (err) {
    console.error('Health Check: Global check exception:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal server exception during health check',
      'HEALTH_CHECK_EXCEPTION',
      null,
      500
    );
  }
}
