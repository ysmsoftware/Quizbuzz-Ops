-- Main-app (quizbuzz) database grant for the ops institution summary and platform stats
-- (server/features/institution/institution.repository.ts), which count these tables.
--
-- The tables come from Quizbuzz-new migrations 20261006183847_learner_groups,
-- 20261009063151_gradebook and 20261009071323_gradebook_terms_marksheets.
--
-- Run against the MAIN APP database (quizbuzz), after those migrations have run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/008_quizbuzz_ops_institution.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.
--
-- To check first, run this as any user (false = the grant below is needed):
--   SELECT t, has_table_privilege('quizbuzz_ops_reader', t, 'SELECT')
--   FROM unnest(ARRAY['learner_groups','learner_group_memberships','academic_terms','gradebook_categories','marksheets']) t;

GRANT SELECT ON
  learner_groups,
  learner_group_memberships,
  academic_terms,
  gradebook_categories,
  marksheets
TO quizbuzz_ops_reader;
