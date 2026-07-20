import { parseRequest } from '../../http/validation';
import { loginSchema, verifyOtpSchema } from './platform-auth.validator';
import { PlatformAuthService } from './platform-auth.service';
import { okResponse } from '../../http/envelope';
import { cookies } from 'next/headers';
import { getSessionAdmin } from '../../http/auth-guard';

export class PlatformAuthController {
  private service = new PlatformAuthService();

  async login(req: Request) {
    const input = await parseRequest(req, loginSchema);
    const result = await this.service.login(input.email, input.password);
    return okResponse(result, 'Verification code has been dispatched.');
  }

  async verifyOtp(req: Request, userAgent: string | null, ipAddress: string | null) {
    const input = await parseRequest(req, verifyOtpSchema);
    const result = await this.service.verifyOtp(input.email, input.otp, userAgent, ipAddress);

    const cookieStore = await cookies();

    cookieStore.set('ops_access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60, // 30 mins
      path: '/',
    });

    cookieStore.set('ops_refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return okResponse({ admin: result.admin }, 'Verification successful. Session established.');
  }

  async refresh(userAgent: string | null, ipAddress: string | null) {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('ops_refresh_token')?.value;

    if (!refreshToken) {
      throw new Error('Refresh token is missing from session cookies.');
    }

    const result = await this.service.refresh(refreshToken, userAgent, ipAddress);

    cookieStore.set('ops_access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
    
    return okResponse({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      firstName,
      lastName,
      role: admin.role,
      avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80` // default fallback avatar
    }, 'Operator profile retrieved.');
  }
}
export default PlatformAuthController;
