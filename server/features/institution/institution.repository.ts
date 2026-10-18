import { queryMainDb } from '../../db/main-db-pool';
import { INSTITUTION_FLAG_KEYS } from '../../../lib/constants/institution';
import { OrgInstitutionSummary, InstitutionPlatformStats } from './institution.types';

/**
 * SQL for "an organization effectively has OPT_IN flag X": the global switch is on AND the org has a
 * live (enabled, not expired) override. Evaluated on the main app's mirrored tables — the ones it
 * actually enforces — so it is also correct for grants written outside Ops (e.g. a seed script).
 * All five institution flags are OPT_IN.
 */
export const effectiveOptInKeysSql = (orgRef: string, keysParam: string): string => `
  ARRAY(
    SELECT f.key
    FROM organization_feature_flag_overrides f
    JOIN platform_feature_flags g ON g.key = f.key
    WHERE f."organizationId" = ${orgRef}
      AND f.key = ANY(${keysParam}::text[])
      AND f."isEnabled" AND g."isEnabled"
      AND (f."expiresAt" IS NULL OR f."expiresAt" > (NOW() AT TIME ZONE 'UTC'))
    ORDER BY f.key
  )`;

const toInt = (v: unknown) => Number(v ?? 0);

export class InstitutionRepository {
  async getOrgSummary(orgId: string): Promise<OrgInstitutionSummary> {
    const [learners, groups, groupLearners, contests, assigned, gradebook, marksheets] = await Promise.all([
      queryMainDb(
        `SELECT
           COUNT(*) FILTER (WHERE "isDeleted" = false)::int AS contacts,
           COUNT(*) FILTER (WHERE "isDeleted" = false AND "learnerStatus" = 'ACTIVE')::int AS "activeLearners",
           COUNT(*) FILTER (WHERE "isDeleted" = false AND "learnerStatus" = 'ALUMNI')::int AS alumni,
           COUNT(*) FILTER (WHERE "isDeleted" = false AND "portalAccess")::int AS "portalEnabled",
           MAX("portalLastLoginAt") AS "lastPortalLogin"
         FROM contacts WHERE "organizationId" = $1`,
        [orgId]
      ),
      queryMainDb(
        `SELECT COUNT(*)::int AS total, COALESCE(MAX(depth) + 1, 0)::int AS levels FROM learner_groups WHERE "organizationId" = $1`,
        [orgId]
      ),
      queryMainDb(
        `SELECT COUNT(DISTINCT "contactId")::int AS n FROM learner_group_memberships WHERE "organizationId" = $1 AND "leftAt" IS NULL`,
        [orgId]
      ),
      queryMainDb(
        `SELECT "timingMode", audience, "questionSelection", status, COUNT(*)::int AS n
         FROM contests WHERE "organizationId" = $1 AND "isDeleted" = false GROUP BY 1, 2, 3, 4`,
        [orgId]
      ),
      queryMainDb(
        `SELECT p.status, COUNT(*)::int AS n
         FROM participants p JOIN contests c ON c.id = p."contestId"
         WHERE p."organizationId" = $1 AND c.audience = 'ASSIGNED' AND c."isDeleted" = false GROUP BY p.status`,
        [orgId]
      ),
      queryMainDb(
        `SELECT
           (SELECT COUNT(*) FROM gradebook_categories WHERE "organizationId" = $1 AND "archivedAt" IS NULL)::int AS categories,
           (SELECT COUNT(*) FROM academic_terms WHERE "organizationId" = $1)::int AS terms,
           (SELECT COUNT(*) FROM contests WHERE "organizationId" = $1 AND "isDeleted" = false AND "includeInGradebook")::int AS "contestsIncluded"`,
        [orgId]
      ),
      queryMainDb(`SELECT status, COUNT(*)::int AS n FROM marksheets WHERE "organizationId" = $1 GROUP BY status`, [orgId]),
    ]);

    const c = {
      total: 0,
      byTimingMode: { SCHEDULED: 0, WINDOW: 0 },
      byAudience: { PUBLIC: 0, PRIVATE_LINK: 0, ASSIGNED: 0 },
      byQuestionSelection: { ALL: 0, SETS: 0, POOL: 0 },
      liveWindow: 0,
    };
    for (const r of contests) {
      const n = toInt(r.n);
      c.total += n;
      c.byTimingMode[r.timingMode as 'SCHEDULED' | 'WINDOW'] += n;
      c.byAudience[r.audience as 'PUBLIC' | 'PRIVATE_LINK' | 'ASSIGNED'] += n;
      c.byQuestionSelection[r.questionSelection as 'ALL' | 'SETS' | 'POOL'] += n;
      if (r.timingMode === 'WINDOW' && r.status === 'LIVE') c.liveWindow += n;
    }

    const byStatus = (rows: Array<{ status: string; n: unknown }>) =>
      Object.fromEntries(rows.map((r) => [r.status, toInt(r.n)]));
    const assignedByStatus = byStatus(assigned);
    const marksheetByStatus = byStatus(marksheets);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

    const l = learners[0] ?? {};
    return {
      learners: {
        contacts: toInt(l.contacts),
        activeLearners: toInt(l.activeLearners),
        alumni: toInt(l.alumni),
        portalEnabled: toInt(l.portalEnabled),
        lastPortalLogin: l.lastPortalLogin ? new Date(l.lastPortalLogin).toISOString() : null,
      },
      groups: { total: toInt(groups[0]?.total), levels: toInt(groups[0]?.levels), learnersInGroups: toInt(groupLearners[0]?.n) },
      contests: c,
      assigned: { total: sum(assignedByStatus), byStatus: assignedByStatus },
      gradebook: {
        categories: toInt(gradebook[0]?.categories),
        terms: toInt(gradebook[0]?.terms),
        contestsIncluded: toInt(gradebook[0]?.contestsIncluded),
        marksheets: { total: sum(marksheetByStatus), byStatus: marksheetByStatus },
      },
    };
  }

