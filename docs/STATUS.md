# Primer (job-radar): status & decisions

Code: this repo (public, github.com/andydo4/job-radar). Live site: Vercel project in apps/web (primer-apps.vercel.app).

## Decisions
- Product name: **Primer** (user-facing). Repo, folder and cron URL stay `job-radar`.
- Users: Andy + 1 friend. Website only, no email (a daily digest is parked as a future opt-in).
- Friend: all biotech job families + life-science consulting + biotech VC + a Grad Programs tracker she fills in herself. Andy's own SWE jobs are Phase 3.
- Location: **US only** (including US remote). Boston/NYC sorted first, then East/West Coast + remote, then the rest of the US.
- Stack: Next.js 16 on Vercel (root dir `apps/web`), Supabase, Google sign-in (email allowlist), GitHub Actions poller started by cron-job.org every 10 min. $0/month.
- Design: `DESIGN.md` = Contemporan style (#0000F2 blue, #EDFF45 lime, Playfair Display, Geist Mono, 1px corners). Text on lime is always #0a0a23 (`text-on-lime`). Light/Auto/Dark switch saved in the `primer-theme` cookie.
- Commits are authored by Andy (andydo4 / andrewhuudo@gmail.com), with no AI attribution lines.
- Keys: the publishable key goes in Vercel. The secret key goes ONLY in GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
- Profile "degree" = highest degree finished or finishing. For you shows postings up to one degree step above yours (PhD-only needs a PhD) and up to your years (+1 for MS, +2 for PhD) + 1 of experience.
- Profile "after_grad" (work / maybe / grad) + grad_month drive graduation rules: internships starting after graduation or for another class year are hidden from For you when "work", a Stretch when "maybe"/"grad" (unless undergrad-only). `qualify()` and `timelineTag()` in apps/web/lib/profile.ts.
- A Save/Applied/Hide mark is stored once per role (on the listing shown); any hidden listing hides the whole role.
- Starred / hidden companies are per person. Hidden companies drop out of For you and All unless picked in the Company dropdown.
- Consulting counts only when it's life-science/health consulting (or the practice isn't named); cyber/tech/antitrust/energy etc. are "other" (classify.ts).
- Term / dates / length / deadline / class year / student level are read with pattern rules (packages/shared/src/dates.ts, audience.ts), no AI. Unclear wording = blank, never guessed.
- Companies on their own careers sites are read from the public feed they publish for search engines (RSS or sitemap + schema.org JobPosting on each job page), never by scraping search pages.
- "Newest posted" sorts by the company's posted date (else when found); backlog jobs without a date go last (apps/web/lib/sort.ts).

## Status (2026-09-24)
- Migrations 0001–0006 all run in Supabase (0006 includes careersite, audience columns, profiles.after_grad).
- Migration 0007 (`supabase/migrations/0007_glance.sql`) created: adds work_model, work_model_detail, visa_sponsorship, travel, clearance_required, housing, application_extras; updates `update_job_details`. (Run in Supabase before pushing worker).
- Website: For you / All / Saved / Applied / Hidden; qualify + timeline tags; new since last visit; Save/Applied/Hide; `/go/[id]` apply-time check; PWA; filter bar (quick toggles, Filters panel, multi-select types, pills); filters remembered per device; star/hide companies; company name links to its listings.
- Companies: ~100 in seed/companies.csv incl. 25+ Workday big pharma/tools/CROs and 3 careersite boards (AbbVie, Bayer, Boehringer).
- Poller: Workday US-only via the board's country facet; ≤3 big-board full reads per run; careers-site feeds hourly; backfill 120 job pages/run for showable roles; DETAILS_VERSION 4 (re-processes open jobs for at-a-glance fields).
- **Company pages** (`/companies/[id]`): built 2026-09-24. Header with name, segment, open-role count, Star/Hide buttons, Careers site link. 4-metric StatCard grid (open roles, internships, full-time, new recently), role kind filter chips (All, Internships, Full-time), sort options (Newest, Deadline, Pay), and all open jobs grouped by role family with glance badges.
- **At-a-glance parsing**: built 2026-09-24 (`packages/shared/src/glance.ts`, 55 tests). Pure pattern extraction for: work model (remote/hybrid days/on-site), visa sponsorship, travel, security clearance, internship housing, and application extras (cover letter, transcript, references, coding test, case study). Surfaced on card badge row (work model, no-visa alert), card Details dropdown ("At a glance" badges), and job detail page 4-column fact grid.

## To do
- **DB action**: run `supabase/migrations/0007_glance.sql` in Supabase SQL editor.
- See docs/roadmap.md (US map is next when Andy wants it). Company pages and At-a-glance parsing are **done**.
- Check possible wrong-company matches before adding: orbital, candid, genesis, nabla, caribou, scribe, resilience, seer, latch, watershed, cello, polaris.
- Still missing: Novo Nordisk (custom JSON at novonordisk.com/bin/nncorp/careersearch), Teva, Astellas/Daiichi/CSL/Organon/Zoetis/Viatris (Workday guesses in candidates.csv: run `npm run discover`), most consulting/VC/institutes.
- Hardening: disable the Supabase Email provider; after the friend's first sign-in, turn off "Allow new users to sign up".
