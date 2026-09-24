-- Primer: Phase 1 schema (companies the poller watches, every job it has seen, and each poll run)
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to re-run. Requires 0001_primer_init.sql (uses public.is_allowed()).
--
-- Who writes: only the poller (GitHub Actions), using the Supabase SECRET key, which bypasses RLS.
-- Who reads: signed-in, allowlisted users (read-only). The website never writes these tables.

-- ---------------------------------------------------------------------------
-- Companies (mirrors seed/companies.csv; the poller keeps it in sync every run)
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id text primary key,
  name text not null,
  ats text not null check (ats in ('greenhouse', 'lever', 'ashby', 'workday')),
  ats_key text not null,
  segment text not null,
  active boolean not null default true,
  baselined_at timestamptz,
  last_polled_at timestamptz,
  last_full_sweep_at timestamptz,
  consecutive_failures int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs: one row per posting ever seen. Open jobs have closed_at = null.
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  company_id text not null references public.companies (id) on delete cascade,
  external_id text not null,
  title text not null,
  url text not null,
  locations text[] not null default '{}',
  remote boolean not null default false,
  country text,
  department text,
  description_text text,
  posted_at timestamptz,
  posted_text text,
  -- classification (packages/shared/src/classify.ts)
  role_family text not null default 'other',
  seniority text not null default 'unspecified',
  degree_min text,
  is_us boolean,
  metro_tier smallint,
  dedupe_key text not null,
  -- lifecycle
  is_backlog boolean not null default false, -- existed before we started watching (or was already old when first seen)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  misses smallint not null default 0,
  closed_at timestamptz,
  unique (company_id, external_id)
);

create index if not exists jobs_open_new on public.jobs (first_seen_at desc) where closed_at is null;
create index if not exists jobs_open_company on public.jobs (company_id) where closed_at is null;

-- ---------------------------------------------------------------------------
-- Poll runs: one row per poller run (drives "Last checked 4 min ago")
-- ---------------------------------------------------------------------------
create table if not exists public.poll_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  companies_ok int not null,
  companies_failed int not null,
  new_jobs int not null,
  new_matches int not null,
  closed_jobs int not null,
  requests int not null,
  github_run_url text
);
create index if not exists poll_runs_finished on public.poll_runs (finished_at desc);

-- ---------------------------------------------------------------------------
-- Read-only access for the two allowlisted users. No insert/update/delete policies.
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.poll_runs enable row level security;

drop policy if exists "allowlisted can read companies" on public.companies;
create policy "allowlisted can read companies" on public.companies
  for select to authenticated using ((select public.is_allowed()));

drop policy if exists "allowlisted can read jobs" on public.jobs;
create policy "allowlisted can read jobs" on public.jobs
  for select to authenticated using ((select public.is_allowed()));

drop policy if exists "allowlisted can read poll runs" on public.poll_runs;
create policy "allowlisted can read poll runs" on public.poll_runs
  for select to authenticated using ((select public.is_allowed()));

-- ---------------------------------------------------------------------------
-- Bulk helpers for the poller (secret key only). One call per company per run.
-- ---------------------------------------------------------------------------
create or replace function public.touch_jobs(p_company_id text, p_external_ids text[], p_seen_at timestamptz)
returns void
language sql
set search_path = public
as $$
  update public.jobs
  set last_seen_at = p_seen_at, misses = 0
  where company_id = p_company_id and external_id = any (p_external_ids) and closed_at is null;
$$;

create or replace function public.mark_missed(p_company_id text, p_external_ids text[])
returns void
language sql
set search_path = public
as $$
  update public.jobs
  set misses = misses + 1
  where company_id = p_company_id and external_id = any (p_external_ids) and closed_at is null;
$$;

create or replace function public.close_jobs(p_company_id text, p_external_ids text[], p_closed_at timestamptz)
returns void
language sql
set search_path = public
as $$
  update public.jobs
  set closed_at = p_closed_at
  where company_id = p_company_id and external_id = any (p_external_ids) and closed_at is null;
$$;

revoke all on function public.touch_jobs(text, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.mark_missed(text, text[]) from public, anon, authenticated;
revoke all on function public.close_jobs(text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.touch_jobs(text, text[], timestamptz) to service_role;
grant execute on function public.mark_missed(text, text[]) to service_role;
grant execute on function public.close_jobs(text, text[], timestamptz) to service_role;
