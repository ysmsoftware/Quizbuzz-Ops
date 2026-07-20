import { cookies } from 'next/headers';
import { env } from '../config/env';
import { verifyJwt } from '../utils/jwt';
import { AuthenticationError, ForbiddenError } from './errors';
import { PlatformAdminRole } from '@prisma/client';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
  role: PlatformAdminRole;
}

/**
 * Extracts and validates the administrator session from HTTPOnly cookies.
 * Throws AuthenticationError if invalid or missing.
 */
export async function getSessionAdmin(): Promise<AuthenticatedAdmin> {
  const cookieStore = await cookies();
  const token = cookieStore.get('ops_access_token')?.value;

  if (!token) {
    throw new AuthenticationError('Authentication required: Missing access token');
  }

  try {
    const payload = verifyJwt(token, env.OPS_JWT_ACCESS_SECRET);
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role as PlatformAdminRole,
    };
  } catch (err) {
    throw new AuthenticationError('Session expired or invalid: Please log in again');
  }
}

/**
 * Ensures the logged in administrator has one of the allowed roles.
 * Throws ForbiddenError if unauthorized.
 */
export async function requireRole(allowedRoles: PlatformAdminRole[]): Promise<AuthenticatedAdmin> {
  const admin = await getSessionAdmin();
  if (!allowedRoles.includes(admin.role)) {
    throw new ForbiddenError(`Access denied: Required privileges missing for role ${admin.role}`);
  }
  return admin;
}
