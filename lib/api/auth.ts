'use client';

import { AdminSession } from '@/lib/types';
import { apiRequest, ApiRequestError } from '@/lib/api/utils';

const SESSION_KEY = 'quizbuzz_super_admin_session';

export interface LoginResult {
  otpRequired: boolean;
  email: string;
  otpCode?: string;
}

/**
 * Initiates the administrator login.
 * The OTP itself is emailed to the admin by the backend — never returned here.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/api/v1/ops/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Submits the 6-digit verification code to complete authentication.
 * Stores the retrieved profile in localStorage as a visual cache.
 */
export async function verifyOtpCode(email: string, otp: string): Promise<AdminSession> {
  const result = await apiRequest<{ admin: AdminSession }>('/api/v1/ops/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(result.admin));
  }
  return result.admin;
}

/**
 * Returns the cached session synchronously to prevent visual UI flicker during load.
 */
export function getCurrentSessionSync(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Fetches the current admin profile from the backend session cookie.
 *
 * IMPORTANT: only a definitive 401 means "not authenticated" — that's the
 * one case where falling back to /refresh (and then, if that also 401s,
 * declaring the user logged out) is correct. Any other failure — a network
 * blip, a 5xx, a request aborted by React Strict Mode's dev-only double
 * effect invocation — is NOT proof the session is invalid, so it must
 * bubble up and let react-query's retry handle it. Silently treating every
 * failure as "logged out" here is what caused users to get bounced to
 * /login on a hard refresh even though their cookies were still valid.
 */
export async function getCurrentSession(): Promise<AdminSession | null> {
  try {
    const result = await apiRequest<{ admin: AdminSession }>('/api/v1/ops/auth/me');
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.admin));
    }
    return result.admin;
  } catch (err) {
    const meStatus = err instanceof ApiRequestError ? err.status : undefined;
    if (meStatus !== 401) {
      throw err;
    }

    // Access token is genuinely invalid/expired — attempt a silent refresh.
    try {
      const refreshResult = await apiRequest<{ admin: AdminSession }>('/api/v1/ops/auth/refresh', {
        method: 'POST',
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(SESSION_KEY, JSON.stringify(refreshResult.admin));
      }
      return refreshResult.admin;
    } catch (refreshErr) {
      const refreshStatus = refreshErr instanceof ApiRequestError ? refreshErr.status : undefined;
      if (refreshStatus !== 401) {
        throw refreshErr;
      }

      // Refresh token is also genuinely invalid/expired — this is a real logout.
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SESSION_KEY);
      }
      return null;
    }
  }
}

/**
 * Terminate the administrator session and clear cookies.
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/v1/ops/auth/logout', { method: 'POST' });
  } finally {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
    }
  }
}
