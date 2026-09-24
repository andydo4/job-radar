# Big tech + more companies: setup

## 1. Run the migration (before pushing)
Supabase -> SQL Editor -> New query -> paste all of `supabase/migrations/0009_bigtech.sql` -> Run.
It only widens the list of allowed board types (amazon, google, apple, eightfold). Safe to re-run.

## 2. Push
The poller adds the new companies on its next run. The big-tech sites are read once an hour
(like the careers-site feeds), so their jobs appear within the first hour or two.

## What's read where
| Company | How | What |
|---|---|---|
| Amazon | amazon.jobs search JSON | US software-development jobs, kept only if early career ("SDE I", "Early Career", "New Grad", interns) |
| Google | careers search pages | US jobs at the Early and Intern levels |
| Apple | jobs.apple.com search pages | US Students / Internships only (Apple doesn't mark new-grad roles) |
| Microsoft | Eightfold API (apply.careers.microsoft.com) | newest ~400 US "software engineer" jobs; the site rate-limits, so a read can stop early |
| Netflix | Eightfold API (explore.jobs.netflix.net) | all US jobs |

Microsoft reads can end early (rate limit), so Microsoft jobs are never closed by the poller; the
Apply check just sends you to the posting. Meta isn't included: its site needs a login-style token,
and it had one university-grad role open when checked.

Plus 54 more tech companies and 16 biotechs on Greenhouse / Lever / Ashby (see seed/companies.csv).
Not added yet: big companies on Workday (Adobe, Intel, PayPal, Capital One, Qualcomm...), whose
boards couldn't be checked from here; paste one of their job links into seed/candidates.csv and run
`npm run discover` to add them.
