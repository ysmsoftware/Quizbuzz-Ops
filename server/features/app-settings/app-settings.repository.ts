import { env } from '../../config/env';
import { AppError } from '../../http/errors';
import { AppLogoResult } from './app-settings.types';

/**
 * Server-to-server HTTP client for the main app's /api/v1/ops/settings/* and
 * /api/v1/platform/* endpoints — same shared-secret pattern as
 * ops-metrics.repository.ts's callMainApp (x-ops-settings-secret header,
 * not a query param, so it never lands in access logs). There's no local
 * copy of the app logo in ops-next's own DB: the main app owns storage
 * (StorageService) and is the single source of truth, so every read/write
 * here is a live round trip rather than a mirrored table.
 */
class AppSettingsUpstreamError extends AppError {
  constructor(message: string, status = 502) {
    super(message, 'APP_SETTINGS_UPSTREAM_ERROR', status);
  }
}

async function callMainApp<T>(path: string, init?: RequestInit, authed = true): Promise<T> {
  if (authed && !env.OPS_SETTINGS_SECRET) {
    throw new AppSettingsUpstreamError('OPS_SETTINGS_SECRET is not configured on this deployment', 500);
  }

  const url = `${env.MAIN_APP_FRONTEND_URL.replace(/\/$/, '')}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(authed ? { 'x-ops-settings-secret': env.OPS_SETTINGS_SECRET } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new AppSettingsUpstreamError(
      `Could not reach main app settings endpoint (${url}): ${err instanceof Error ? err.message : 'network error'}`
    );
  }

  const body: any = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppSettingsUpstreamError(
      `Main app settings endpoint returned ${response.status}: ${body?.message || response.statusText}`,
      response.status === 401 || response.status === 403 ? 502 : response.status
    );
  }

  if (body?.success === false) {
    throw new AppSettingsUpstreamError(body?.message || 'Main app settings endpoint reported failure');
  }

  return (body?.success ? body.data : body) as T;
}

export interface IAppSettingsRepository {
  getAppLogo(): Promise<AppLogoResult>;
  uploadAppLogo(fileData: string, fileName: string): Promise<AppLogoResult>;
  removeAppLogo(): Promise<void>;
}

export class AppSettingsRepository implements IAppSettingsRepository {
  getAppLogo(): Promise<AppLogoResult> {
    return callMainApp<AppLogoResult>('/api/v1/platform/app-logo', { method: 'GET' }, false);
  }

  uploadAppLogo(fileData: string, fileName: string): Promise<AppLogoResult> {
    return callMainApp<AppLogoResult>('/api/v1/ops/settings/app-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData, fileName }),
    });
  }

  async removeAppLogo(): Promise<void> {
    await callMainApp<null>('/api/v1/ops/settings/app-logo', { method: 'DELETE' });
  }
}

export default AppSettingsRepository;
