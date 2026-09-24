# Primer (job-radar) — start here

Read these first, in order:
1. `docs/STATUS.md` — what Primer is, every decision made so far, current status, to-dos.
2. `docs/roadmap.md` — the next features (company pages, US map, better at-a-glance parsing).
3. `DESIGN.md` — the design system (Contemporan style). Match it in any UI work.
4. `apps/web/AGENTS.md` — Next.js 16 notes (proxy.ts instead of middleware, async params).
5. `docs/setup-*.md` — how each feature was deployed (SQL must run in Supabase BEFORE pushing).

Layout: `packages/shared` (ATS adapters, classify, details/dates/audience parsers), `packages/worker`
(poller run by GitHub Actions every 10 min), `apps/web` (Next.js site on Vercel), `supabase/migrations`
(run by hand in the Supabase SQL editor), `seed/companies.csv` (watched companies).

Rules: commits authored by Andy, no AI attribution lines. Cost must stay $0. Never scrape search pages;
use public APIs/feeds. Tests: `npm test` (root) and `npm test` in apps/web; also `npm run typecheck`.
