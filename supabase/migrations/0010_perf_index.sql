-- Primer: Performance indexes for jobs list & map
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0001-0009.

-- 1. Index covering open US jobs with the exact sort order used by the app:
--    order by is_backlog asc, posted_at desc nulls last, first_seen_at desc, id desc
create index if not exists jobs_open_sort_idx on public.jobs (
  is_backlog, posted_at desc nulls last, first_seen_at desc, id desc
) where closed_at is null and is_us is true;

-- 2. Index covering company lookups for open US jobs
create index if not exists jobs_open_company_idx on public.jobs (
  company_id, role_family
) where closed_at is null and is_us is true;

-- 3. Index covering role family filter for open US jobs
create index if not exists jobs_open_family_idx on public.jobs (
  role_family, is_backlog, posted_at desc nulls last
) where closed_at is null and is_us is true;
