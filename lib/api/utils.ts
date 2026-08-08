/**
 * Simulates artificial network latency for API responses.
 * By default delays between 300ms and 600ms.
 */
export function simulateLatency(min = 300, max = 600): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Returns true if a random failure should trigger, defaults to 2% chance.
 */
export function shouldFail(chance = 0.02): boolean {
  return Math.random() < chance;
}

/**
 * Error thrown by apiRequest — carries the HTTP status code so callers can
 * distinguish "definitely unauthenticated" (401) from transient failures
 * (network blips, 5xx, aborted requests) instead of treating every failure
 * the same way. See lib/api/auth.ts#getCurrentSession for why this matters.
 */
export class ApiRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Shared wrapper for Next.js API requests.
 * Parses the standard envelope, checks success status, and returns the payload data.
 */
export async function apiRequest<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  let body: any;
  try {
    body = await response.json();
  } catch (err) {
    body = {};
  }

  if (!response.ok) {
    const errorMsg = body.message || response.statusText || `Request failed with status ${response.status}`;
    throw new ApiRequestError(errorMsg, response.status);
  }

  // Handle case where custom envelope was returned
  if (body.success === false) {
    const errorMsg = body.message || (body.error && body.error.code) || 'API Request failed';
    throw new ApiRequestError(errorMsg, response.status);
  }

  return body.success ? body.data : body;
}
