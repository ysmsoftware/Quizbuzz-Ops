/** Runs the same plan catalogue sync as instrumentation.ts does on boot. Used by `npm run db:seed`. */
import { prisma } from '../server/db/ops-prisma';
import { syncPlanCatalogue } from '../server/features/plans/plan-catalogue';

syncPlanCatalogue(prisma)
  .then((created) => console.log('[sync-plan-catalogue] created:', created.length ? created : '(none)'))
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
