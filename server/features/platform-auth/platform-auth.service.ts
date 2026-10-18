import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../../config/env';
import { signJwt } from '../../utils/jwt';
import { IPlatformAuthRepository, PlatformAuthRepository } from './platform-auth.repository';
import { AppError, AuthenticationError } from '../../http/errors';
import { writeAuditLogEntry } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { getEmailProvider } from '../../providers/email.provider';
import { LoginResult, TokenSession } from './platform-auth.types';
import { rateLimit } from '../../lib/rate-limit';

// bcrypt hash of a random string: spent when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = '$2b$10$3X4cQvdAMwiyKx0ubuhKa.yUY9iZK45pOLcn1PzuDlySEgoOKVBhO';
const INVALID_CREDENTIALS = 'Invalid email or password, or the account is suspended.';
const RATE_WINDOW_SECONDS = 15 * 60;

export interface IPlatformAuthService {
  login(email: string, password: string, ipAddress?: string | null): Promise<LoginResult>;
  verifyOtp(
    email: string,
    otp: string,
    deviceInfo?: string | null,
    ipAddress?: string | null
  ): Promise<TokenSession>;
  refresh(
    refreshToken: string,
    deviceInfo?: string | null,
    ipAddress?: string | null
  ): Promise<{ accessToken: string; admin: TokenSession['admin'] }>;
  logout(refreshToken: string): Promise<void>;
}

export class PlatformAuthService implements IPlatformAuthService {
  constructor(private repo: IPlatformAuthRepository = new PlatformAuthRepository()) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** What is stored for a login code. Keyed + bound to the admin, so a leaked row can't be replayed or rainbow-tabled. */
  private hashOtp(adminId: string, otp: string): string {
    return crypto.createHmac('sha256', env.OPS_JWT_ACCESS_SECRET).update(`${adminId}:${otp}`).digest('hex');
  }

  async login(email: string, password: string, ipAddress?: string | null): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    await rateLimit(`login:email:${normalizedEmail}`, 5, RATE_WINDOW_SECONDS);
    if (ipAddress) await rateLimit(`login:ip:${ipAddress}`, 20, RATE_WINDOW_SECONDS);

