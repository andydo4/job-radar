# job-radar

A free, private job radar. It checks company career sites (Greenhouse, Lever, Ashby and Workday) every 10 minutes and reports **new** postings, so we see them before LinkedIn does. It's focused on biotech, pharma, life-science consulting and biotech VC, and will add new-grad SWE later.

It reads each company's own ATS feed (the same data behind its careers page), so a job it shows is live on the company's site at that moment. There are no aggregators or stale mirror sites involved.

> **Status: Phase 0 (proof).** Right now the poller writes a report on each GitHub Actions run. The website (Grad Programs page, then the job feed) comes in the next phases.

## How it works

```
cron-job.org (every 10 min) ──► GitHub Actions "Poll job boards"
                                   │
                                   ├─ fetch every company's ATS feed (Greenhouse / Lever / Ashby / Workday)
                                   ├─ compare job IDs to the ones seen before (state/state.json, kept in the Actions cache)
                                   ├─ new ID + posted in the last 7 days  → "new job"
                                   ├─ missing from 2 full sweeps in a row → "closed"
                                   └─ write the report → run Summary page + downloadable artifact
```

- **First poll of a company = baseline.** Its existing jobs are recorded silently so you don't get its whole backlog as "new".
- **Workday** returns 20 jobs per request, so big boards are read in full every 3 hours. In between, only the first 3 pages are read. Partial reads never close jobs.
- **Default filter** (until each person sets their own on the website): every biotech job family plus consulting and VC, intern/entry/unspecified level, anywhere in the US or remote. Boston/NYC is sorted first.

## Project layout

```
packages/shared/   types, ATS adapters, classifier (role family, level, degree, location tier), filter
packages/worker/   poll.ts (the poller), discover.ts (find ATS boards), workday-test.ts
seed/              companies.csv (what gets polled), candidates.csv (what discover looks up)
fixtures/          sample API responses for tests and dry runs
.github/workflows/ poll.yml, workday-test.yml, test.yml
```

## 1. Run it locally

Requires Node 20+.

```powershell
cd C:\Users\andyd\Documents\vscode\job-radar
npm install
npm test              # 74 tests, all offline
npm run poll:dry      # full pipeline against /fixtures. Run it twice: the 2nd run shows simulated new jobs
npm run poll          # live: polls seed/companies.csv from your PC and writes out/report.md
```

## 2. Grow the company list

```powershell
npm run discover              # probes every name in seed/candidates.csv
npm run discover -- --write   # ...and appends the hits to seed/companies.csv
```

`discover` tries slug guesses (`moderna`, `modernatx`, `moderna-therapeutics`, …) against Greenhouse, Ashby and Lever. It **can't guess Workday** (most big pharma), so for those it lists the misses. Open the company's careers page, copy any job link (e.g. `https://pfizer.wd1.myworkdayjobs.com/en-US/PfizerCareers/job/...`) into the `careers_url` column of `seed/candidates.csv`, and run it again.

## 3. Put it on GitHub (commits under your name)

First, one-time: move the GitHub Actions workflows into place. (They were delivered in `github-workflows/` because the `.github` folder can't be written remotely.)

```powershell
New-Item -ItemType Directory -Force .github\workflows | Out-Null
Move-Item github-workflows\*.yml .github\workflows\
Remove-Item github-workflows
```

Then:

```powershell
git init -b main
git config user.name  "Andy"
git config user.email "andrewhuudo@gmail.com"   # must match an email on your GitHub account
git add .
git commit -m "Phase 0: job board poller"
```

Create an **empty public** repo called `job-radar` on github.com (no README), then:

```powershell
git remote add origin https://github.com/<your-username>/job-radar.git
git push -u origin main
```

(Public = unlimited free Actions minutes. Nothing personal lives in the repo: state is in the Actions cache, and later in Supabase.)

## 4. Run the Phase 0 checks on GitHub

1. **Actions tab → "Workday test" → Run workflow.** Open the run's **Summary**. For Pfizer and Gilead it tells you:
   - whether GitHub's servers are blocked ❌ (this is the biggest risk in the plan)
   - how many requests a full sweep takes
   - whether results come newest-first (so the 3-page partial sweeps are safe)
   - whether the job-detail endpoint returns descriptions
2. **Actions → "Poll job boards" → Run workflow**, twice, a few minutes apart. Run 1 shows every company as 🆕 baselined. Run 2 onward lists new jobs. The report is on each run's **Summary** page.

## 5. Start the 10-minute clock (cron-job.org)

GitHub's own scheduler is only a backup (every 30 min, often late). The real clock:

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
   - Repository access: **Only select repositories → job-radar**
   - Permissions → Repository → **Actions: Read and write** (nothing else)
   - Set expiry to 1 year and put a reminder in your calendar.
2. [cron-job.org](https://cron-job.org) (free) → Create cronjob:
   - URL: `https://api.github.com/repos/<your-username>/job-radar/actions/workflows/poll.yml/dispatches`
   - Schedule: every 10 minutes
   - Advanced → Request method **POST**
   - Headers:
     - `Authorization: Bearer <your token>`
     - `Accept: application/vnd.github+json`
     - `X-GitHub-Api-Version: 2022-11-28`
     - `Content-Type: application/json`
   - Body: `{"ref":"main"}`
   - Save, then "Test run". GitHub answers **204** on success, and a new run appears in the Actions tab.

cron-job.org emails you if the call starts failing, and GitHub emails you if a poll run fails (a run only fails when more than half the companies error out).

## 6. What to watch during the first week

Check a few run Summaries a day and note:

- **Volume:** how many "new matches" per day? This decides how strict the default filter should be.
- **Misclassified jobs:** a wrong family or level is a one-line fix in `packages/shared/src/classify.ts`. Add a test case in `classify.test.ts` first.
- **Failing companies:** 404 means the slug is wrong. 403/429 means blocked or rate-limited.

## Roadmap

| Phase | What |
| --- | --- |
| **0 (now)** | Poller + reports on GitHub Actions, Workday risk test, company discovery |
| 0.5 | Next.js app on Vercel: Google sign-in (two emails) + Grad Programs page she fills in herself, with deadline countdowns |
| 1 | Supabase `jobs` table replaces state.json, full Workday sweeps, live re-checks, 150 companies |
| 2 | Job feed: onboarding, "New since your last visit", filters, save/hide/applied, grouped duplicates, PWA |
| 3 | Andy's profile: new-grad SWE / FDE / Product Engineer, big-tech adapters |
| 4 | Hardening: status page, grad page-change watch, more ATSs |

Parked: an opt-in daily email digest (off by default).
