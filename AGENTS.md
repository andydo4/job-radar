# Primer (job-radar) — start here

Read these first, in order:
1. `docs/STATUS.md` — what Primer is, every decision made so far, current status, to-dos.
2. `docs/roadmap.md` — ideas for what to build next.
3. `DESIGN.md` — the design system (Contemporan style). Match it in any UI work.
4. `apps/web/AGENTS.md` — Next.js 16 notes (proxy.ts instead of middleware, async params).
5. `docs/setup-*.md` — how each feature was deployed (SQL must run in Supabase BEFORE pushing).

Layout: `packages/shared` (ATS adapters, classify, details/dates/audience/glance parsers), `packages/worker`
(poller run by GitHub Actions every 10 min), `apps/web` (Next.js site on Vercel), `supabase/migrations`
(run by hand in the Supabase SQL editor), `seed/companies.csv` (watched companies).

Gotchas (learned the hard way):
- Supabase returns at most 1,000 rows per request: read big lists in pages (see `loadRows` in apps/web/lib/jobs.ts).
- The Jobs list/map read light columns for all matching rows, then load full rows only for visible cards (`hydrate`).
- Changing how jobs are parsed? Bump `DETAILS_VERSION` in packages/worker/src/db.ts so saved jobs get re-read.
- New board type? Widen `companies_ats_check` in a migration, and add it to `Ats` (shared types + apps/web/lib/live-check.ts).
- Microsoft (Eightfold) rate-limits after ~8 quick requests; its reader goes slowly and never closes jobs.
- Location parsing: "City, Region, DE" is Germany, not Delaware (`foreignCountryCode`); "Indianapolis IN" has no comma.

Rules: commits authored by Andy, no AI attribution lines. Cost must stay $0. Never scrape search pages;
use public APIs/feeds. Tests: `npm test` (root) and `npm test` in apps/web; also `npm run typecheck`.
