-- Primer: internship term / dates / length / deadline on each job, and each person's
-- starred and hidden companies.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0001-0004.

-- ---------------------------------------------------------------------------
-- 1. When the job happens (read from the posting by packages/shared/src/dates.ts)
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column if not exists term text,            -- "Summer 2027"
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists dates_label text,     -- "May 26 – Aug 15, 2027" or "Jun 2027"
  add column if not exists duration_text text,   -- "12 weeks", "6 months"
  add column if not exists deadline date;

-- Same as 0003, plus the new columns and a better posted date for Workday jobs.
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
    term = x.term,
    start_date = x.start_date,
    end_date = x.end_date,
    dates_label = x.dates_label,
    duration_text = x.duration_text,
    deadline = x.deadline,
    posted_at = coalesce(j.posted_at, x.posted_at),
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
    term text,
    start_date date,
    end_date date,
    dates_label text,
    duration_text text,
    deadline date,
    posted_at timestamptz,
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

-- ---------------------------------------------------------------------------
-- 2. Starred / hidden companies, one list per person
-- ---------------------------------------------------------------------------
create table if not exists public.company_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id text not null references public.companies (id) on delete cascade,
  pref text not null check (pref in ('star', 'hide')),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.company_prefs enable row level security;

drop policy if exists "own company prefs: read" on public.company_prefs;
create policy "own company prefs: read" on public.company_prefs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own company prefs: insert" on public.company_prefs;
create policy "own company prefs: insert" on public.company_prefs
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_allowed()));
drop policy if exists "own company prefs: update" on public.company_prefs;
create policy "own company prefs: update" on public.company_prefs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own company prefs: delete" on public.company_prefs;
create policy "own company prefs: delete" on public.company_prefs
  for delete to authenticated using (user_id = (select auth.uid()));
