-- Main-app (quizbuzz) database grant for changing an organization's type from ops.
--
-- The org's type (organization_profiles."profileType", Quizbuzz-new migration
-- 20261027053416_org_profile_type) is set by the owner at onboarding and after that
-- only by ops ("Modify tenant details"). INSERT covers orgs that never reached the
-- onboarding step that creates their profile row; every other column uses its default.
--
-- Run against the MAIN APP database (quizbuzz), after that migration has run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/007_quizbuzz_ops_org_profile_type.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

GRANT INSERT (id, "organizationId", "profileType", "updatedAt") ON organization_profiles TO quizbuzz_ops_reader;
GRANT UPDATE ("profileType", "updatedAt") ON organization_profiles TO quizbuzz_ops_reader;
