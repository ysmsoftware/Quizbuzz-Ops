-- Main-app (quizbuzz) database grant for the ops contest list's quiz mode (sections count;
-- server/features/organizations/organizations.repository.ts getOrganizationContests).
--
-- The table comes from Quizbuzz-new migration 20261127123412_contest_sections.
--
-- Run against the MAIN APP database (quizbuzz), after that migration has run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/009_quizbuzz_ops_quiz_settings.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.
--
-- To check first, run this as any user (false = the grant below is needed):
--   SELECT has_table_privilege('quizbuzz_ops_reader', 'contest_sections', 'SELECT');

GRANT SELECT ON contest_sections TO quizbuzz_ops_reader;
