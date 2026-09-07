import { IAppSettingsRepository, AppSettingsRepository } from './app-settings.repository';
import { AppLogoResult } from './app-settings.types';
import { AuditActor, writeAuditLogEntry } from '../../audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

export interface IAppSettingsService {
  getAppLogo(): Promise<AppLogoResult>;
  uploadAppLogo(fileData: string, fileName: string, admin: AuditActor): Promise<AppLogoResult>;
  removeAppLogo(admin: AuditActor): Promise<void>;
}

export class AppSettingsService implements IAppSettingsService {
  constructor(private repo: IAppSettingsRepository = new AppSettingsRepository()) {}

  getAppLogo(): Promise<AppLogoResult> {
    return this.repo.getAppLogo();
  }

  async uploadAppLogo(fileData: string, fileName: string, admin: AuditActor): Promise<AppLogoResult> {
    const result = await this.repo.uploadAppLogo(fileData, fileName);
    await writeAuditLogEntry(admin, 'app_settings.logo_updated', AuditTargetType.APP_SETTINGS, 'app_settings_default', 'Application logo');
    return result;
  }

  async removeAppLogo(admin: AuditActor): Promise<void> {
    await this.repo.removeAppLogo();
    await writeAuditLogEntry(admin, 'app_settings.logo_removed', AuditTargetType.APP_SETTINGS, 'app_settings_default', 'Application logo');
  }
}

export default AppSettingsService;
