-- Primer: companies that run their own careers site (AbbVie, Bayer, Boehringer Ingelheim, ...),
-- who each posting is for (student level + graduation window), and each person's plans after graduating.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0001-0005.

-- 0. Who a posting is for (read by packages/shared/src/audience.ts) and your plans after graduating.
alter table public.jobs
  add column if not exists intern_levels text[] not null default '{}', -- undergrad / masters / phd / mba
  add column if not exists grad_from date,                             -- graduation window the posting targets
  add column if not exists grad_to date;
alter table public.profiles
  add column if not exists after_grad text check (after_grad in ('work', 'maybe', 'grad'));

-- 1. Allow the new "careersite" board type.
alter table public.companies drop constraint if exists companies_ats_check;
alter table public.companies
  add constraint companies_ats_check check (ats in ('greenhouse', 'lever', 'ashby', 'workday', 'careersite'));

-- 2. Careers-site feeds list only links, so a job's first title is a guess from its link.
--    When the poller reads the job's own page, it can now correct the title and job type too.
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
    title = coalesce(x.title, j.title),
    role_family = coalesce(x.role_family, j.role_family),
    seniority = coalesce(x.seniority, j.seniority),
    dedupe_key = coalesce(x.dedupe_key, j.dedupe_key),
    term = x.term,
    start_date = x.start_date,
    end_date = x.end_date,
    dates_label = x.dates_label,
    duration_text = x.duration_text,
    deadline = x.deadline,
    intern_levels = coalesce(x.intern_levels, '{}'),
    grad_from = x.grad_from,
    grad_to = x.grad_to,
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
    title text,
    role_family text,
    seniority text,
    dedupe_key text,
    term text,
    start_date date,
    end_date date,
    dates_label text,
    duration_text text,
    deadline date,
    intern_levels text[],
    grad_from date,
    grad_to date,
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
