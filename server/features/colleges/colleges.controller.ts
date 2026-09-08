import { getSessionAdmin, requireRole } from '../../http/auth-guard';
import { parseRequest } from '../../http/validation';
import {
  collegeCreateSchema,
  collegeUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  dismissUnlistedSchema,
} from './colleges.validator';
import { ICollegesService, CollegesService } from './colleges.service';
import { okResponse, errorResponse } from '../../http/envelope';
import { PlatformAdminRole } from '@prisma/client';
import { AuditActor } from '../../audit/audit-writer';

function toActor(admin: { id: string; email: string; name: string; role: string }): AuditActor {
  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
}

export class CollegesController {
  constructor(private service: ICollegesService = new CollegesService()) {}

  async listColleges() {
    await getSessionAdmin();
    const result = await this.service.listColleges();
    return okResponse(result, 'Colleges retrieved.');
  }

  async createCollege(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, collegeCreateSchema);
    const result = await this.service.createCollege(input, toActor(admin));
    return okResponse(result, 'College created.');
  }

  async updateCollege(req: Request, id: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, collegeUpdateSchema);
    const result = await this.service.updateCollege(id, input, toActor(admin));
    return okResponse(result, 'College updated.');
  }

  async listDepartments(collegeId: string) {
    await getSessionAdmin();
    const result = await this.service.listDepartments(collegeId);
    return okResponse(result, 'Departments retrieved.');
  }

  async createDepartment(req: Request, collegeId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, departmentCreateSchema);
    const result = await this.service.createDepartment(collegeId, input, toActor(admin));
    return okResponse(result, 'Department created.');
  }

  async updateDepartment(req: Request, collegeId: string, departmentId: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, departmentUpdateSchema);
    const result = await this.service.updateDepartment(collegeId, departmentId, input, toActor(admin));
    return okResponse(result, 'Department updated.');
  }

  async deleteCollege(id: string) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    await this.service.deleteCollege(id, toActor(admin));
    return okResponse(null, 'College deleted.');
  }

  async listUnlistedRequests() {
    await getSessionAdmin();
    const [colleges, departments] = await Promise.all([
      this.service.listUnlistedColleges(),
      this.service.listUnlistedDepartments(),
    ]);
    return okResponse({ colleges, departments }, 'Unlisted requests retrieved.');
  }

  async dismissUnlisted(req: Request) {
    const admin = await requireRole([PlatformAdminRole.SUPER_ADMIN]);
    const input = await parseRequest(req, dismissUnlistedSchema);
    if (input.type === 'COLLEGE') {
      await this.service.dismissUnlistedCollege(input.collegeKey, toActor(admin));
    } else {
      await this.service.dismissUnlistedDepartment(input.collegeKey, input.department!, toActor(admin));
    }
    return okResponse(null, 'Dismissed.');
  }
}
export default CollegesController;
