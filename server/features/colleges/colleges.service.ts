import { ICollegesRepository, CollegesRepository, CollegeWithCount } from './colleges.repository';
import { writeAuditLogEntry, AuditActor } from '../../audit/audit-writer';
import { AuditTargetType, College, Department } from '@prisma/client';
import { AppError, NotFoundError } from '../../http/errors';
import { generateUlid } from '../../utils/ulid';
import { CollegeDetail, DepartmentDetail, UnlistedCollege, UnlistedDepartment } from './colleges.types';
import { CollegeCreateInput, CollegeUpdateInput, DepartmentCreateInput, DepartmentUpdateInput } from './colleges.validator';

function toCollegeDetail(college: College | CollegeWithCount): CollegeDetail {
  return {
    id: college.id,
    name: college.name,
    state: college.state,
    district: college.district,
    city: college.city,
    isActive: college.isActive,
    departmentCount: '_count' in college ? college._count.departments : 0,
    createdByName: college.createdByName,
    createdAt: college.createdAt.toISOString(),
    updatedAt: college.updatedAt.toISOString(),
  };
}

function toDepartmentDetail(department: Department): DepartmentDetail {
  return {
    id: department.id,
    collegeId: department.collegeId,
    name: department.name,
    isActive: department.isActive,
    createdByName: department.createdByName,
    createdAt: department.createdAt.toISOString(),
    updatedAt: department.updatedAt.toISOString(),
  };
}

export interface ICollegesService {
  listColleges(): Promise<CollegeDetail[]>;
  createCollege(input: CollegeCreateInput, admin: AuditActor): Promise<CollegeDetail>;
  updateCollege(id: string, input: CollegeUpdateInput, admin: AuditActor): Promise<CollegeDetail>;
  listDepartments(collegeId: string): Promise<DepartmentDetail[]>;
  createDepartment(collegeId: string, input: DepartmentCreateInput, admin: AuditActor): Promise<DepartmentDetail>;
  updateDepartment(
    collegeId: string,
    departmentId: string,
    input: DepartmentUpdateInput,
    admin: AuditActor
  ): Promise<DepartmentDetail>;
  deleteCollege(id: string, admin: AuditActor): Promise<void>;
  listUnlistedColleges(): Promise<UnlistedCollege[]>;
  listUnlistedDepartments(): Promise<UnlistedDepartment[]>;
  dismissUnlistedCollege(name: string, admin: AuditActor): Promise<void>;
  dismissUnlistedDepartment(collegeKey: string, department: string, admin: AuditActor): Promise<void>;
}

export class CollegesService implements ICollegesService {
  constructor(private repo: ICollegesRepository = new CollegesRepository()) {}

  async listColleges() {
    const colleges = await this.repo.listColleges();
    return colleges.map(toCollegeDetail);
  }

  private async requireCollegeById(id: string) {
    const college = await this.repo.getCollegeById(id);
    if (!college) throw new NotFoundError(`College '${id}' not found`);
    return college;
  }

  async createCollege(input: CollegeCreateInput, admin: AuditActor) {
    const existing = await this.repo.getCollegeByName(input.name);
    if (existing) {
      throw new AppError(`A college named '${input.name}' already exists`, 'DUPLICATE_NAME', 409);
    }

    const created = await this.repo.createCollege({
      id: generateUlid(),
      name: input.name,
      state: input.state,
      district: input.district,
      city: input.city,
      createdById: admin.id!,
      createdByName: admin.name,
    });

    await writeAuditLogEntry(admin, 'college.created', AuditTargetType.COLLEGE, created.id, created.name);

    this.repo.syncCollegeToMainApp(created).catch((err) =>
      console.error(`Failed to sync college '${created.id}' to main app:`, err)
    );

    return toCollegeDetail(created);
  }

  async updateCollege(id: string, input: CollegeUpdateInput, admin: AuditActor) {
    const existing = await this.requireCollegeById(id);

    const updated = await this.repo.updateCollege(existing.id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.district !== undefined && { district: input.district }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    await writeAuditLogEntry(admin, 'college.updated', AuditTargetType.COLLEGE, updated.id, updated.name, {
      changes: input,
    });

    this.repo.syncCollegeToMainApp(updated).catch((err) =>
      console.error(`Failed to sync college '${updated.id}' to main app:`, err)
    );

    return toCollegeDetail(updated);
  }

  async listDepartments(collegeId: string) {
    await this.requireCollegeById(collegeId);
    const rows = await this.repo.listDepartments(collegeId);
    return rows.map(toDepartmentDetail);
  }

  async createDepartment(collegeId: string, input: DepartmentCreateInput, admin: AuditActor) {
    const college = await this.requireCollegeById(collegeId);

    const existing = await this.repo.getDepartmentByName(collegeId, input.name);
    if (existing) {
      throw new AppError(`A department named '${input.name}' already exists in this college`, 'DUPLICATE_NAME', 409);
    }

    const created = await this.repo.createDepartment({
      id: generateUlid(),
      collegeId: college.id,
      name: input.name,
      createdByName: admin.name,
    });

    await writeAuditLogEntry(admin, 'department.created', AuditTargetType.COLLEGE, created.id, created.name, {
      collegeId: college.id,
      collegeName: college.name,
    });

    this.repo.syncDepartmentToMainApp(created).catch((err) =>
      console.error(`Failed to sync department '${created.id}' to main app:`, err)
    );

    return toDepartmentDetail(created);
  }

  async updateDepartment(collegeId: string, departmentId: string, input: DepartmentUpdateInput, admin: AuditActor) {
    await this.requireCollegeById(collegeId);
    const rows = await this.repo.listDepartments(collegeId);
    const existing = rows.find((d) => d.id === departmentId);
    if (!existing) throw new NotFoundError(`Department '${departmentId}' not found`);

    const updated = await this.repo.updateDepartment(existing.id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    await writeAuditLogEntry(admin, 'department.updated', AuditTargetType.COLLEGE, updated.id, updated.name, {
      collegeId,
      changes: input,
    });

    this.repo.syncDepartmentToMainApp(updated).catch((err) =>
      console.error(`Failed to sync department '${updated.id}' to main app:`, err)
    );

    return toDepartmentDetail(updated);
  }

  async deleteCollege(id: string, admin: AuditActor) {
    const college = await this.requireCollegeById(id);
    // Fetched before deleting purely for the audit trail — the FK cascade removes these
    // locally regardless of whether this count is read first.
    const departments = await this.repo.listDepartments(id);

    await this.repo.deleteCollege(id);

    await writeAuditLogEntry(admin, 'college.deleted', AuditTargetType.COLLEGE, college.id, college.name, {
      departmentsRemoved: departments.length,
    });

    this.repo.deleteCollegeFromMainApp(id).catch((err) =>
      console.error(`Failed to delete college '${id}' from main app:`, err)
    );
  }

  async listUnlistedColleges() {
    return this.repo.listUnlistedColleges();
  }

  async listUnlistedDepartments() {
    return this.repo.listUnlistedDepartments();
  }

  async dismissUnlistedCollege(name: string, admin: AuditActor) {
    await this.repo.dismissUnlistedCollege(name, admin.name);
    await writeAuditLogEntry(admin, 'unlisted_college.dismissed', AuditTargetType.COLLEGE, name, name);
  }

  async dismissUnlistedDepartment(collegeKey: string, department: string, admin: AuditActor) {
    await this.repo.dismissUnlistedDepartment(collegeKey, department, admin.name);
    await writeAuditLogEntry(admin, 'unlisted_department.dismissed', AuditTargetType.COLLEGE, collegeKey, department);
  }
}
export default CollegesService;
