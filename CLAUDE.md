@AGENTS.md

# Qaselo ops console (repo: quizbuzz-ops-next)

Internal ops dashboard for Qaselo (formerly QuizBuzz): organizations, plans, billing and invoices, feature flags (OPT_IN per org), platform settings, reference data. It has its own Postgres DB and also writes into the main app's DB via `queryMainDb()` as `quizbuzz_ops_reader` (grants in `prisma/grants/*.sql`, hand-written on purpose). Internal names (`quizbuzz_*` roles, DBs, prefixes) keep the old brand. Don't rename them.

**Read `../Quizbuzz-new/knowledge-transfer/README.md` first.** The same owner rules apply here: never commit or stage, no Claude attribution, pushing `main` deploys, keep this repo on the same branch as `../Quizbuzz-new`, run `prisma migrate dev` only (except the grants SQL), no credentials in code or docs (seed with env vars). Per-machine rules: `CLAUDE.local.md`.

Layout: `app/` (UI routes), `components/`, `server/features/<slice>/` (repository/service/routes), `server/workers`, `server/templates` (emails; layout matches the main app's), `prisma/`. All mail is sent from `SMTP_FROM` (support@ysminfosolution.com) until the email provider for qaselo.com is chosen.
