-- Main-app (quizbuzz) database grants for the College/Department catalog mirror.
--
-- Same posture as 001_quizbuzz_ops_reader.sql and 002_quizbuzz_ops_ambassador_types.sql: ops never
-- runs migrations against the main app database, and only gets the narrow write access this
-- feature actually needs — INSERT/UPDATE (via upsert) on the two tables
-- colleges.repository.ts's syncCollegeToMainApp / syncDepartmentToMainApp write through to,
-- plus DELETE for deleteCollegeFromMainApp (added alongside the ops-next College delete
-- feature — see colleges.repository.ts).
--
-- Run against the MAIN APP database (quizbuzz), after 001_quizbuzz_ops_reader.sql and after
-- Quizbuzz-new's own migration adding platform_colleges/platform_departments has run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/003_quizbuzz_ops_colleges.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres. If this is a re-run to pick up
-- just the new DELETE grant, running the whole file again is still correct and harmless — the
-- earlier INSERT/UPDATE grants are no-ops the second time.

\set ON_ERROR_STOP on

GRANT INSERT, UPDATE, DELETE ON platform_colleges TO quizbuzz_ops_reader;
GRANT INSERT, UPDATE, DELETE ON platform_departments TO quizbuzz_ops_reader;
