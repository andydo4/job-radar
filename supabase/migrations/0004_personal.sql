-- Primer Phase 2: each person's profile preferences, saved/hidden/applied jobs,
-- "new since your last visit", and reporting a job that closed when someone clicked Apply.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Requires 0001-0003.

-- ---------------------------------------------------------------------------
-- 1. Profile preferences (filled in on the Welcome screen, editable in Settings)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists degree text check (degree in ('none', 'bs', 'ms', 'phd')),
  add column if not exists field text check (char_length(field) <= 200),
  add column if not exists grad_month date,
  add column if not exists years_experience smallint check (years_experience between 0 and 50),
  add column if not exists families text[] not null default '{research,process,quality,clinical,regulatory,compbio,engineering,commercial,consulting,vc}',
  add column if not exists include_internships boolean not null default true,
  add column if not exists metro_tiers smallint[] not null default '{1,2,3}',
  add column if not exists hide_contract boolean not null default false,
  add column if not exists onboarded_at timestamptz,
  add column if not exists prev_visit_at timestamptz;

-- Normally the sign-up trigger creates the profile row. This lets the Welcome form
-- create it if it's somehow missing (own row only, allowlisted people only).
drop policy if exists "own profile: insert" on public.profiles;
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()) and (select public.is_allowed()));

-- ---------------------------------------------------------------------------
-- 2. Saved / applied / hidden jobs (one status per person per job)
-- ---------------------------------------------------------------------------
create table if not exists public.job_actions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id bigint not null references public.jobs (id) on delete cascade,
  status text not null check (status in ('saved', 'applied', 'hidden')),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.job_actions enable row level security;

drop policy if exists "own job actions: read" on public.job_actions;
create policy "own job actions: read" on public.job_actions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own job actions: insert" on public.job_actions;
create policy "own job actions: insert" on public.job_actions
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_allowed()));
drop policy if exists "own job actions: update" on public.job_actions;
create policy "own job actions: update" on public.job_actions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own job actions: delete" on public.job_actions;
create policy "own job actions: delete" on public.job_actions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Visits: returns the moment "new since your last visit" should count from.
--    A visit more than 30 minutes after the previous one starts a new session.
-- ---------------------------------------------------------------------------
create or replace function public.note_visit()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_prev timestamptz;
begin
  select last_visit_at, prev_visit_at into v_last, v_prev from public.profiles where id = auth.uid();
  if not found then
    return now() - interval '48 hours';
  end if;
  if v_last is null or v_last < now() - interval '30 minutes' then
    v_prev := v_last;  -- new session: the old "last visit" becomes the cut-off
  end if;
  update public.profiles set last_visit_at = now(), prev_visit_at = v_prev where id = auth.uid();
  return coalesce(v_prev, now() - interval '48 hours');
end;
$$;
revoke all on function public.note_visit() from public, anon;
grant execute on function public.note_visit() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The website checks a job with the company right before sending someone to Apply.
--    If the company says it's gone, the site closes it here instead of waiting for the poller.
-- ---------------------------------------------------------------------------
create or replace function public.mark_job_closed(p_job_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.jobs
  set closed_at = now()
  where id = p_job_id and closed_at is null and public.is_allowed();
$$;
revoke all on function public.mark_job_closed(bigint) from public, anon;
grant execute on function public.mark_job_closed(bigint) to authenticated;
