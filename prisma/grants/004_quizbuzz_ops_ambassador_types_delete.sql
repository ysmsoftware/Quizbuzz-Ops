-- Main-app (quizbuzz) database grant for the Ambassador Type delete feature.
--
-- Adds DELETE to the INSERT/UPDATE already granted by 002_quizbuzz_ops_ambassador_types.sql, for
-- ambassador-types.repository.ts's deleteTypeFromMainApp. Without it the ops-side delete still
-- succeeds but the main-app mirror keeps the type (the write-through failure is only logged).
--
-- Run against the MAIN APP database (quizbuzz):
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/004_quizbuzz_ops_ambassador_types_delete.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

GRANT DELETE ON platform_ambassador_types TO quizbuzz_ops_reader;
GRANT DELETE ON organization_ambassador_type_access TO quizbuzz_ops_reader;
