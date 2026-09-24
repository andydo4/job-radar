-- Primer: at-a-glance parsing (work model, visa sponsorship, travel, clearance, housing, application extras)
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0001-0006.

-- 1. Add glance columns to public.jobs
alter table public.jobs
  add column if not exists work_model text check (work_model in ('remote', 'hybrid', 'onsite')),
  add column if not exists work_model_detail text,
  add column if not exists visa_sponsorship text check (visa_sponsorship in ('yes', 'no')),
  add column if not exists travel text,
  add column if not exists clearance_required boolean,
  add column if not exists housing text check (housing in ('provided', 'stipend', 'not_provided')),
  add column if not exists application_extras text[] not null default '{}';

-- 2. Update update_job_details to accept glance columns
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
    work_model = x.work_model,
    work_model_detail = x.work_model_detail,
    visa_sponsorship = x.visa_sponsorship,
    travel = x.travel,
    clearance_required = x.clearance_required,
    housing = x.housing,
    application_extras = coalesce(x.application_extras, '{}'),
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
    work_model text,
    work_model_detail text,
    visa_sponsorship text,
    travel text,
    clearance_required boolean,
    housing text,
    application_extras text[],
    details_version smallint
  )
  where j.id = x.id;
$$;

revoke all on function public.update_job_details(jsonb) from public, anon, authenticated;
grant execute on function public.update_job_details(jsonb) to service_role;
