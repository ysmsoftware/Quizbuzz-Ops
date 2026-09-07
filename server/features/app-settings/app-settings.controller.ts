import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import { appLogoUploadSchema } from './app-settings.validator';
import { IAppSettingsService, AppSettingsService } from './app-settings.service';
import { okResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { AuditActor } from '../../audit/audit-writer';

function toActor(admin: { id: string; email: string; name: string; role: string }): AuditActor {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

export class AppSettingsController {
  constructor(private service: IAppSettingsService = new AppSettingsService()) {}

  async getAppLogo() {
    await getSessionAdmin();
    const result = await this.service.getAppLogo();
    return okResponse(result, 'App logo retrieved.');
  }

  async uploadAppLogo(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, appLogoUploadSchema);
    const result = await this.service.uploadAppLogo(input.fileData, input.fileName, toActor(admin));
    return okResponse(result, 'App logo uploaded.');
  }

  async removeAppLogo() {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    await this.service.removeAppLogo(toActor(admin));
    return okResponse(null, 'App logo removed.');
  }
}

export default AppSettingsController;
