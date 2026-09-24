-- Primer: Phase 0.5 schema (sign-in allowlist, profiles, grad programs)
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Who may sign in. Only these emails can create an account.
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table public.allowed_emails enable row level security;
-- No policies on purpose: nobody can read or edit this list from the website.
-- Edit it here in the SQL editor (or Table Editor) only.

insert into public.allowed_emails (email) values
  ('andrewhuudo@gmail.com'),
  ('friend-placeholder@example.com')  -- TODO: replace with your friend's Gmail (lowercase)
on conflict do nothing;

-- Block sign-up for anyone not on the list. Runs inside Supabase Auth.
create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'Primer is invite-only: % is not on the allowlist', new.email;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_email_allowlist on auth.users;
create trigger enforce_email_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- Lets the app double-check the signed-in user (e.g. if someone is removed from the list later).
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.allowed_emails where email = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profiles (one row per user, created automatically on first sign-in)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  last_visit_at timestamptz
);
alter table public.profiles enable row level security;

drop policy if exists "own profile: read" on public.profiles;
create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Grad programs: each person's own list
-- ---------------------------------------------------------------------------
create table if not exists public.grad_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  school text not null check (char_length(school) between 1 and 200),
  program text not null check (char_length(program) between 1 and 200),
  degree text not null default 'PhD' check (degree in ('PhD', 'MS', 'Postbac', 'Other')),
  field text check (char_length(field) <= 200),
  opens_on date,
  deadline date,
  fee numeric(8, 2) check (fee >= 0),
  gre text not null default 'Unknown' check (gre in ('Required', 'Optional', 'Not accepted', 'Unknown')),
  url text check (url ~* '^https?://'),
  status text not null default 'Researching' check (status in ('Researching', 'Applying', 'Submitted', 'Decision')),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists grad_programs_user_deadline on public.grad_programs (user_id, deadline);
alter table public.grad_programs enable row level security;

drop policy if exists "own programs: read" on public.grad_programs;
create policy "own programs: read" on public.grad_programs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "own programs: insert" on public.grad_programs;
create policy "own programs: insert" on public.grad_programs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "own programs: update" on public.grad_programs;
create policy "own programs: update" on public.grad_programs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own programs: delete" on public.grad_programs;
create policy "own programs: delete" on public.grad_programs
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists grad_programs_touch on public.grad_programs;
create trigger grad_programs_touch
  before update on public.grad_programs
  for each row execute function public.touch_updated_at();
