import { NextResponse, type NextRequest } from 'next/server';

/**
 * Root request logger — runs on the Edge runtime, in front of every
 * matched request, before any route handler executes.
 *
 * Why this doesn't use Winston directly: Winston needs Node core APIs
 * (`fs`, streams) that don't exist on the Edge runtime middleware runs on
 * by default. Running middleware on the Node.js runtime instead is only
 * available in this Next.js version behind an experimental flag
 * (`experimental.nodeMiddleware`), and even then it wouldn't fully solve
 * the actual goal: Next.js Middleware has no "after the response" hook —
 * `NextResponse.next()` just tells Next.js to continue routing, it does
 * not hand back the eventual status code from the Route Handler that ends
 * up serving the request. So middleware physically cannot log "was this
 * call successful" by itself.
 *
 * The split that actually delivers "log every request AND response" is:
 *  - HERE: log the moment every matched request arrives (method, path,
 *    IP, a generated request id), on the stable, fast Edge runtime.
 *  - server/http/logger.ts's withApiLogger(): wraps individual route
 *    handlers (which already run on the Node.js runtime — every route.ts
 *    in this app declares `export const runtime = 'nodejs'`) and logs the
 *    outcome (status code, duration, success/fail) via Winston once the
 *    handler actually finishes.
 * Both sides tag their line with the same `x-request-id` so the two log
 * lines for one call can be matched up.
 */
export function middleware(req: NextRequest) {
  const requestId =
    req.headers.get('x-request-id') ||
    `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  // Matches the `YYYY-MM-DD HH:mm:ss [level]: message` shape Winston prints
  // in server/http/logger.ts, so both log lines for one request look like
  // one consistent stream instead of two different formats. Edge runtime
  // has no Winston (no Node `fs`/streams there), so the "info" level is
  // colorized by hand with the same ANSI green Winston's colorize() uses.
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const GREEN = '\x1b[32m';
  const RESET = '\x1b[39m';
  console.log(
    `${ts} [${GREEN}info${RESET}]: [middleware] ${req.method} ${req.nextUrl.pathname} <- received ip=${ip} reqId=${requestId}`
  );

  // Propagate the request id both downstream (so withApiLogger can read it
  // off the request and correlate its "outcome" log line back to this
  // "received" one) and back to the client (so a client-side error report
  // can reference the exact request id to grep for in server logs).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
