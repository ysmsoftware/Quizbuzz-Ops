import { queryMainDb } from '../../db/main-db-pool';
import { NotFoundError } from '../../http/errors';

/** Ops stores organization ids without a foreign key to the main app, so operator actions check here first. Returns its name. */
export async function assertOrgExists(orgId: string): Promise<string> {
  const rows = await queryMainDb<{ name: string }>(`SELECT name FROM organizations WHERE id = $1 AND "isDeleted" = false`, [orgId]);
  if (rows.length === 0) throw new NotFoundError('Organization not found');
  return rows[0].name;
}

/** Which of these organizations still exist and aren't soft-deleted (their ops subscription rows outlive a delete). */
export async function liveOrgIds(orgIds: string[]): Promise<Set<string>> {
  const rows = await queryMainDb<{ id: string }>(
    `SELECT id FROM organizations WHERE id = ANY($1::text[]) AND "isDeleted" = false`,
    [orgIds]
  );
  return new Set(rows.map((r) => r.id));
}
