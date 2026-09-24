import { cookies } from "next/headers";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavTabs } from "@/components/nav-tabs";
import { CountdownBadge } from "@/components/ui";
import { getPrograms, upcomingDeadlines } from "@/lib/data";
import { getLastRun, isStale, timeAgo } from "@/lib/jobs";
import { formatDate } from "@/lib/deadlines";
import { requireUser } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [programs, lastRun] = await Promise.all([getPrograms(supabase), getLastRun(supabase).catch(() => null)]);
  const stale = isStale(lastRun?.finished_at);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const next = upcomingDeadlines(programs, 3);

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "You";
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/grad" className="flex items-center gap-3">
            <span className="grid size-8 place-items-center bg-brand font-mono text-sm font-bold text-white" aria-hidden>
              P
            </span>
            <span className="font-mono text-base font-semibold text-heading">Primer</span>
          </Link>
          <div className="flex items-center gap-3">
            {lastRun && (
              <span
                title={`Job checker last finished ${new Date(lastRun.finished_at).toLocaleString()}`}
                className={`hidden items-center gap-1.5 font-mono text-xs md:inline-flex ${stale ? "text-danger" : "text-subtle"}`}
              >
                <span aria-hidden className={`size-1.5 rounded-full ${stale ? "bg-danger" : "bg-success"}`} />
                {stale ? "Checker stalled · " : "Checked "}
                {timeAgo(lastRun.finished_at)}
              </span>
            )}
            <ThemeToggle initial={theme} />
            <span className="hidden max-w-48 truncate font-mono text-xs text-subtle lg:block">{name}</span>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-8 place-items-center rounded-full bg-brand font-mono text-xs font-bold text-white" aria-hidden>
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <form action="/auth/signout" method="post">
              <button className="h-10 px-2 font-mono text-xs text-subtle hover:text-heading">Sign out</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
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
