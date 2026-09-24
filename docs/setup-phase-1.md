# Phase 1 setup: save jobs to Supabase

About 10 minutes. After this, the job checker saves every job to Supabase and the **Jobs** tab on Primer shows them.

## 1. Supabase: add the jobs tables

1. Supabase → **SQL Editor** → **New query**.
2. Paste **all** of `supabase/migrations/0002_jobs.sql` → **Run** (confirm the "destructive operations" warning; it only replaces the rules it creates).
3. **Table Editor** should now also list `companies`, `jobs` and `poll_runs` (all empty).

## 2. Supabase: copy the secret key

**Project Settings → API Keys** → under **Secret keys**, copy the key that starts with `sb_secret_`
(on older projects: **Legacy API Keys → `service_role`**).

This key can read and write everything, so it only ever goes into GitHub Secrets (step 3). Never paste it into Vercel, `.env.local`, the code, or a chat.

## 3. GitHub: add two repository secrets

github.com/andydo4/job-radar → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, twice:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | your Project URL (`https://….supabase.co`, the same one you gave Vercel) |
| `SUPABASE_SECRET_KEY` | the `sb_secret_…` key from step 2 |

Secrets stay hidden even though the repo is public, and GitHub also blanks them out in logs.

## 4. Edit the workflow (2 lines)

Open `.github/workflows/poll.yml` in VS Code and add the two `SUPABASE_` lines under the **Poll** step's `env:` (indentation matters: line them up with `FULL_SWEEP_HOURS`):

```yaml
      - name: Poll
        run: npm run poll
        env:
          WORKDAY_PARTIAL_PAGES: "3"
          FULL_SWEEP_HOURS: "3"
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
```

Leave everything else in the file as it is.

## 5. Push, then run it once

```powershell
git add .
git commit -m "Phase 1: save jobs to Supabase + Jobs page"
git push
```

Then **Actions → Poll job boards → Run workflow**. In the run's log, the Poll step should print:

```
Storage: Supabase
…
Saved to Supabase: 1234 jobs inserted, 0 re-seen, 0 closed.
```

- **First run:** every company is new to the database, so all its current jobs are saved as *existing* (not "new"). They show up under **Jobs → All open** right away.
- **From then on:** anything posted after that shows up under **Jobs → New**, with a lime NEW tag for 48 hours. The top bar shows "Checked 4 min ago".

## If something goes wrong

| Log says | Fix |
| --- | --- |
| `Storage: state/state.json` (not Supabase) | The secrets or the 2 workflow lines are missing or misspelled. |
| `Supabase … failed: Invalid API key` | `SUPABASE_SECRET_KEY` is wrong, or you pasted the publishable key instead of the secret one. |
| `relation "public.jobs" does not exist` / `Could not find the function public.touch_jobs` | Step 1 wasn't run, or failed partway. Run `0002_jobs.sql` again. |
| Jobs page says "Waiting for the first check" | No successful run has been saved yet. Check the latest Poll run's log. |
