import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../../config/env';
import { signJwt } from '../../utils/jwt';
import { IPlatformAuthRepository, PlatformAuthRepository } from './platform-auth.repository';
import { AuthenticationError } from '../../http/errors';
import { writeAuditLogEntry } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';
import { LoginResult, TokenSession } from './platform-auth.types';

export interface IPlatformAuthService {
  login(email: string, password: string): Promise<LoginResult>;
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

  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await this.repo.findAdminByEmail(email);
    if (!admin || !admin.isActive) {
      throw new AuthenticationError('Invalid credentials or account is suspended');
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Generate 6-digit verification code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.repo.updateAdminOtp(admin.id, otpCode, otpExpiresAt);

    // Print OTP to server console/logs for operator access in VPS and development environments
    console.log(`\n🔑 [OTP CODE] Verification code for ${admin.email}: ${otpCode}\n`);

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
    const admin = await this.repo.findAdminByEmail(email);
    if (!admin || !admin.isActive) {
      throw new AuthenticationError('Invalid or suspended administrator account');
    }

    if (!admin.otpCode || !admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
      throw new AuthenticationError('Verification code has expired or is invalid. Please request a new code.');
    }

    if (admin.otpCode !== otp) {
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
