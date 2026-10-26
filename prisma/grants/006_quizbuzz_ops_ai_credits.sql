-- Main-app (quizbuzz) database grant for AI credits on the organization page.
--
-- SELECT: the AI credits tile (this month's spend, the org's credit balance).
-- INSERT/UPDATE: "Give bonus credits" adds to ai_credit_accounts.balance, creating
-- the row if the org has never used AI (Quizbuzz-new migration 20261026125416_ai_credit_pool).
--
-- Run against the MAIN APP database (quizbuzz), after that migration has run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/006_quizbuzz_ops_ai_credits.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

GRANT SELECT, INSERT, UPDATE ON ai_credit_accounts TO quizbuzz_ops_reader;
