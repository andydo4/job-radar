# Primer roadmap (next up)


## Next ideas
- Meta reader (needs a token from the page); Workday big tech (Adobe, Intel, PayPal, Capital One, Qualcomm): add via `npm run discover` with a job link.
- Novo Nordisk reader; `npm run discover` for Teva, Astellas, Daiichi Sankyo, CSL, Organon, Zoetis, Viatris.
- Map v2 (maybe): city hotspot dots; optional visa filter (data is stored); optional email digest.

## Done 2026-09-24 (for reference)
US map: List / Map switch on Jobs, states shaded by matching roles, click/tap a state for its roles and city breakdown, pinch-zoom on phones. See docs/setup-map.md and STATUS.md.
Better "at a glance" parsing: `packages/shared/src/glance.ts` extracts work model (remote/hybrid days/on-site), visa sponsorship, travel %, security clearance, internship housing, and application extras (cover letter, transcript, references, etc.). Surfaced on card badge row (work model, no-visa alert), Details dropdown ("At a glance" section), and job detail page 4-column fact grid. DETAILS_VERSION bumped to 4. Migration 0007_glance.sql.
Company pages (`/companies/[id]`): company name on every job card, job detail page, and Settings company list links to `/companies/[id]`. Page shows name, segment, 4-metric StatCard grid (open roles, internships, full-time, new), kind filter chips (All, Internships, Full-time), sort options (Newest, Deadline, Pay), Star/Hide buttons, Careers site link, and all open jobs grouped by role family with glance badges. `getCompany()` added to `lib/jobs.ts`.
Timeline tag on every card: "Full-time · after you graduate" / "During undergrad · Remote|On-site" /
"Grad-school internship" / "Internship after you graduate" (`timelineTag` in apps/web/lib/profile.ts).
