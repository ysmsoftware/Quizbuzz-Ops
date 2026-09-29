-- Main-app (quizbuzz) database grant for the Payments page's order history.
--
-- Read-only, same posture as 001_quizbuzz_ops_reader.sql. payment_orders is the
-- main app's history of every Razorpay order created per payment (added in
-- Quizbuzz-new migration 20260929164414_payment_order_history).
--
-- Run against the MAIN APP database (quizbuzz), after that migration has run:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -f prisma/grants/005_quizbuzz_ops_payment_orders.sql
--
-- Safe to re-run: GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

GRANT SELECT ON payment_orders TO quizbuzz_ops_reader;
