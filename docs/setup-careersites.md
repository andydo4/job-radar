# Setup: big pharma on their own careers sites (AbbVie, Bayer, Boehringer Ingelheim)

**Run the SQL before you push.** The poller can't save these companies until the database allows the new board type.

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase/migrations/0006_careersites.sql` → **Run**. Safe to run again.
2. Optional check on your computer (reads the 5 new big companies once, saves nothing online):
   ```powershell
   $env:WORKDAY_FULL_SWEEPS_PER_RUN=5
   npx tsx packages/worker/src/poll.ts --only=eli-lilly,genentech,abbvie,bayer,boehringer-ingelheim --state=out/test-state.json
   ```
   Each line of the table should say `ok` with a few hundred jobs fetched.
3. Push.

## How careers-site companies work

Some companies don't use Greenhouse/Lever/Ashby/Workday. Their sites publish a feed for search engines instead:
an RSS feed (Bayer: every job with its description) or a sitemap of job links (AbbVie, Boehringer).
Primer reads that feed about once an hour. For sitemap sites, each new job's page is opened once to get
the real title, location, pay and description (older jobs fill in over a few hours).
To add another one: put `careersite` in the ats column and the feed URL in ats_key.
