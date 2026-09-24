-- Primer: big-tech careers sites (Amazon, Google, Apple, and Eightfold sites like Microsoft and Netflix).
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run. Safe to re-run.
-- Run it BEFORE pushing: the poller adds these companies on its next run.

alter table public.companies drop constraint if exists companies_ats_check;
alter table public.companies
  add constraint companies_ats_check
  check (ats in ('greenhouse', 'lever', 'ashby', 'workday', 'careersite', 'amazon', 'google', 'apple', 'eightfold'));
