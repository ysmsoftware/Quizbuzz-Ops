import { prisma } from '../../db/ops-prisma';
import { queryMainDb } from '../../db/main-db-pool';
import { College, Department } from '@prisma/client';

export type CollegeWithCount = College & { _count: { departments: number } };

export interface UnlistedCollegeRow {
  name: string;
  count: number;
}

export interface UnlistedDepartmentRow {
  collegeId: string | null;
  college: string | null;
  department: string;
  count: number;
}

export interface ICollegesRepository {
  listColleges(): Promise<CollegeWithCount[]>;
  getCollegeById(id: string): Promise<College | null>;
  getCollegeByName(name: string): Promise<College | null>;
  createCollege(input: {
    id: string;
    name: string;
    state?: string | undefined;
    district?: string | undefined;
    city?: string | undefined;
    createdById: string;
    createdByName: string;
  }): Promise<College>;
  updateCollege(
    id: string,
    data: Partial<{ name: string; state: string; district: string; city: string; isActive: boolean }>
  ): Promise<College>;
  listDepartments(collegeId: string): Promise<Department[]>;
  getDepartmentByName(collegeId: string, name: string): Promise<Department | null>;
  createDepartment(input: {
    id: string;
    collegeId: string;
    name: string;
    createdByName: string;
  }): Promise<Department>;
  updateDepartment(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Department>;
  syncCollegeToMainApp(college: College): Promise<void>;
  syncDepartmentToMainApp(department: Department): Promise<void>;
  /** Deletes the college and, via the FK's onDelete: Cascade, every one of its departments —
   *  local ops DB only. Pair with deleteCollegeFromMainApp to also remove the mirror. */
  deleteCollege(id: string): Promise<void>;
  /** Write-through delete to Quizbuzz-new's own database — the DELETE-grant counterpart to
   *  syncCollegeToMainApp/syncDepartmentToMainApp's INSERT/UPDATE. Departments first, since
   *  the mirror tables carry no real FK to cascade on their own. */
  deleteCollegeFromMainApp(collegeId: string): Promise<void>;
  listUnlistedColleges(): Promise<UnlistedCollegeRow[]>;
  listUnlistedDepartments(): Promise<UnlistedDepartmentRow[]>;
  dismissUnlistedCollege(name: string, dismissedByName: string): Promise<void>;
  dismissUnlistedDepartment(collegeKey: string, department: string, dismissedByName: string): Promise<void>;
}

export class CollegesRepository implements ICollegesRepository {
  async listColleges(): Promise<CollegeWithCount[]> {
    return prisma.college.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { departments: true } } },
    });
  }

  async getCollegeById(id: string) {
    return prisma.college.findUnique({ where: { id } });
  }

  async getCollegeByName(name: string) {
    return prisma.college.findUnique({ where: { name } });
  }

  async createCollege(input: {
    id: string;
    name: string;
    state?: string | undefined;
    district?: string | undefined;
    city?: string | undefined;
    createdById: string;
    createdByName: string;
  }) {
    return prisma.college.create({
      data: {
        id: input.id,
        name: input.name,
        state: input.state ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        createdById: input.createdById,
        createdByName: input.createdByName,
      },
    });
  }

  async updateCollege(
    id: string,
    data: Partial<{ name: string; state: string; district: string; city: string; isActive: boolean }>
  ) {
    return prisma.college.update({ where: { id }, data });
  }

  async listDepartments(collegeId: string) {
    return prisma.department.findMany({ where: { collegeId }, orderBy: { name: 'asc' } });
  }

  async getDepartmentByName(collegeId: string, name: string) {
    return prisma.department.findUnique({ where: { collegeId_name: { collegeId, name } } });
  }

  async createDepartment(input: { id: string; collegeId: string; name: string; createdByName: string }) {
    return prisma.department.create({
      data: {
        id: input.id,
        collegeId: input.collegeId,
        name: input.name,
        createdByName: input.createdByName,
      },
    });
  }

  async updateDepartment(id: string, data: Partial<{ name: string; isActive: boolean }>) {
    return prisma.department.update({ where: { id }, data });
  }

  // Write-through to Quizbuzz-new's own database — same mechanism as
  // ambassador-types.repository.ts's syncTypeToMainApp. Full row on every
  // sync (not a diff) — simplest correct thing at this volume.
  async syncCollegeToMainApp(college: College) {
    await queryMainDb(
      `
      INSERT INTO platform_colleges (id, name, state, district, city, "isActive", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = $2,
        state = $3,
        district = $4,
        city = $5,
        "isActive" = $6,
        "updatedAt" = NOW()
    `,
      [college.id, college.name, college.state, college.district, college.city, college.isActive]
    );
  }

  async syncDepartmentToMainApp(department: Department) {
    await queryMainDb(
      `
      INSERT INTO platform_departments (id, "collegeId", name, "isActive", "updatedAt")
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        "collegeId" = $2,
        name = $3,
        "isActive" = $4,
        "updatedAt" = NOW()
    `,
      [department.id, department.collegeId, department.name, department.isActive]
    );
  }

  async deleteCollege(id: string) {
    await prisma.college.delete({ where: { id } });
  }

  async deleteCollegeFromMainApp(collegeId: string) {
    await queryMainDb(`DELETE FROM platform_departments WHERE "collegeId" = $1`, [collegeId]);
    await queryMainDb(`DELETE FROM platform_colleges WHERE id = $1`, [collegeId]);
  }

  // "Other" submissions from contest registration — a college/department typed as free text
  // because it wasn't in the catalog. Read-only reporting query straight off the main app's
  // own `contacts` table (quizbuzz_ops_reader already has SELECT on it); no new tables or
  // sync needed since Contact.collegeId/departmentId being null is exactly the signal that a
  // submission fell back to free text. Grouped case/whitespace-insensitively so "IIT Bombay"
  // and "iit bombay" count as one request, capped at the top 100 by volume.
  async listUnlistedColleges(): Promise<UnlistedCollegeRow[]> {
    const [rows, dismissed] = await Promise.all([
      queryMainDb<{ name: string; count: string }>(
        `
        SELECT MAX(college) as name, COUNT(*)::int as count
        FROM contacts
        WHERE "collegeId" IS NULL AND college IS NOT NULL AND TRIM(college) != ''
        GROUP BY LOWER(TRIM(college))
        ORDER BY count DESC
        LIMIT 100
      `
      ),
      prisma.dismissedUnlistedRequest.findMany({ where: { kind: 'COLLEGE' }, select: { collegeKey: true } }),
    ]);
    const dismissedKeys = new Set(dismissed.map((d) => d.collegeKey));
    return rows
      .filter((r) => !dismissedKeys.has(normalizeUnlistedKey(r.name)))
      .map((r) => ({ name: r.name, count: Number(r.count) }));
  }

  async listUnlistedDepartments(): Promise<UnlistedDepartmentRow[]> {
    const [rows, dismissed] = await Promise.all([
      queryMainDb<{ collegeId: string | null; college: string | null; department: string; count: string }>(
        `
        SELECT MAX("collegeId") as "collegeId", MAX(college) as college, MAX(department) as department, COUNT(*)::int as count
        FROM contacts
        WHERE "departmentId" IS NULL AND department IS NOT NULL AND TRIM(department) != ''
        GROUP BY COALESCE("collegeId", LOWER(TRIM(college))), LOWER(TRIM(department))
        ORDER BY count DESC
        LIMIT 100
      `
      ),
      prisma.dismissedUnlistedRequest.findMany({ where: { kind: 'DEPARTMENT' }, select: { collegeKey: true, departmentKey: true } }),
    ]);
    const dismissedKeys = new Set(dismissed.map((d) => `${d.collegeKey}::${d.departmentKey}`));
    return rows
      .filter((r) => {
        const collegeKey = normalizeUnlistedKey(r.collegeId ?? r.college ?? '');
        return !dismissedKeys.has(`${collegeKey}::${normalizeUnlistedKey(r.department)}`);
      })
      .map((r) => ({ collegeId: r.collegeId, college: r.college, department: r.department, count: Number(r.count) }));
  }

  async dismissUnlistedCollege(name: string, dismissedByName: string) {
    await prisma.dismissedUnlistedRequest.upsert({
      where: { kind_collegeKey_departmentKey: { kind: 'COLLEGE', collegeKey: normalizeUnlistedKey(name), departmentKey: '' } },
      create: { kind: 'COLLEGE', collegeKey: normalizeUnlistedKey(name), departmentKey: '', dismissedByName },
      update: {},
    });
  }

  async dismissUnlistedDepartment(collegeKey: string, department: string, dismissedByName: string) {
    // Normalized the same way as listUnlistedDepartments' filter, whether collegeKey is a
    // real collegeId or free-text college name — the caller doesn't need to know which, or
    // pre-normalize anything itself.
    const normalizedCollegeKey = normalizeUnlistedKey(collegeKey);
    await prisma.dismissedUnlistedRequest.upsert({
      where: {
        kind_collegeKey_departmentKey: { kind: 'DEPARTMENT', collegeKey: normalizedCollegeKey, departmentKey: normalizeUnlistedKey(department) },
      },
      create: { kind: 'DEPARTMENT', collegeKey: normalizedCollegeKey, departmentKey: normalizeUnlistedKey(department), dismissedByName },
      update: {},
    });
  }
}

function normalizeUnlistedKey(value: string): string {
  return value.trim().toLowerCase();
}
export default CollegesRepository;
