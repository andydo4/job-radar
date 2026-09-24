# Phase 0.5 setup: Primer website (Supabase + Google sign-in + Vercel)

About 30 minutes, all free. Do the steps in order: each one needs a value from the one before.

You'll copy these values as you go. Keep them in a note (not in the repo):

| Value | Where it comes from | Secret? |
| --- | --- | --- |
| Supabase **Project URL** (`https://abcd1234.supabase.co`) | Step 1 | No |
| Supabase **Publishable key** (`sb_publishable_…`, or the legacy "anon public" key) | Step 1 | No, it's meant for browsers |
| Google **Client ID** + **Client secret** | Step 3 | **Secret is secret.** It only goes into Supabase |
| Vercel URL (`https://primer-….vercel.app`) | Step 5 | No |

Never copy the Supabase **service_role / secret** key anywhere. The website doesn't need it.

---

## 1. Supabase: create the tables

1. Open your `primer` project on supabase.com.
2. Left sidebar: **SQL Editor** → **New query**.
3. Open `supabase/migrations/0001_primer_init.sql` from this repo, copy **all** of it, paste it in, and click **Run**. It should say *Success. No rows returned*.
4. Check it worked: **Table Editor** should list `allowed_emails`, `profiles` and `grad_programs`.
5. Copy your keys: **Project Settings** (gear icon) → **API Keys**. Copy the **Publishable key**. Then **Project Settings → Data API** (or the Connect button at the top) → copy the **Project URL**.

The SQL puts `andrewhuudo@gmail.com` and a placeholder friend email on the allowlist. Only emails on that list can create an account.

## 2. Supabase: find the Google callback URL

**Authentication → Sign In / Providers → Google**. Don't enable it yet. Copy the **Callback URL (for OAuth)** shown there. It looks like `https://abcd1234.supabase.co/auth/v1/callback`. You need it in step 3.

## 3. Google Cloud: create the sign-in client

1. console.cloud.google.com → make sure the **primer** project is selected (top bar).
2. Search for **Google Auth Platform** → **Get started**:
   - App name: **Primer**, user support email: your Gmail → Next
   - Audience: **External** → Next
   - Contact email: your Gmail → Next → agree → **Create**
3. **Audience** (left menu) → leave Publishing status on **Testing** → **Test users → Add users** → add `andrewhuudo@gmail.com` (and your friend's Gmail later). Only test users can sign in while the app is in Testing, which is exactly what we want.
4. **Clients** → **Create client**:
   - Application type: **Web application**, name: `Primer web`
   - **Authorized redirect URIs** → Add URI → paste the Supabase callback URL from step 2
   - **Create** → copy the **Client ID** and **Client secret**

## 4. Supabase: turn on Google

1. **Authentication → Sign In / Providers → Google** → toggle **Enable**.
2. Paste the **Client ID** and **Client secret** from step 3 → **Save**.

## 5. Vercel: deploy the site

1. vercel.com → **Add New… → Project** → import the **job-radar** GitHub repo.
2. **Project Name:** `primer` (or `primer-jobs` if taken). This becomes your URL.
3. **Root Directory:** click Edit → choose **`apps/web`**. This one matters: the repo root is the poller.
4. **Environment Variables** → add both:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your Publishable key
5. **Deploy**. When it finishes, copy the domain (e.g. `https://primer-jobs.vercel.app`).

## 6. Supabase: allow the site's address

**Authentication → URL Configuration**:

- **Site URL:** your Vercel URL, e.g. `https://primer-jobs.vercel.app`
- **Redirect URLs → Add URL** (add both):
  - `https://primer-jobs.vercel.app/**`
  - `http://localhost:3000/**`
- Save.

## 7. Try it

Open your Vercel URL → **Continue with Google** → pick `andrewhuudo@gmail.com` → you land on **Grad programs**. Add a test program with a deadline 10 days out: it should show amber, and appear in the banner.

Also try signing in with a *different* Google account. You should see "Primer is invite-only…".

## Running it on your PC (optional)

```powershell
cd apps\web
copy .env.example .env.local   # then fill in the two values
npm install
npm run dev                     # http://localhost:3000
```

## Adding your friend later

1. Supabase → **SQL Editor**:
   ```sql
   delete from public.allowed_emails where email = 'friend-placeholder@example.com';
   insert into public.allowed_emails (email) values ('her.email@gmail.com'); -- lowercase
   ```
2. Google Cloud → **Google Auth Platform → Audience → Test users** → add her Gmail.
3. Send her the Vercel URL. Her programs are private to her (and yours to you). The database enforces that.

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| Google says **"Error 400: redirect_uri_mismatch"** | The redirect URI in Google (step 3) must exactly match the Supabase callback URL (step 2). |
| Google says **"Access blocked: Primer has not completed verification"** | That Gmail isn't a **test user** (step 3.3). |
| Back on Primer with **"invite-only"** | That email isn't in `allowed_emails` (lowercase), or is misspelled. |
| After Google, you land on **localhost** instead of the Vercel site | Site URL / Redirect URLs in step 6 are missing the Vercel URL. |
| Site shows an **error page** right away (logs say "Missing Supabase settings") | The two env vars are missing or misspelled in Vercel. Fix them, then **Deployments → ⋯ → Redeploy**. |
| Vercel builds the wrong thing | Root Directory must be `apps/web`. |
