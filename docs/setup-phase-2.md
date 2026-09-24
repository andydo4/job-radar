# Phase 2 setup: profiles, For you, Save / Applied / Hide, Apply check, home-screen app

About 3 minutes. **Run the SQL before you push.** The new pages read the new columns and tables and show an error until they exist.

1. Supabase → **SQL Editor** → **New query** → paste all of `supabase/migrations/0004_personal.sql` → **Run**.
   It should say "Success. No rows returned". Safe to run again.
2. Push:
   ```powershell
   git add .
   git commit -m "Phase 2: profiles, For you, save/applied/hide, apply-time check, installable app"
   git push
   ```
3. Wait for Vercel to finish deploying (about a minute), then open Primer. You'll land on **Welcome** once.
   Fill it in and you're on **For you**. Your friend gets the same Welcome screen on her first visit.

Nothing to add in GitHub or Vercel. The poller doesn't change.

## What's new

- **Welcome / Settings**: degree, field, graduation month, years of experience, kinds of jobs, internships, contract, where.
  Click your avatar (or the Settings tab) to change it.
- **For you** (the default list) uses your profile. **All jobs** still shows everything.
- **Qualify badge** on every job: *Likely qualify*, *Stretch* (one step short on degree or experience) or *Needs PhD*.
  It only uses what was read from the posting, so it's a hint, not a promise.
- **New since your last visit**: the NEW tag and the count now mean "since you were last here" (a gap of 30+ minutes starts a new visit).
  The very first time, it counts the last 48 hours.
- **Save / Applied / Hide** on every job. Saved and Applied keep jobs even after they close. Hidden jobs vanish everywhere; find them under **Hidden** to undo.
  After you click Apply, Primer asks "Did you apply?" so tracking is one tap.
- **Apply checks first**: Primer asks the company's job board whether the posting is still up (4-second limit). If it's gone, you see a note instead of a dead page, and it's closed for both of you right away.
- **Home-screen app**: iPhone Safari → Share → Add to Home Screen. Android Chrome → ⋮ → Install app. Instructions are also on Welcome and Settings.

## Still to do from earlier (if you haven't)

- After your friend has signed in once: Supabase → **Authentication → Sign In / Providers** → turn off **Allow new users to sign up**, and turn off the **Email** provider.
