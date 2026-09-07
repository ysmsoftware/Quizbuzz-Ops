/**
 * One-off backfill: for colleges with no city set (the CSV import left city
 * null since the source data only had a combined "District/City" column —
 * see import-colleges-from-csv.ts), copy district into city so it isn't
 * blank. Only touches rows where city is currently null, so any college
 * that already has a distinct city set (created another way) is untouched.
 * Updates this app's own database and the main app's mirror table, same as
 * every other write here.
 *
 * Usage: npx tsx --env-file=.env scripts/backfill-city-from-district.ts
 */
import { prisma } from '../server/db/ops-prisma';
import { queryMainDb } from '../server/db/main-db-pool';

async function main() {
  const opsResult = await prisma.$executeRaw`
    UPDATE colleges SET city = district, "updatedAt" = NOW()
    WHERE city IS NULL AND district IS NOT NULL
  `;
  console.log(`ops-next: backfilled city on ${opsResult} college(s).`);

  const mainRows = await queryMainDb(`
    UPDATE platform_colleges SET city = district, "updatedAt" = NOW()
    WHERE city IS NULL AND district IS NOT NULL
    RETURNING id
  `);
  console.log(`main app: backfilled city on ${mainRows.length} college(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
