# Primer roadmap (next up)

Requested by Andy on 2026-09-24. Not built yet.

## 1. Interactive US map
A map view (tab or toggle on Jobs) of the US; each state shaded by how many open jobs match the current
filters; click a state → the list filtered to that state (`?state=MA`).
Needs: a `state` column (2-letter code) on jobs, filled by the classifier from locations (classify.ts
already finds US state codes), plus a remote bucket. Map: inline SVG of US states (public-domain
paths), no map library needed. Mobile: tap a state, list below.

## 3. Better "at a glance" parsing of full descriptions
Goal: everything needed to decide, without opening the description. Candidates to extract
(pattern rules first, as in `packages/shared/src/details.ts` / `dates.ts` / `audience.ts`):
- work model: on-site / hybrid (N days) / remote, and which office
- visa sponsorship: offered / not offered ("must be authorized to work… without sponsorship")
- schedule: shift work, weekends, nights, travel %
- must-have skills vs nice-to-have (split the requirements list)
- relocation support, signing bonus, housing (internships)
- application steps: cover letter, transcript, references, coding/case interview
Show as a compact "At a glance" block on the card's Details dropdown and job page.
If pattern rules miss too much, add a free AI pass only for jobs where fields are blank.

## Done 2026-09-24 (for reference)
Company pages (`/companies/[id]`): company name on every job card, job detail page, and Settings company list links to `/companies/[id]`. Page shows name, segment, open-role count, Star/Hide buttons, Careers site link, and all open jobs grouped by role family. `getCompany()` added to `lib/jobs.ts`.
Timeline tag on every card: "Full-time · after you graduate" / "During undergrad · Remote|On-site" /
"Grad-school internship" / "Internship after you graduate" (`timelineTag` in apps/web/lib/profile.ts).