  /** Platform-wide adoption numbers for the Overview page (organizations not deleted). */
  async getPlatformStats(): Promise<InstitutionPlatformStats> {
    const [adoption, totals] = await Promise.all([
      queryMainDb(
        `SELECT f.key, COUNT(DISTINCT f."organizationId")::int AS n
         FROM organization_feature_flag_overrides f
         JOIN platform_feature_flags g ON g.key = f.key
         JOIN organizations o ON o.id = f."organizationId" AND o."isDeleted" = false
         WHERE f.key = ANY($1::text[]) AND f."isEnabled" AND g."isEnabled"
           AND (f."expiresAt" IS NULL OR f."expiresAt" > (NOW() AT TIME ZONE 'UTC'))
         GROUP BY f.key`,
        [INSTITUTION_FLAG_KEYS]
      ),
      queryMainDb(
        `SELECT
           (SELECT COUNT(*) FROM contacts c JOIN organizations o ON o.id = c."organizationId" AND o."isDeleted" = false
              WHERE c."isDeleted" = false AND c."learnerStatus" = 'ACTIVE')::int AS "activeLearners",
           (SELECT COUNT(*) FROM contacts c JOIN organizations o ON o.id = c."organizationId" AND o."isDeleted" = false
              WHERE c."isDeleted" = false AND c."portalAccess")::int AS "portalEnabled",
           (SELECT COUNT(*) FROM learner_groups lg JOIN organizations o ON o.id = lg."organizationId" AND o."isDeleted" = false)::int AS groups,
           (SELECT COUNT(*) FROM contests c JOIN organizations o ON o.id = c."organizationId" AND o."isDeleted" = false
              WHERE c."isDeleted" = false AND c."timingMode" = 'WINDOW')::int AS "windowContests",
           (SELECT COUNT(*) FROM contests c JOIN organizations o ON o.id = c."organizationId" AND o."isDeleted" = false
              WHERE c."isDeleted" = false AND c."timingMode" = 'WINDOW' AND c.status = 'LIVE')::int AS "liveWindowContests"`
      ),
    ]);

    const orgsByFeature = Object.fromEntries(INSTITUTION_FLAG_KEYS.map((k) => [k, 0]));
    adoption.forEach((r) => (orgsByFeature[r.key] = toInt(r.n)));
    const t = totals[0] ?? {};
    return {
      orgsByFeature,
      activeLearners: toInt(t.activeLearners),
      portalEnabled: toInt(t.portalEnabled),
      groups: toInt(t.groups),
      windowContests: toInt(t.windowContests),
      liveWindowContests: toInt(t.liveWindowContests),
    };
  }
}
export default InstitutionRepository;
