# Primer (web)

The website: Google sign-in (invite-only), the Grad Programs tracker, and soon the job feed.
Next.js 16 (App Router) + Tailwind v4 + Supabase. Design tokens follow `/DESIGN.md`.

- First-time setup (Supabase, Google, Vercel): [`/docs/setup-phase-0.5.md`](../../docs/setup-phase-0.5.md)
- Database schema: [`/supabase/migrations`](../../supabase/migrations)

```powershell
copy .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev        # http://localhost:3000
npm test           # deadline math + form validation
npm run typecheck
npm run lint
```

| Path | What |
| --- | --- |
| `proxy.ts` | Refreshes the session, sends signed-out visitors to `/login` |
| `app/login` | Sign-in page (blue hero) |
| `app/auth/callback` | Google → Supabase → here. Checks the allowlist |
| `app/(app)/layout.tsx` | Top bar + "next 3 deadlines" banner |
| `app/(app)/grad` | Grad Programs list, add/edit forms, server actions |
| `lib/deadlines.ts` | Countdown math (US Eastern), urgency colors |
| `lib/programs.ts` | Program types + form validation |
