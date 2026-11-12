import assert from 'node:assert/strict';
import test from 'node:test';

// env.ts requires this at import; the fake client below means no query reaches a database.
process.env.BILLING_HANDOFF_SECRET ??= 'test';

const CONFIRMED_COUNT = /FROM participants( p)?\s[^)]*status <> 'PENDING_PAYMENT'/;

test('ops shows confirmed counts, the unpaid split, and bases seat usage on confirmed', async () => {
  const { mainDbPool } = await import('../../db/main-db-pool');
  const { OverviewRepository } = await import('../overview/overview.repository');
  const { OrganizationsRepository } = await import('./organizations.repository');
  const { InstitutionRepository } = await import('../institution/institution.repository');

  let queries: string[] = [];
  const fakeClient = {
    query: async (text: string) => {
      queries.push(text);
      return { rows: [] };
    },
    release: () => {},
  };
  test.mock.method(mainDbPool, 'connect', async () => fakeClient);

  const overview = new OverviewRepository();
  const orgs = new OrganizationsRepository();
  const sqlOf = async (call: () => Promise<unknown>) => {
    queries = [];
    await call().catch(() => {}); // rows are empty; only the SQL matters
    return queries.join('\n');
  };

  const withBreakdown = [
    () => overview.getParticipantStats(),
    () => overview.getUpcomingContests(),
    () => orgs.getOrganizationsList({ status: 'all', page: 1, limit: 10 }),
    () => orgs.getOrganizationDetail('org'),
    () => orgs.getOrganizationContests('org'),
  ];
  for (const call of withBreakdown) {
    const sql = await sqlOf(call);
    assert.match(sql, /FROM participants\s+WHERE[^)]*participants\.status <> 'PENDING_PAYMENT'/, sql);
    assert.match(sql, /'pending'[\s\S]*'failed'/, sql);
  }

  const confirmedOnly = [
    () => orgs.getUsageSnapshot('org', new Date(), new Date()),
    () => new InstitutionRepository().getOrgSummary('org'),
  ];
  for (const call of confirmedOnly) {
    const sql = await sqlOf(call);
    assert.match(sql, CONFIRMED_COUNT, sql);
  }
});
