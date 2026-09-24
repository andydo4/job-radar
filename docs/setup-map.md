# US map: setup

## 1. Run the migration (before pushing)
Supabase -> SQL Editor -> New query -> paste all of `supabase/migrations/0008_map.sql` -> Run.
It adds `jobs.states` and `jobs.places`, extends `update_job_details`, and hides careers-site
listings that were saved as US by mistake (e.g. Bayer's German "…, DE" = not Delaware).
Requires 0007. Safe to re-run.

## 2. Push
The poller saves states for new jobs right away. Jobs already saved get them from the details
backfill (DETAILS_VERSION 6), about 1,000 per run (every 10 minutes), so the map fills in within an hour or two.
Until then, older jobs count under "No state listed".

## 3. Use it
Jobs -> Map (next to the tabs). The choice is remembered with your filters.

## Regenerating the state outlines (rarely needed)
`apps/web/lib/us-map-shapes.ts` was generated from us-atlas `states-albers-10m.json` (US Census
cartographic boundaries, public domain), simplified with topojson-simplify (weight 2), paths
from d3-geo `geoPath().digits(1)`, label points = centroids with a few hand fixes (FL, MI, LA, ...).
