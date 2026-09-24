-- Primer: job details (pay, experience, job type, requirement bullets)
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0002_jobs.sql.

alter table public.jobs
  add column if not exists salary_min numeric,
  add column if not exists salary_max numeric,
  add column if not exists salary_currency text,
  add column if not exists salary_period text check (salary_period in ('year', 'hour')),
  add column if not exists employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'intern', 'temporary')),
  add column if not exists experience_min_years smallint,
  add column if not exists requirements text[] not null default '{}',
  -- Bumped by the poller when its extraction improves; rows below the current version get re-processed.
  add column if not exists details_version smallint not null default 0;

create index if not exists jobs_needs_details on public.jobs (details_version) where closed_at is null;

-- Bulk update used by the poller to fill in details for jobs saved before this existed
-- (and for Workday jobs, whose description needs an extra request).
create or replace function public.update_job_details(p_rows jsonb)
returns void
language sql
set search_path = public
as $$
  update public.jobs j
  set
    salary_min = x.salary_min,
    salary_max = x.salary_max,
    salary_currency = x.salary_currency,
    salary_period = x.salary_period,
    employment_type = x.employment_type,
    experience_min_years = x.experience_min_years,
    requirements = coalesce(x.requirements, '{}'),
    description_text = coalesce(x.description_text, j.description_text),
    locations = coalesce(x.locations, j.locations),
    country = coalesce(x.country, j.country),
    is_us = x.is_us,
    metro_tier = x.metro_tier,
    degree_min = x.degree_min,
    details_version = x.details_version
  from jsonb_to_recordset(p_rows) as x(
    id bigint,
    salary_min numeric,
    salary_max numeric,
    salary_currency text,
    salary_period text,
    employment_type text,
    experience_min_years smallint,
    requirements text[],
    description_text text,
    locations text[],
    country text,
    is_us boolean,
    metro_tier smallint,
    degree_min text,
    details_version smallint
  )
  where j.id = x.id;
$$;

revoke all on function public.update_job_details(jsonb) from public, anon, authenticated;
grant execute on function public.update_job_details(jsonb) to service_role;
