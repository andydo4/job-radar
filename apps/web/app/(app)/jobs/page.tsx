import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import {
  EMPLOYMENT_LABEL,
  FAMILIES,
  FAMILY_LABEL,
  TIER_LABEL,
  experienceLabel,
  getCompanyCount,
  getCompanyCounts,
  getJobs,
  getLastRun,
  isMarkView,
  salaryLabel,
  timeAgo,
  type JobFilters,
  type JobGroup,
  type SortKey,
  type View,
} from "@/lib/jobs";
import { getJobActions, getProfile, noteVisit } from "@/lib/me";
import { qualify, type Profile } from "@/lib/profile";
import { CompanySelect } from "./company-select";
import { JobCardShell } from "./job-card-shell";
import { JobDetails } from "./job-details";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs" };

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", entry: "Entry level", unspecified: "Level not stated" };

function parseFilters(sp: Record<string, string | string[] | undefined>): JobFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const exp = one("exp");
  const views: View[] = ["all", "saved", "applied", "hidden"];
  return {
    view: views.find((v) => v === one("view")) ?? "foryou",
    since: one("since") === "visit" || one("since") === "week" ? (one("since") as "visit" | "week") : undefined,
    family: FAMILIES.some(([f]) => f === one("family")) ? one("family") : undefined,
    exp: exp !== undefined && /^[0-3]$/.test(exp) ? Number(exp) : undefined,
    degree: one("degree") === "bs" || one("degree") === "ms" ? (one("degree") as "bs" | "ms") : undefined,
    pay: one("pay") === "1",
    noContract: one("contract") === "hide",
    company: /^[a-z0-9-]{1,80}$/.test(one("company") ?? "") ? one("company") : undefined,
    sort: (["company", "pay"] as const).find((k) => k === one("sort")) as SortKey | undefined,
  };
}

/** Link to the same page with some filters changed (undefined/false removes one). */
function href(f: JobFilters, change: Partial<JobFilters>) {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.view !== "foryou") p.set("view", n.view);
  if (n.since) p.set("since", n.since);
  if (n.family) p.set("family", n.family);
  if (n.exp !== undefined) p.set("exp", String(n.exp));
  if (n.degree) p.set("degree", n.degree);
  if (n.pay) p.set("pay", "1");
  if (n.noContract) p.set("contract", "hide");
  if (n.company) p.set("company", n.company);
  if (n.sort && n.sort !== "new") p.set("sort", n.sort);
  const s = p.toString();
  return s ? `/jobs?${s}` : "/jobs";
}

/** Link to a job's own page that remembers the filtered list you came from. */
function jobHref(id: number, listHref: string) {
  return `/jobs/${id}?back=${encodeURIComponent(listHref)}`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 items-center border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-100 ${
        active ? "border-brand bg-brand text-white" : "border-line bg-surface text-body hover:border-line-strong hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{label}</span>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">{children}</div>
    </div>
  );
}

const QUALIFY_TONE = { likely: "success", stretch: "warning", unlikely: "danger" } as const;