    const admin = await this.repo.findAdminByEmail(email);
    const isMatch = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !admin.isActive || !isMatch) {
      throw new AuthenticationError(INVALID_CREDENTIALS);
    }

    // Generate 6-digit verification code (CSPRNG — Math.random is predictable)
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpExpiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Send the code by email *before* persisting it. If delivery throws, we
    // deliberately never call updateAdminOtp — otherwise a valid-but-never-
    // received code would sit active in the DB until it expires.
    try {
      await getEmailProvider().send('PLATFORM_ADMIN_OTP', admin.email, {
        otpCode,
        expiryMinutes: env.OTP_EXPIRY_MINUTES,
        firstName: admin.firstName,
      });
    } catch (err) {
      console.error(`Failed to send login OTP email to ${admin.email}:`, err);
      throw new AppError(
        'Could not send the verification email. Check SMTP configuration or contact your system administrator.',
        'OTP_EMAIL_DELIVERY_FAILED',
        502
      );
    }

    await this.repo.updateAdminOtp(admin.id, this.hashOtp(admin.id, otpCode), otpExpiresAt);

    // Local-dev convenience only, for when SMTP isn't configured against a
    // real mailbox on a dev machine. Never runs in production.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n🔑 [OTP CODE] Verification code for ${admin.email}: ${otpCode}\n`);
    }

    // Write audit log row
    await writeAuditLogEntry(
      null, // actor is null as session is not established yet
      'admin.otp_generated',
      AuditTargetType.PLATFORM_ADMIN,
      admin.id,
      `${admin.firstName} ${admin.lastName || ''}`.trim(),
      { email: admin.email }
    );

    return {
      otpRequired: true,
      email: admin.email,
      otpCode: process.env.NODE_ENV === 'development' ? otpCode : undefined,
    };
  }

  async verifyOtp(
    email: string,
    otp: string,
    deviceInfo?: string | null,
    ipAddress?: string | null
  ): Promise<TokenSession> {
    if (ipAddress) await rateLimit(`otp:ip:${ipAddress}`, 30, RATE_WINDOW_SECONDS);
    const admin = await this.repo.findAdminByEmail(email);
    if (!admin || !admin.isActive) {
      throw new AuthenticationError('Invalid or suspended administrator account');
    }

    if (!admin.otpCode || !admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
      throw new AuthenticationError('Verification code has expired or is invalid. Please request a new code.');
    }

    if (admin.otpAttempts >= env.OTP_MAX_ATTEMPTS) {
      await this.repo.updateAdminOtp(admin.id, null, null);
      throw new AuthenticationError('Too many incorrect codes. Please sign in again to get a new code.');
    }

    const expected = Buffer.from(admin.otpCode);
    const actual = Buffer.from(this.hashOtp(admin.id, otp));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      const attempts = await this.repo.recordFailedOtpAttempt(admin.id);
      if (attempts >= env.OTP_MAX_ATTEMPTS) await this.repo.updateAdminOtp(admin.id, null, null);
      throw new AuthenticationError('Invalid verification code entered.');
    }

    // Clear verification codes from DB and log login time
    await this.repo.updateAdminOtp(admin.id, null, null);
    await this.repo.updateLastLogin(admin.id);

    const fullName = `${admin.firstName} ${admin.lastName || ''}`.trim();
    const sessionPayload = {
      id: admin.id,
      email: admin.email,
      name: fullName,
      role: admin.role,
    };

    const accessToken = signJwt(sessionPayload, env.OPS_JWT_ACCESS_SECRET, env.OPS_ACCESS_TOKEN_TTL_MINUTES);
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = this.hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(Date.now() + env.OPS_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.repo.createRefreshToken(admin.id, refreshTokenHash, refreshExpiresAt, deviceInfo, ipAddress);

    // Audit Log entry on login success
    const actor = { id: admin.id, email: admin.email, name: fullName, role: admin.role };
    await writeAuditLogEntry(
      actor,
      'admin.logged_in',
      AuditTargetType.PLATFORM_ADMIN,
      admin.id,
      fullName,
      { deviceInfo, ipAddress }
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      admin: sessionPayload,
    };
  }

  async refresh(
    refreshToken: string,
    deviceInfo?: string | null,
    ipAddress?: string | null
  ): Promise<{ accessToken: string; admin: TokenSession['admin'] }> {
    const tokenHash = this.hashToken(refreshToken);
    const tokenRow = await this.repo.findRefreshToken(tokenHash);

    if (!tokenRow || tokenRow.revokedAt || tokenRow.expiresAt < new Date() || !tokenRow.admin.isActive) {
      throw new AuthenticationError('Refresh session is expired or invalid.');
    }

    const admin = tokenRow.admin;
    const fullName = `${admin.firstName} ${admin.lastName || ''}`.trim();
    const sessionPayload = {
      id: admin.id,
      email: admin.email,
      name: fullName,
      role: admin.role,
    };

    const accessToken = signJwt(sessionPayload, env.OPS_JWT_ACCESS_SECRET, env.OPS_ACCESS_TOKEN_TTL_MINUTES);

    return {
      accessToken,
      admin: sessionPayload,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const tokenRow = await this.repo.findRefreshToken(tokenHash);

    if (tokenRow) {
      await this.repo.deleteRefreshToken(tokenHash);
      const fullName = `${tokenRow.admin.firstName} ${tokenRow.admin.lastName || ''}`.trim();
      const actor = {
        id: tokenRow.admin.id,
        email: tokenRow.admin.email,
        name: fullName,
        role: tokenRow.admin.role,
      };
      await writeAuditLogEntry(
        actor,
        'admin.logged_out',
        AuditTargetType.PLATFORM_ADMIN,
        tokenRow.admin.id,
        fullName
      );
    }
  }
}
export default PlatformAuthService;
