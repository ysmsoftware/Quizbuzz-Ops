/**
 * One-off bulk import: populates College/Department from Colleges_Structured.csv
 * (root of this repo) — a curated list of 2800+ colleges with their department
 * lists, so the catalog doesn't have to be built one college at a time via the
 * dashboard. Writes to this app's own database AND write-through-syncs to the
 * main app's read-only mirror tables, same as an interactive create/edit does —
 * see colleges.repository.ts's syncCollegeToMainApp/syncDepartmentToMainApp.
 *
 * CSV columns: College Name, State, District/City, Departments (semicolon-
 * separated), Department Count (redundant — this script derives its own count
 * from the Departments column rather than trusting this field, though the two
 * already agree for every row as of writing). "District/City" is a single
 * combined column in the source data — mapped onto both this app's `district`
 * AND `city` fields (same value in both) since the CSV doesn't distinguish the
 * two; better a duplicated value than a blank one, per product decision.
 *
 * Idempotent by college name (the same @@unique constraint the dashboard relies
 * on): re-running after a partial failure skips colleges that already exist
 * rather than erroring or duplicating. A college's departments are only
 * inserted at the same time as the college itself, in the same transaction —
 * if a batch fails partway, nothing in that batch is left half-written.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-colleges-from-csv.ts
 *   npx tsx --env-file=.env scripts/import-colleges-from-csv.ts --file=./other.csv --batch-size=500
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { prisma } from '../server/db/ops-prisma';
import { queryMainDb } from '../server/db/main-db-pool';
import { generateUlid } from '../server/utils/ulid';
import { writeAuditLogEntry, SYSTEM_ACTOR } from '../server/audit/audit-writer';
import { AuditTargetType } from '@prisma/client';

interface CsvRow {
  'College Name': string;
  State: string;
  'District/City': string;
  Departments: string;
  'Department Count': string;
}

interface CollegeToImport {
  id: string;
  name: string;
  state: string;
  district: string;
  departments: string[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith('--file='));
  const batchArg = args.find((a) => a.startsWith('--batch-size='));
  return {
    file: fileArg ? fileArg.split('=')[1]! : './Colleges_Structured.csv',
    batchSize: batchArg ? parseInt(batchArg.split('=')[1]!, 10) : 200,
  };
}

function loadColleges(filePath: string): CollegeToImport[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows: CsvRow[] = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  return rows.map((row) => {
    const departments = (row['Departments'] || '')
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    return {
      id: generateUlid(),
      name: row['College Name'].trim(),
      state: row['State'].trim(),
      district: (row['District/City'] || '').trim(),
      departments,
    };
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function syncBatchToMainApp(colleges: CollegeToImport[], newCollegeIds: Set<string>) {
  const toSync = colleges.filter((c) => newCollegeIds.has(c.id));
  if (toSync.length === 0) return;

  // Multi-row upsert, one round-trip for the whole batch — same
  // INSERT...ON CONFLICT shape as the interactive per-row sync, just batched.
  const collegeValues: string[] = [];
  const collegeParams: unknown[] = [];
  toSync.forEach((c, i) => {
    const base = i * 6;
    collegeValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, NOW())`);
    // Same empty-string-to-null normalization as the ops-next side below — without it, a
    // blank CSV district lands in the mirror as '' instead of NULL, and a later "copy
    // district into city" backfill would then wrongly treat '' as "has a district".
    collegeParams.push(c.id, c.name, c.state, c.district || null, c.district || null, true);
  });
  await queryMainDb(
    `
    INSERT INTO platform_colleges (id, name, state, district, city, "isActive", "updatedAt")
    VALUES ${collegeValues.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, state = EXCLUDED.state, district = EXCLUDED.district,
      city = EXCLUDED.city, "isActive" = EXCLUDED."isActive", "updatedAt" = NOW()
  `,
    collegeParams
  );

  const deptRows = toSync.flatMap((c) => c.departments.map((name) => ({ id: generateUlid(), collegeId: c.id, name })));
  if (deptRows.length === 0) return;

  const deptValues: string[] = [];
  const deptParams: unknown[] = [];
  deptRows.forEach((d, i) => {
    const base = i * 4;
    deptValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW())`);
    deptParams.push(d.id, d.collegeId, d.name, true);
  });
  await queryMainDb(
    `
    INSERT INTO platform_departments (id, "collegeId", name, "isActive", "updatedAt")
    VALUES ${deptValues.join(', ')}
    ON CONFLICT (id) DO UPDATE SET
      "collegeId" = EXCLUDED."collegeId", name = EXCLUDED.name,
      "isActive" = EXCLUDED."isActive", "updatedAt" = NOW()
  `,
    deptParams
  );

  return deptRows.length;
}

async function main() {
  const { file, batchSize } = parseArgs();
  const filePath = path.resolve(process.cwd(), file);
  console.log(`Reading ${filePath} (batch size ${batchSize})...`);

  const colleges = loadColleges(filePath);
  console.log(`Parsed ${colleges.length} colleges, ${colleges.reduce((n, c) => n + c.departments.length, 0)} department entries.`);

  const batches = chunk(colleges, batchSize);
  let createdColleges = 0;
  let createdDepartments = 0;
  let skippedExisting = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const names = batch.map((c) => c.name);

    // Idempotency: skip colleges that already exist (safe re-run after a partial failure)
    // rather than letting the unique constraint throw or silently duplicating departments.
    const existing = await prisma.college.findMany({ where: { name: { in: names } }, select: { name: true } });
    const existingNames = new Set(existing.map((e) => e.name));
    const toCreate = batch.filter((c) => !existingNames.has(c.name));
    skippedExisting += batch.length - toCreate.length;

    if (toCreate.length > 0) {
      const collegeData = toCreate.map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state || null,
        district: c.district || null,
        // CSV only has one combined "District/City" column — mirrored into city too
        // (rather than left null) so the field isn't blank; see backfill-city-from-district.ts
        // for the one-time fix applied to rows imported before this was the behavior.
        city: c.district || null,
        createdByName: 'CSV Import (Colleges_Structured.csv)',
      }));
      const departmentData = toCreate.flatMap((c) =>
        c.departments.map((name) => ({
          id: generateUlid(),
          collegeId: c.id,
          name,
          createdByName: 'CSV Import (Colleges_Structured.csv)',
        }))
      );

      // Create the college batch and its departments together, atomically — if anything in
      // this batch fails, none of it is left half-written (per the requested transaction shape).
      await prisma.$transaction([
        prisma.college.createMany({ data: collegeData, skipDuplicates: true }),
        ...(departmentData.length > 0 ? [prisma.department.createMany({ data: departmentData, skipDuplicates: true })] : []),
      ]);

      createdColleges += toCreate.length;
      const newIds = new Set(toCreate.map((c) => c.id));
      const syncedDeptCount = await syncBatchToMainApp(toCreate, newIds);
      createdDepartments += syncedDeptCount ?? 0;
    }

    console.log(
      `Batch ${i + 1}/${batches.length}: created ${toCreate.length} colleges (${batch.length - toCreate.length} already existed)`
    );
  }

  await writeAuditLogEntry(SYSTEM_ACTOR, 'college.bulk_imported', AuditTargetType.COLLEGE, 'bulk-import', 'CSV bulk import', {
    source: path.basename(filePath),
    totalRows: colleges.length,
    createdColleges,
    createdDepartments,
    skippedExisting,
  });

  console.log('\nDone.');
  console.log(`  Colleges created:    ${createdColleges}`);
  console.log(`  Departments created: ${createdDepartments}`);
  console.log(`  Already existed:     ${skippedExisting}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
