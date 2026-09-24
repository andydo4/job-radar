import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, CountdownBadge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { getPrograms, upcomingDeadlines } from "@/lib/data";
import { countdownLabel, daysUntil, formatDate, todayET, urgencyFor } from "@/lib/deadlines";
import type { Program } from "@/lib/programs";
import { requireUser } from "@/lib/supabase/server";
import { StatusSelect } from "./row-controls";

export const metadata: Metadata = { title: "Grad programs" };

const ROW_TINT = {
  danger: "bg-danger-soft shadow-[inset_3px_0_0_var(--danger)]",
  warning: "bg-warning-soft shadow-[inset_3px_0_0_var(--warning)]",
  past: "opacity-70",
  ok: "",
  none: "",
} as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function GradPage() {
  const { supabase } = await requireUser();
  const programs = await getPrograms(supabase);
  const today = todayET();
  const next = upcomingDeadlines(programs, 1, today)[0];
  const count = (s: Program["status"]) => programs.filter((p) => p.status === s).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Grad programs"
        title="Your programs"
        description="Every application in one place, sorted by deadline."
        actions={<ButtonLink href="/grad/new">+ Add program</ButtonLink>}
      />

      {programs.length === 0 ? (
        <EmptyState
          title="Add your first program"
          body="Track each program's deadline, fee, GRE policy and status. Deadlines count down here and show up in the banner on every page."
          action={<ButtonLink href="/grad/new">+ Add program</ButtonLink>}
        />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Next deadline"
              value={next ? countdownLabel(next.days).replace(" left", "") : "None"}
              meta={next ? `${next.school} · ${formatDate(next.deadline!)}` : "Nothing upcoming"}
            />
            <StatCard label="Programs" value={programs.length} meta="Being tracked" />
            <StatCard label="Applying" value={count("Applying")} meta="In progress" />
            <StatCard label="Submitted" value={count("Submitted") + count("Decision")} meta={`${count("Decision")} with a decision`} />
          </section>

          <section aria-label="Programs" className="border border-line bg-surface">
            {/* Column headings (desktop) */}
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-line bg-muted px-6 py-3 font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase md:grid">
              <span>Program</span>
              <span>Deadline</span>
              <span>Status</span>
              <span>Details</span>
              <span className="sr-only">Actions</span>
            </div>

            <ul>
              {programs.map((p) => {
                const days = p.deadline ? daysUntil(p.deadline, today) : null;
                const urgency = urgencyFor(days);
                return (
                  <li
                    key={p.id}
                    className={`grid gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4 ${ROW_TINT[urgency]}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-subtle">{p.school}</p>
                      <Link href={`/grad/${p.id}`} className="font-mono text-sm font-semibold text-heading hover:text-link">
                        {p.program}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge>{p.degree}</Badge>
                        {p.field && <Badge>{p.field}</Badge>}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1.5">
                      <CountdownBadge days={days} />
                      <span className="tabular font-mono text-xs text-subtle">{p.deadline ? formatDate(p.deadline) : "Add a deadline"}</span>
                    </div>

                    <StatusSelect id={p.id} status={p.status} label={`${p.school} ${p.program}`} />

                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-subtle">
                      {p.fee !== null && <span className="tabular">${Number(p.fee).toFixed(0)} fee</span>}
                      {p.gre !== "Unknown" && <span>GRE {p.gre.toLowerCase()}</span>}
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline">
                          {hostOf(p.url)} ↗
                        </a>
                      )}
                    </div>

                    <Link
                      href={`/grad/${p.id}`}
                      className="font-mono text-sm text-link hover:underline md:justify-self-end"
                      aria-label={`Edit ${p.school} ${p.program}`}
                    >
                      Edit
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="font-mono text-xs text-subtle">
            Countdowns use US Eastern time. Rows turn amber at 14 days and red at 3.
          </p>
        </>
      )}
    </div>
  );
}
