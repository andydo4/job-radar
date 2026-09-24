import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { FAMILIES, FAMILY_LABEL, TIER_LABEL, getCompanyCount, getJobs, getLastRun, timeAgo, type JobGroup, type View } from "@/lib/jobs";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs" };

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", entry: "Entry level", unspecified: "Level not stated" };

function href(view: View, family?: string) {
  const p = new URLSearchParams();
  if (view !== "new") p.set("view", view);
  if (family) p.set("family", family);
  const s = p.toString();
  return s ? `/jobs?${s}` : "/jobs";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 items-center border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-100 ${
        active ? "border-brand bg-brand text-white" : "border-line bg-surface text-body hover:border-line-strong hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

function JobCard({ g }: { g: JobGroup }) {
  const j = g.lead;
  const locs = g.locations;
  const locText = locs.length === 0 ? "Location not listed" : locs.length > 2 ? `${locs.slice(0, 2).join(" · ")} +${locs.length - 2}` : locs.join(" · ");
  const posted = j.posted_at ? timeAgo(j.posted_at) : j.posted_text;
  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-subtle">
          {g.isNew && <Badge tone="new">NEW</Badge>}
          <span className="font-medium text-body">{j.company?.name ?? j.company_id}</span>
          <span aria-hidden>·</span>
          <span>found {timeAgo(j.first_seen_at)}</span>
          {posted && !j.is_backlog && (
            <>
              <span aria-hidden>·</span>
              <span>posted {posted.replace(/^Posted /, "").toLowerCase()}</span>
            </>
          )}
        </div>
        <a
          href={j.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link"
        >
          {j.title}
          {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
        </a>
        <p className="mt-1 truncate font-mono text-xs text-subtle">{locText}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{FAMILY_LABEL[j.role_family] ?? j.role_family}</Badge>
          <Badge>{LEVEL_LABEL[j.seniority] ?? j.seniority}</Badge>
          {j.degree_min && <Badge>{j.degree_min.toUpperCase()}+</Badge>}
          {j.metro_tier === 1 && <Badge tone="brand">{TIER_LABEL[1]}</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-1.5">
        <a
          href={j.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center bg-brand px-4 font-mono text-sm font-medium text-white hover:bg-brand-strong"
        >
          Apply ↗
        </a>
        <span className="font-mono text-[11px] text-subtle">verified {timeAgo(j.last_seen_at)}</span>
      </div>
    </li>
  );
}

export default async function JobsPage(props: PageProps<"/jobs">) {
  const sp = await props.searchParams;
  const view: View = sp.view === "all" ? "all" : "new";
  const family = typeof sp.family === "string" && FAMILIES.some(([f]) => f === sp.family) ? sp.family : undefined;

  const { supabase } = await requireUser();
  const [{ groups }, lastRun, companyCount] = await Promise.all([
    getJobs(supabase, { view, family }),
    getLastRun(supabase),
    getCompanyCount(supabase),
  ]);
  const newToday = groups.filter((g) => g.isNew).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Jobs"
        title={view === "new" ? "New postings" : "All open jobs"}
        description="US entry-level roles across biotech, consulting and venture, straight from each company's own careers site."
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="New in the last 48 hr" value={newToday} meta={view === "new" ? "Shown below" : "Switch to New to see them"} />
        <StatCard label="Companies watched" value={companyCount} meta="Checked every 10 min" />
        <StatCard
          label="Last check"
          value={lastRun ? timeAgo(lastRun.finished_at) : "Never"}
          meta={lastRun ? (lastRun.companies_failed ? `${lastRun.companies_failed} companies failed` : "All companies OK") : "Waiting for the first run"}
        />
      </section>

      <nav aria-label="Filters" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Chip href={href("new", family)} active={view === "new"}>
            New (14 days)
          </Chip>
          <Chip href={href("all", family)} active={view === "all"}>
            All open
          </Chip>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip href={href(view)} active={!family}>
            All types
          </Chip>
          {FAMILIES.map(([f, label]) => (
            <Chip key={f} href={href(view, f)} active={family === f}>
              {label}
            </Chip>
          ))}
        </div>
      </nav>

      {groups.length === 0 ? (
        <EmptyState
          title={lastRun ? (view === "new" ? "Nothing new yet" : "No matching jobs") : "Waiting for the first check"}
          body={
            !lastRun
              ? "The job checker hasn't saved anything yet. Once it runs with the database connected, every open job appears under All open, and anything posted after that shows up here as New."
              : view === "new"
                ? "No new matching postings in the last 14 days. Everything currently open is under All open."
                : "No open jobs match this filter right now."
          }
          action={
            view === "new" && lastRun ? (
              <Link href={href("all", family)} className="font-mono text-sm text-link hover:underline">
                See all open jobs →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <section aria-label="Jobs" className="border border-line bg-surface">
          <ul>
            {groups.map((g) => (
              <JobCard key={g.key} g={g} />
            ))}
          </ul>
        </section>
      )}

      <p className="font-mono text-xs text-subtle">
        Showing US jobs at intern, entry or unstated level. Jobs vanish from this list within about 20 minutes of a company
        closing them (up to about 6 hours for big Workday boards like Pfizer).
      </p>
    </div>
  );
}
