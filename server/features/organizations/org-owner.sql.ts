/**
 * SQL fragments for "who owns this organization", shared by the org list, org detail and
 * overview "recent organizations".
 *
 * They are correlated subqueries with LIMIT 1 on purpose: a plain LEFT JOIN against
 * org_members / contacts multiplies the organization row by its number of owners/contacts
 * (the "same org repeated 4×" bug on the Overview page).
 *
 * Fallbacks (first contact, then a placeholder) exist only so the admin UI always has
 * something to render; never use these to decide who to email — see
 * OrganizationsRepository.getOwnerContact for the strict lookup.
 */

const OWNER_ADMIN = (orgAlias: string, column: string) => `
  SELECT ${column}
  FROM admins a
  JOIN org_members om ON om."adminId" = a.id
  WHERE om."organizationId" = ${orgAlias}.id AND om.role = 'OWNER'
  ORDER BY om."createdAt" ASC
  LIMIT 1`;

export const ownerNameSql = (orgAlias = 'o'): string => `COALESCE(
  (${OWNER_ADMIN(orgAlias, `a."firstName" || ' ' || COALESCE(a."lastName", '')`)}),
  (SELECT c."firstName" || ' ' || COALESCE(c."lastName", '') FROM contacts c WHERE c."organizationId" = ${orgAlias}.id ORDER BY c."createdAt" ASC LIMIT 1),
  'Unknown Owner'
)`;

export const ownerEmailSql = (orgAlias = 'o'): string => `COALESCE(
  (${OWNER_ADMIN(orgAlias, 'a.email')}),
  (SELECT c.email FROM contacts c WHERE c."organizationId" = ${orgAlias}.id ORDER BY c."createdAt" ASC LIMIT 1),
  'unknown@org.com'
)`;
