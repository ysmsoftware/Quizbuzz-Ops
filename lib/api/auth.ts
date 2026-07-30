'use client';

import { AdminSession } from '@/lib/types';
import { apiRequest } from '@/lib/api/utils';

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
 */
export async function getCurrentSession(): Promise<AdminSession | null> {
  try {
    const result = await apiRequest<{ admin: AdminSession }>('/api/v1/ops/auth/me');
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.admin));
    }
    return result.admin;
  } catch (err) {
    // If access token expired, attempt session refresh via refresh token cookie
    try {
      const refreshResult = await apiRequest<{ admin: AdminSession }>('/api/v1/ops/auth/refresh', {
        method: 'POST',
      });
      if (typeof window !== 'undefined') {
        localStorage.setItem(SESSION_KEY, JSON.stringify(refreshResult.admin));
      }
      return refreshResult.admin;
    } catch (refreshErr) {
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
