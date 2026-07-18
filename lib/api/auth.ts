'use client';

import { AdminSession, AdminRole } from '@/lib/types';
import { simulateLatency } from '@/lib/api/utils';

const SESSION_KEY = 'quizbuzz_super_admin_session';

const DEFAULT_ADMINS: Record<AdminRole, Omit<AdminSession, 'role'>> = {
  SUPER_ADMIN: {
    name: 'Vikram Grover',
    email: 'admin@quizbuzz.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&fit=crop&q=80',
  },
  SUPPORT: {
    name: 'Karan Mehra',
    email: 'support@quizbuzz.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&fit=crop&q=80',
  },
  BILLING_ADMIN: {
    name: 'Pooja Hegde',
    email: 'billing@quizbuzz.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&fit=crop&q=80',
  },
};

export async function login(email: string, password: string, role: AdminRole = 'SUPER_ADMIN'): Promise<AdminSession> {
  await simulateLatency();

  if (password !== 'demo1234') {
    throw new Error('Invalid credentials. Password must be "demo1234" for demo access.');
  }

  const defaultDetails = DEFAULT_ADMINS[role] || DEFAULT_ADMINS.SUPER_ADMIN;

  const session: AdminSession = {
    email: email.trim().toLowerCase(),
    role,
    name: defaultDetails.name,
    avatarUrl: defaultDetails.avatarUrl,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

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

export async function getCurrentSession(): Promise<AdminSession | null> {
  await simulateLatency(100, 200);
  return getCurrentSessionSync();
}

export async function logout(): Promise<void> {
  await simulateLatency(100, 200);
  localStorage.removeItem(SESSION_KEY);
}

export async function updateSessionRole(role: AdminRole): Promise<AdminSession> {
  await simulateLatency(100, 200);
  const current = getCurrentSessionSync();
  if (!current) {
    throw new Error('No active session to update.');
  }

  const defaultDetails = DEFAULT_ADMINS[role];
  const updated: AdminSession = {
    ...current,
    role,
    name: defaultDetails.name,
    email: defaultDetails.email,
    avatarUrl: defaultDetails.avatarUrl,
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  
  // Custom event to notify components that are listening
  window.dispatchEvent(new Event('quizbuzz_session_update'));
  
  return updated;
}
