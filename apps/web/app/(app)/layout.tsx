import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/account-menu";
import { NavTabs } from "@/components/nav-tabs";
import { CountdownBadge } from "@/components/ui";
import { getPrograms, upcomingDeadlines } from "@/lib/data";
import { getLastRun, isStale, timeAgo } from "@/lib/jobs";
import { formatDate } from "@/lib/deadlines";
import { getProfile } from "@/lib/me";
import { requireUser } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [programs, lastRun, profile] = await Promise.all([
    getPrograms(supabase),
    getLastRun(supabase).catch(() => null),
    getProfile(supabase, user.id),
  ]);
  // First visit: a one-minute profile so For you and the qualify badges mean something.
  if (!profile.onboarded_at) redirect("/welcome");
  const stale = isStale(lastRun?.finished_at);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const next = upcomingDeadlines(programs, 3);

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "You";
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-8">
          <Link href="/jobs" className="flex shrink-0 items-center gap-3">
            <span className="grid size-8 place-items-center bg-brand font-mono text-sm font-bold text-white" aria-hidden>
              P
            </span>
            <span className="font-mono text-base font-semibold text-heading">Primer</span>
          </Link>
          {/* Desktop: the page tabs sit in the same row as the logo. */}
          <div className="hidden h-full sm:block">
            <NavTabs inline />
          </div>
          <div className="ml-auto">
            <AccountMenu
              name={name}
              avatar={avatar}
              theme={theme}
              checker={lastRun ? { text: `${stale ? "Checker stalled · " : "Checked "}${timeAgo(lastRun.finished_at)}`, stale } : undefined}
            />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:hidden">
          <NavTabs />
        </div>
      </header>

      {next.length > 0 && (
        <section aria-label="Next deadlines" className="border-b border-line bg-card">
          <div className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-3">
            {next.map((p, i) => (
              <Link
                key={p.id}
                href={`/grad/${p.id}`}
                className={`flex items-center justify-between gap-4 px-4 py-4 hover:bg-brand-softer sm:px-8 ${
                  i > 0 ? "border-t border-line sm:border-t-0 sm:border-l" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-subtle">{p.school}</p>
                  <p className="truncate font-mono text-sm font-medium text-heading">{p.program}</p>
                  <p className="tabular mt-1 font-mono text-xs text-subtle">{formatDate(p.deadline!)}</p>
                </div>
                <CountdownBadge days={p.days} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
