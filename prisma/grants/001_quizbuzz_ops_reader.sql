-- Main-app (quizbuzz) database role for the ops dashboard.
--
-- Ops never runs migrations against the main app database — this script is the only
-- thing that grants ops write access, and only to the narrow, explicitly-approved
-- columns documented in docs/ops-dashboard-database-and-data-flows.md §3.
--
-- Run against the MAIN APP database (quizbuzz), not quizbuzz_ops:
--   psql "$MAIN_DATABASE_URL_AS_SUPERUSER" -v ops_reader_password='<set a real secret>' \
--     -f prisma/grants/001_quizbuzz_ops_reader.sql
--
-- Safe to re-run: role creation is guarded, GRANT statements are idempotent in Postgres.

\set ON_ERROR_STOP on

-- \gexec runs whatever the query returns as SQL. Kept outside any $$ ... $$ block
-- deliberately — psql does not interpolate :'vars' inside dollar-quoted bodies.
SELECT 'CREATE ROLE quizbuzz_ops_reader LOGIN PASSWORD ' || quote_literal(:'ops_reader_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'quizbuzz_ops_reader')
\gexec

GRANT CONNECT ON DATABASE quizbuzz TO quizbuzz_ops_reader;
GRANT USAGE ON SCHEMA public TO quizbuzz_ops_reader;

-- Phase 1/2 reads (Overview, Organizations, subscription usage queries)
GRANT SELECT ON
  organizations,
  organization_profiles,
  org_members,
  admins,
  contests,
  "PaymentConfig",
  contacts,
  participants,
  payments,
  submissions,
  leaderboard_entries,
  certificates,
  proctoring_events,
  proctoring_scores,
  message_logs,
  scheduled_jobs,
  contest_analytics_snapshots
TO quizbuzz_ops_reader;

-- Payout milestone reads (ops-dashboard-backend-payouts-guide.md)
GRANT SELECT ON
  organization_payout_accounts,
  payment_route_transfers
TO quizbuzz_ops_reader;

-- Phase 1/2 narrow writes: suspend/reactivate, plan cache write-through.
-- Column is "planStatus" — the main app has since fixed the "planStaus" typo that
-- docs/ops-dashboard-database-and-data-flows.md originally flagged as unresolved
-- (confirmed live 2026-07-21 against the main app's actual schema).
GRANT UPDATE ("isActive", "planSlug", "planStatus", "planLimitsCache")
  ON organizations TO quizbuzz_ops_reader;

-- Payout milestone narrow writes: attach linked account, status changes
-- (statusReason added 2026-07-21 alongside the main-app schema change in
-- Quizbuzz-new/payout-manual-onboarding-ux-plan.md §3 — lets a billing admin's
-- rejection reason reach the org-facing UI)
GRANT UPDATE ("status", "razorpayLinkedAccountId", "activatedAt", "statusReason")
  ON organization_payout_accounts TO quizbuzz_ops_reader;
