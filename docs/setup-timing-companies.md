# Setup: dates, deadlines, starred companies, new filter bar

About 2 minutes. **Run the SQL before you push.** The Jobs page reads the new columns and shows an error until they exist.

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase/migrations/0005_timing_companies.sql` → **Run**.
   It should say "Success. No rows returned". Safe to run again.
2. Push:
   ```powershell
   git add .
   git commit -m "Dates, deadlines, starred/hidden companies, sleeker filters"
   git push
   ```
3. That's it. Vercel redeploys the site, and the next poller run starts filling in the new details.

## How the new details fill in

- **New postings** get their term, dates, length and deadline as soon as they're found.
- **Jobs already saved** are re-read in the background, 300 per run (every 10 minutes), so all of them are done within an hour or two.
  Until a job is re-read, its card just doesn't show those tags yet.
- **Posted date**: Greenhouse, Lever and Ashby give a real date. For Workday (Pfizer, Gilead…), "Posted 3 Days Ago" is turned into a date when first seen; "Posted 30+ Days Ago" is shown as is.
- It's all pattern rules (no AI, no cost). When a posting words things unusually, that tag is left blank rather than guessed.

## What's new on the site

- **Filter bar**: the list tabs (For you / All / Saved / Applied / Hidden), three quick toggles (New since last visit, Likely qualify, Starred companies), a Sort menu and a **Filters** button for everything else. Active filters show as pills you can click to remove.
- **Sort by deadline** (soonest first).
- **Kind** filter: internships & co-ops, or full-time roles.
- **Fit** filter: Likely only, or Likely + Stretch.
- **Star / hide companies**: Settings → Companies (or pick a company under Filters → Company, or on a job's page). Starred companies get a ★ and their own quick filter. Hidden companies disappear from For you and All jobs. Each person has their own list.
- **Card headline**: pay, then term · dates · length (e.g. "Summer 2027 · May 26 – Aug 15, 2027 · 12 weeks"), then "Apply by Oct 15 · 22 days left" (red within a week, amber within three weeks), then the qualify badge. "posted 3 days ago" is in the top line.
