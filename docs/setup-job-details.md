# Job details setup (pay, experience, requirements)

About 2 minutes. **Run the SQL before you push.** The updated Jobs page reads the new columns and shows an error until they exist.

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase/migrations/0003_job_details.sql` → **Run**.
2. Push:
   ```powershell
   git add .
   git commit -m "Job details: pay, experience, requirements, filters"
   git push
   ```
3. **Actions → Poll job boards → Run workflow** (or wait up to 10 minutes). The Poll step's log shows a line like
   `Details: 300 jobs updated (40 Workday detail pages), more next run.`

## How the details fill in

- **New jobs** get their details the moment they're found.
- **Jobs already saved** are filled in by the checker in the background, 300 per run.
- **Big Workday boards (Pfizer, Gilead)** need one extra request per job to get the description, so the checker does 40 per run to stay polite. About 1,100 Workday jobs ÷ 40 per run ≈ 4–5 hours until all of them have details. Until then, those cards just don't show pay or requirements yet.

Nothing to add in GitHub. Optional workflow env settings: `DETAILS_BACKFILL_LIMIT` (default 300) and `DETAILS_WORKDAY_FETCHES` (default 40).
