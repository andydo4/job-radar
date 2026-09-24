# Primer roadmap (next up)

Requested by Andy on 2026-09-24. Not built yet.

## 1. Interactive US map
A map view (tab or toggle on Jobs) of the US; each state shaded by how many open jobs match the current
filters; click a state → the list filtered to that state (`?state=MA`).
Needs: a `state` column (2-letter code) on jobs, filled by the classifier from locations (classify.ts
already finds US state codes), plus a remote bucket. Map: inline SVG of US states (public-domain
paths), no map library needed. Mobile: tap a state, list below.

## Done 2026-09-24 (for reference)
Better "at a glance" parsing: `packages/shared/src/glance.ts` extracts work model (remote/hybrid days/on-site), visa sponsorship, travel %, security clearance, internship housing, and application extras (cover letter, transcript, references, etc.). Surfaced on card badge row (work model, no-visa alert), Details dropdown ("At a glance" section), and job detail page 4-column fact grid. DETAILS_VERSION bumped to 4. Migration 0007_glance.sql.
Company pages (`/companies/[id]`): company name on every job card, job detail page, and Settings company list links to `/companies/[id]`. Page shows name, segment, 4-metric StatCard grid (open roles, internships, full-time, new), kind filter chips (All, Internships, Full-time), sort options (Newest, Deadline, Pay), Star/Hide buttons, Careers site link, and all open jobs grouped by role family with glance badges. `getCompany()` added to `lib/jobs.ts`.
Timeline tag on every card: "Full-time · after you graduate" / "During undergrad · Remote|On-site" /
"Grad-school internship" / "Internship after you graduate" (`timelineTag` in apps/web/lib/profile.ts).