function JobCard({ g, listHref, profile, hiddenView }: { g: JobGroup; listHref: string; profile: Profile; hiddenView: boolean }) {
  const j = g.lead;
  const locs = g.locations;
  const locText = locs.length === 0 ? "Location not listed" : locs.length > 2 ? `${locs.slice(0, 2).join(" · ")} +${locs.length - 2}` : locs.join(" · ");
  const posted = j.posted_at ? timeAgo(j.posted_at) : j.posted_text;
  const pay = salaryLabel(j);
  const exp = experienceLabel(j.experience_min_years);
  const type = j.employment_type && j.employment_type !== "full_time" ? EMPLOYMENT_LABEL[j.employment_type] : null;
  const reqs = j.requirements ?? [];
  const q = qualify(profile, j);
  const page = jobHref(j.id, listHref);

  return (
    <JobCardShell
      ids={[j.id, ...g.listings.filter((l) => l.id !== j.id).map((l) => l.id)]}
      initialStatus={g.status}
      applyHref={`/go/${j.id}`}
      closed={g.closed}
      verified={g.closed ? "no longer on the company's site" : `verified ${timeAgo(j.last_seen_at)}`}
      hiddenView={hiddenView}
      footer={!g.closed && <JobDetails id={j.id} requirements={reqs} pageHref={page} applyUrl={j.url} />}
    >
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
      <Link href={page} className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link">
        {j.title}
        {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
      </Link>
      <p className="mt-1 truncate font-mono text-xs text-subtle">{locText}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {q && (
          <span title={q.reasons.length ? q.reasons.join(" · ") : "Nothing in the posting rules you out"}>
            <Badge tone={QUALIFY_TONE[q.level]}>
              {q.level === "likely" ? "✓ " : ""}
              {q.label}
              {q.level === "stretch" && q.reasons[0] ? `: ${q.reasons[0].replace(/^Asks for /, "asks ")}` : ""}
            </Badge>
          </span>
        )}
        {pay && <Badge tone="success">{pay}</Badge>}
        {exp && <Badge>{exp}</Badge>}
        {j.degree_min && <Badge>{j.degree_min.toUpperCase()}+</Badge>}
        {type && <Badge tone="warning">{type}</Badge>}
        <Badge>{FAMILY_LABEL[j.role_family] ?? j.role_family}</Badge>
        <Badge>{LEVEL_LABEL[j.seniority] ?? j.seniority}</Badge>
        {j.metro_tier === 1 && <Badge tone="brand">{TIER_LABEL[1]}</Badge>}
      </div>
    </JobCardShell>
  );
}

const VIEW_TITLE: Record<View, string> = {
  foryou: "For you",
  all: "All open jobs",
  saved: "Saved",
  applied: "Applied",
  hidden: "Hidden jobs",
};

export default async function JobsPage(props: PageProps<"/jobs">) {
  const sp = await props.searchParams;
  const f = parseFilters(sp);

  const { supabase, user } = await requireUser();
  const [profile, actions, newSince] = await Promise.all([getProfile(supabase, user.id), getJobActions(supabase), noteVisit(supabase)]);
  const viewer = { profile, actions, newSince };
  const [{ groups, hiddenCount }, lastRun, companyCount, companies] = await Promise.all([
    getJobs(supabase, f, viewer),
    getLastRun(supabase),
    getCompanyCount(supabase),
    getCompanyCounts(supabase, f, viewer),
  ]);
  const listHref = href(f, {});
  const baseQuery = href(f, { company: undefined }).replace(/^\/jobs\??/, "");
  const newCount = groups.filter((g) => g.isNew).length;
  const marks = isMarkView(f.view);
  const filtered = f.exp !== undefined || f.degree || f.pay || f.noContract || f.family || f.company || f.since;
  const counts = { saved: 0, applied: 0 };
  for (const st of actions.values()) if (st === "saved" || st === "applied") counts[st]++;
  const since = new Date(newSince);

  return (
    <div className="flex flex-col gap-8">
      {sp.saved === "profile" && (
        <p role="status" className="border border-success/30 bg-success-soft px-4 py-3 font-mono text-sm text-success">
          Profile saved. For you now uses it.
        </p>
      )}
      <PageHeader
        eyebrow="Jobs"
        title={VIEW_TITLE[f.view]}
        description={
          f.view === "foryou"
            ? "Jobs that fit your profile: the kinds of roles, places, degree and experience you picked in Settings."
            : f.view === "all"
              ? "Every US entry-level role Primer tracks across biotech, consulting and venture, straight from each company's careers site."
              : f.view === "hidden"
                ? "Jobs you hid. Unhide one to see it in your lists again."
                : "Kept here even after the company takes the posting down."
        }
        actions={
          f.view === "foryou" ? (
            <Link href="/settings" className="font-mono text-xs text-link hover:underline">
              Edit what &ldquo;For you&rdquo; means →
            </Link>
          ) : undefined
        }
      />

      {!marks && (
        <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label="New since your last visit"
            value={newCount}
            meta={
              <Link href={href(f, { since: f.since === "visit" ? undefined : "visit" })} scroll={false} className="text-link hover:underline">
                {f.since === "visit" ? "Show everything" : `Only show these · since ${since.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`}
              </Link>
            }
          />
          <StatCard label="Companies watched" value={companyCount} meta="Checked every 10 min" />
          <StatCard
            label="Last check"
            value={lastRun ? timeAgo(lastRun.finished_at) : "Never"}
            meta={lastRun ? (lastRun.companies_failed ? `${lastRun.companies_failed} companies failed` : "All companies OK") : "Waiting for the first run"}
          />
        </section>
      )}

      <nav aria-label="Filters" className="flex flex-col gap-3 border border-line bg-card p-4 sm:p-5">
        <FilterRow label="Show">
          <Chip href={href({ view: "foryou", sort: f.sort }, {})} active={f.view === "foryou"}>
            For you
          </Chip>
          <Chip href={href({ view: "all", sort: f.sort }, {})} active={f.view === "all"}>
            All jobs
          </Chip>
          <Chip href={href({ view: "saved" }, {})} active={f.view === "saved"}>
            ★ Saved{counts.saved ? ` (${counts.saved})` : ""}
          </Chip>
          <Chip href={href({ view: "applied" }, {})} active={f.view === "applied"}>
            ✓ Applied{counts.applied ? ` (${counts.applied})` : ""}
          </Chip>
          {(hiddenCount > 0 || f.view === "hidden") && (
            <Chip href={href({ view: "hidden" }, {})} active={f.view === "hidden"}>
              Hidden ({hiddenCount})
            </Chip>
          )}
        </FilterRow>
        {!marks && (
          <FilterRow label="Found">
            <Chip href={href(f, { since: undefined })} active={!f.since}>
              Any time
            </Chip>
            <Chip href={href(f, { since: "visit" })} active={f.since === "visit"}>
              Since your last visit
            </Chip>
            <Chip href={href(f, { since: "week" })} active={f.since === "week"}>
              Last 7 days
            </Chip>
          </FilterRow>
        )}
        <FilterRow label="Type">
          <Chip href={href(f, { family: undefined })} active={!f.family}>
            All
          </Chip>
          {FAMILIES.filter(([fam]) => f.view !== "foryou" || profile.families.includes(fam) || f.family === fam).map(([fam, label]) => (
            <Chip key={fam} href={href(f, { family: fam })} active={f.family === fam}>
              {label}
            </Chip>
          ))}
        </FilterRow>
        {!marks && (
          <>
            <FilterRow label="Company">
              <CompanySelect companies={companies} value={f.company} baseQuery={baseQuery} />
            </FilterRow>
            <FilterRow label="Sort">
              <Chip href={href(f, { sort: undefined })} active={!f.sort}>
                Newest first
              </Chip>
              <Chip href={href(f, { sort: "company" })} active={f.sort === "company"}>
                Company A–Z
              </Chip>
              <Chip href={href(f, { sort: "pay" })} active={f.sort === "pay"}>
                Highest pay
              </Chip>
            </FilterRow>
            <FilterRow label="Experience">
              <Chip href={href(f, { exp: undefined })} active={f.exp === undefined}>
                Any
              </Chip>
              {[0, 1, 2, 3].map((n) => (
                <Chip key={n} href={href(f, { exp: n })} active={f.exp === n}>
                  {n === 0 ? "No experience" : `Up to ${n} yr${n > 1 ? "s" : ""}`}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Degree">
              <Chip href={href(f, { degree: undefined })} active={!f.degree}>
                Any
              </Chip>
              <Chip href={href(f, { degree: "bs" })} active={f.degree === "bs"}>
                Bachelor&apos;s is enough
              </Chip>
              <Chip href={href(f, { degree: "ms" })} active={f.degree === "ms"}>
                Master&apos;s is enough
              </Chip>
            </FilterRow>
            <FilterRow label="Other">
              <Chip href={href(f, { pay: !f.pay })} active={Boolean(f.pay)}>
                {f.pay ? "✓ " : ""}Pay listed
              </Chip>
              <Chip href={href(f, { noContract: !f.noContract })} active={Boolean(f.noContract)}>
                {f.noContract ? "✓ " : ""}Hide contract
              </Chip>
              {filtered && (
                <Link href={href({ view: f.view, sort: f.sort }, {})} scroll={false} className="inline-flex h-9 items-center px-2 font-mono text-xs text-link hover:underline">
                  Clear filters
                </Link>
              )}
            </FilterRow>
          </>
        )}
      </nav>

      {groups.length === 0 ? (
        <EmptyState
          title={
            !lastRun
              ? "Waiting for the first check"
              : f.view === "saved"
                ? "Nothing saved yet"
                : f.view === "applied"
                  ? "No applications marked yet"
                  : f.view === "hidden"
                    ? "Nothing hidden"
                    : f.since === "visit"
                      ? "Nothing new since your last visit"
                      : "No matching jobs"
          }
          body={
            !lastRun
              ? "The job checker hasn't saved anything yet. Once it runs with the database connected, jobs appear here."
              : f.view === "saved"
                ? "Tap ☆ Save on any job to keep it here. Saved jobs stay even after the company closes the posting."
                : f.view === "applied"
                  ? "After you click Apply, Primer asks whether you applied. Say yes (or tap ○ Applied) to track it here."
                  : f.view === "hidden"
                    ? "Jobs you hide disappear from every list and land here."
                    : filtered
                      ? "No jobs match these filters. Try loosening one, or clear them."
                      : f.view === "foryou"
                        ? "Nothing open matches your profile right now. Try All jobs, or widen your profile in Settings."
                        : "No open jobs right now."
          }
          action={
            f.view === "foryou" && lastRun ? (
              <Link href={href({ view: "all" }, {})} className="font-mono text-sm text-link hover:underline">
                See all jobs →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <section aria-label="Jobs" className="border border-line bg-surface">
          <ul>
            {groups.map((g, i) => {
              const name = g.lead.company?.name ?? g.lead.company_id;
              const prev = groups[i - 1];
              const header = f.sort === "company" && !marks && (!prev || (prev.lead.company?.name ?? prev.lead.company_id) !== name);
              const count = header ? groups.filter((x) => x.lead.company_id === g.lead.company_id).length : 0;
              return (
                <Fragment key={g.key}>
                  {header && (
                    <li className="flex items-baseline justify-between border-b border-line bg-muted px-4 py-2 sm:px-6">
                      <span className="font-mono text-sm font-semibold text-heading">{name}</span>
                      <span className="font-mono text-xs text-subtle">
                        {count} role{count === 1 ? "" : "s"}
                      </span>
                    </li>
                  )}
                  <JobCard g={g} listHref={listHref} profile={profile} hiddenView={f.view === "hidden"} />
                </Fragment>
              );
            })}
          </ul>
        </section>
      )}

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, experience and requirements are read from each posting automatically, so double-check them on the company&apos;s
        page. &ldquo;Likely qualify&rdquo; only means nothing we could read rules you out. Apply checks with the company first,
        so you won&apos;t land on a dead posting.
      </p>
    </div>
  );
}
