import { PlatformAdminRole } from '@prisma/client';

export interface AdminDetails {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  role: PlatformAdminRole;
  isActive: boolean;
}

export interface LoginResult {
  otpRequired: boolean;
  email: string;
  otpCode?: string; // Included only in development mode for easier debugging/testing
}

export interface TokenSession {
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: PlatformAdminRole;
  };
}
