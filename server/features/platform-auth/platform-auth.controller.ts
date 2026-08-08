import { parseRequest } from '../../http/validation';
import { loginSchema, verifyOtpSchema } from './platform-auth.validator';
import { IPlatformAuthService, PlatformAuthService } from './platform-auth.service';
import { okResponse } from '../../http/envelope';
import { cookies } from 'next/headers';
import { getSessionAdmin } from '../../http/auth-guard';
import { AuthenticationError } from '../../http/errors';

export class PlatformAuthController {
  constructor(private service: IPlatformAuthService = new PlatformAuthService()) {}

  async login(req: Request) {
    const input = await parseRequest(req, loginSchema);
    const result = await this.service.login(input.email, input.password);
    return okResponse(result, 'Verification code has been dispatched.');
  }

  private isHttpsRequest(req: Request): boolean {
    const proto = req.headers.get('x-forwarded-proto');
    if (proto) return proto.split(',')[0].trim() === 'https';
    return req.url.startsWith('https://');
  }

  async verifyOtp(req: Request, userAgent: string | null, ipAddress: string | null) {
    const input = await parseRequest(req, verifyOtpSchema);
    const result = await this.service.verifyOtp(input.email, input.otp, userAgent, ipAddress);

    const cookieStore = await cookies();
    const isSecure = this.isHttpsRequest(req);

    cookieStore.set('ops_access_token', result.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 mins
      path: '/',
    });

    cookieStore.set('ops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return okResponse({ admin: result.admin }, 'Verification successful. Session established.');
  }

  async refresh(userAgent: string | null, ipAddress: string | null, req?: Request) {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('ops_refresh_token')?.value;

    if (!refreshToken) {
      // Must be a 401 (AuthenticationError), not a bare Error — handleRouteError()
      // maps anything that isn't an AppError to a 500. The client's
      // getCurrentSession() (lib/api/auth.ts) only treats a *definitive 401*
      // from this endpoint as "really logged out"; a 500 here would instead be
      // rethrown as a transient failure and retried, leaving the admin stuck
      // rather than cleanly signed out when the refresh cookie is genuinely gone.
      throw new AuthenticationError('Refresh token is missing from session cookies.');
    }

    const result = await this.service.refresh(refreshToken, userAgent, ipAddress);
    const isSecure = req ? this.isHttpsRequest(req) : process.env.NODE_ENV === 'production';

    cookieStore.set('ops_access_token', result.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 30 * 60,
      path: '/',
    });

    return okResponse({ admin: result.admin }, 'Session credentials updated successfully.');
  }

  async logout() {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('ops_refresh_token')?.value;

    if (refreshToken) {
      await this.service.logout(refreshToken);
    }

    cookieStore.delete('ops_access_token');
    cookieStore.delete('ops_refresh_token');

    return okResponse(null, 'Administrator logged out successfully.');
  }

  async me() {
    const admin = await getSessionAdmin();
    // Reformat slightly to match frontend expected fields
    const nameParts = admin.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // MUST be wrapped in `{ admin: ... }` — lib/api/auth.ts#getCurrentSession()
    // reads `result.admin` off this response, matching the exact same shape
    // verifyOtp() and refresh() below already return. This endpoint used to
    // return the admin fields flat (no `admin` wrapper), which meant
    // `result.admin` was always `undefined` on the client even on a 200 —
    // silently breaking every session-validation call (the one that runs on
    // every hard refresh) while /verify-otp's directly-cached login data
    // masked it immediately after login. This was the actual cause of
    // "still logged in per the server, but bounced to /login on refresh."
    return okResponse({
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        firstName,
        lastName,
        role: admin.role,
        avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80` // default fallback avatar
      },
    }, 'Operator profile retrieved.');
  }
}
export default PlatformAuthController;
