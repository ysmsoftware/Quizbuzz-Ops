import winston from 'winston';
import { NextResponse } from 'next/server';

/**
 * Central Winston logger for the ops backend.
 *
 * Split across two layers on purpose:
 *  - middleware.ts (root, Edge runtime) logs the moment a request ARRIVES —
 *    method, path, IP, a generated request id — before any route handler
 *    runs. Edge runtime can't use Winston (no Node core APIs like `fs`
 *    there), so that layer uses plain console.log with the same line shape.
 *  - This file (server/http/logger.ts, Node.js runtime — every route.ts in
 *    this app already declares `export const runtime = 'nodejs'`) is where
 *    Winston actually runs, and where the RESPONSE side (status code,
 *    duration, success/fail) gets logged via withApiLogger() below.
 *
 * Next.js Middleware has no hook that fires after a downstream Route
 * Handler finishes — it only sees the request on the way in, never the
 * final response on the way out (unlike Express middleware, which wraps
 * the whole req/res lifecycle). So "log every request AND response" needs
 * both layers: middleware for arrival, this wrapper for outcome. Both tag
 * their lines with the same `x-request-id` (set by middleware, read here)
 * so the two log lines for one call can be correlated.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          // `${timestamp} [${level}]: ${message}` — everything relevant
          // (route, status, duration, request id) is folded into `message`
          // itself by withApiLogger below rather than passed as separate
          // meta, so lines stay a single clean line instead of growing a
          // trailing JSON blob.
          winston.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`)
        )
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Usage in a route.ts file:
 *
 *   export const POST = withApiLogger('auth.login', async (req) => {
 *     try {
 *       return await platformAuthController.login(req);
 *     } catch (err) {
 *       return handleRouteError(err);
 *     }
 *   });
 *
 * Each call to the wrapped handler is guaranteed to already have converted
 * thrown errors into a NextResponse (via handleRouteError) before it gets
 * here — the try/catch in this wrapper is a safety net for anything that
 * still slips through as a raw throw, so a bug in a route never results in
 * a silently unlogged request.
 */

// Deliberately typed with a bare `Request` and no second (dynamic-route
// `{ params }`) argument — Next.js's generated route type-checker infers an
// exact expected signature per route.ts file from its path, and re-declaring
// a second-param type here (even a structurally identical one) collides
// with that generated type under a route with no [dynamic] segments. None
// of the routes this wraps today have dynamic segments; a route that does
// can still call its own params logic inside the wrapped handler body via
// closure instead of a second parameter.
type RouteHandler = (req: Request) => Promise<NextResponse> | NextResponse;

function pathFromRequest(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return req.url;
  }
}

export function withApiLogger(routeName: string, handler: RouteHandler): RouteHandler {
  return async (req: Request) => {
    const start = Date.now();
    const method = req.method;
    const path = pathFromRequest(req);
    const requestId = req.headers.get('x-request-id') || undefined;

    const reqIdSuffix = requestId ? ` reqId=${requestId}` : '';

    try {
      const res = await handler(req);
      const durationMs = Date.now() - start;
      const status = res.status;
      const ok = status >= 200 && status < 400;
      const outcome = ok ? 'OK' : 'FAIL';

      logger.log(
        ok ? 'info' : 'warn',
        `[${routeName}] ${method} ${path} -> ${status} ${outcome} (${durationMs}ms)${reqIdSuffix}`
      );

      return res;
    } catch (err) {
      // Should be rare — route.ts files are expected to already catch and
      // convert errors via handleRouteError(). If we land here, something
      // threw outside that try/catch, so log it loudly and re-throw so
      // Next.js still surfaces its own 500 handling on top.
      const durationMs = Date.now() - start;
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        `[${routeName}] ${method} ${path} -> THREW (${durationMs}ms)${reqIdSuffix} — ${errMessage}`
      );
      throw err;
    }
  };
}
