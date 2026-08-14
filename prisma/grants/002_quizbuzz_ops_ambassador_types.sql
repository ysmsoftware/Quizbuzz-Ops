-- Main-app (quizbuzz) database grants for the Ambassador Type catalog mirror.
--
-- Same posture as 001_quizbuzz_ops_reader.sql: ops never runs migrations against the main app
-- database, and only gets the narrow write access this feature actually needs — INSERT/UPDATE
-- (via upsert) on the two tables ambassador-types.repository.ts's syncTypeToMainApp /
-- syncOrgAccessToMainApp write through to. See ambassador-incentive-program-plan.md §0.3 and
-- ambassador-backend-implementation-guide.md §3 for what these tables are and who reads them
-- (Quizbuzz-new's backend/src/common/ambassador-types.ts, read-only).
--
-- Run against the MAIN APP database (quizbuzz), after 001_quizbuzz_ops_reader.sql and after
-- Quizbuzz-new's own `add_ambassador_program` migration has created these tables:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/002_quizbuzz_ops_ambassador_types.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

GRANT INSERT, UPDATE ON platform_ambassador_types TO quizbuzz_ops_reader;
GRANT INSERT, UPDATE ON organization_ambassador_type_access TO quizbuzz_ops_reader;
