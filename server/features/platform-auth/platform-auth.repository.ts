import { prisma } from '../../db/ops-prisma';
import { PlatformAdmin, PlatformAdminRefreshToken } from '@prisma/client';
import { generateUlid } from '../../utils/ulid';

export class PlatformAuthRepository {
  async findAdminByEmail(email: string): Promise<PlatformAdmin | null> {
    return prisma.platformAdmin.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findAdminById(id: string): Promise<PlatformAdmin | null> {
    return prisma.platformAdmin.findUnique({
      where: { id },
    });
  }

  async updateAdminOtp(id: string, otpCode: string | null, otpExpiresAt: Date | null): Promise<PlatformAdmin> {
    return prisma.platformAdmin.update({
      where: { id },
      data: { otpCode, otpExpiresAt },
    });
  }

  async updateLastLogin(id: string): Promise<PlatformAdmin> {
    return prisma.platformAdmin.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async createRefreshToken(
    adminId: string,
    tokenHash: string,
    expiresAt: Date,
    deviceInfo?: string | null,
    ipAddress?: string | null
  ): Promise<PlatformAdminRefreshToken> {
    return prisma.platformAdminRefreshToken.create({
      data: {
        id: generateUlid(),
        adminId,
        tokenHash,
        expiresAt,
        deviceInfo: deviceInfo || undefined,
        ipAddress: ipAddress || undefined,
      },
    });
  }

  async findRefreshToken(tokenHash: string): Promise<(PlatformAdminRefreshToken & { admin: PlatformAdmin }) | null> {
    return prisma.platformAdminRefreshToken.findUnique({
      where: { tokenHash },
      include: { admin: true },
    }) as Promise<(PlatformAdminRefreshToken & { admin: PlatformAdmin }) | null>;
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await prisma.platformAdminRefreshToken.deleteMany({
      where: { tokenHash },
    });
  }

  async revokeAllAdminTokens(adminId: string): Promise<void> {
    await prisma.platformAdminRefreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
