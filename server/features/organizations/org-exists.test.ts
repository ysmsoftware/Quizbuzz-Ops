import assert from 'node:assert/strict';
import test from 'node:test';

// env.ts requires this at import; the fake client below means no query reaches a database.
process.env.BILLING_HANDOFF_SECRET ??= 'test';

test('assertOrgExists rejects an organization the main app does not have', async () => {
  const { mainDbPool } = await import('../../db/main-db-pool');
  const { assertOrgExists } = await import('./org-exists');

  let rows: unknown[] = [];
  test.mock.method(mainDbPool, 'connect', async () => ({ query: async () => ({ rows }), release: () => {} }));

  await assert.rejects(assertOrgExists('missing'), /Organization not found/);
  rows = [{ name: 'Real Org' }];
  assert.equal(await assertOrgExists('real'), 'Real Org');
});
