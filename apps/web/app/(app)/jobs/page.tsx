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
  salaryLabel,
  timeAgo,
  type JobFilters,
  type JobGroup,
  type SortKey,
} from "@/lib/jobs";
import { CompanySelect } from "./company-select";
import { JobDetails } from "./job-details";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs" };

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", entry: "Entry level", unspecified: "Level not stated" };

function parseFilters(sp: Record<string, string | string[] | undefined>): JobFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const exp = one("exp");
  return {
    view: one("view") === "all" ? "all" : "new",
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
  if (n.view !== "new") p.set("view", n.view);
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

function JobCard({ g, listHref }: { g: JobGroup; listHref: string }) {
  const j = g.lead;
  const locs = g.locations;
  const locText = locs.length === 0 ? "Location not listed" : locs.length > 2 ? `${locs.slice(0, 2).join(" · ")} +${locs.length - 2}` : locs.join(" · ");
  const posted = j.posted_at ? timeAgo(j.posted_at) : j.posted_text;
  const pay = salaryLabel(j);
  const exp = experienceLabel(j.experience_min_years);
  const type = j.employment_type && j.employment_type !== "full_time" ? EMPLOYMENT_LABEL[j.employment_type] : null;
  const reqs = j.requirements ?? [];

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
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
          <Link href={jobHref(j.id, listHref)} className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link">
            {j.title}
            {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
          </Link>
          <p className="mt-1 truncate font-mono text-xs text-subtle">{locText}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pay && <Badge tone="success">{pay}</Badge>}
            {exp && <Badge>{exp}</Badge>}
            {j.degree_min && <Badge>{j.degree_min.toUpperCase()}+</Badge>}
            {type && <Badge tone="warning">{type}</Badge>}
            <Badge>{FAMILY_LABEL[j.role_family] ?? j.role_family}</Badge>
            <Badge>{LEVEL_LABEL[j.seniority] ?? j.seniority}</Badge>
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
      </div>

      <JobDetails id={j.id} requirements={reqs} pageHref={jobHref(j.id, listHref)} applyUrl={j.url} />
    </li>
  );
}

export default async function JobsPage(props: PageProps<"/jobs">) {
  const f = parseFilters(await props.searchParams);

  const { supabase } = await requireUser();
  const [{ groups }, lastRun, companyCount, companies] = await Promise.all([
    getJobs(supabase, f),
    getLastRun(supabase),
    getCompanyCount(supabase),
    getCompanyCounts(supabase, f),
  ]);
  const listHref = href(f, {});
  const baseQuery = href(f, { company: undefined }).replace(/^\/jobs\??/, "");
  const newToday = groups.filter((g) => g.isNew).length;
  const filtered = f.exp !== undefined || f.degree || f.pay || f.noContract || f.family || f.company;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Jobs"
        title={f.view === "new" ? "New postings" : "All open jobs"}
        description="US entry-level roles across biotech, consulting and venture, straight from each company's own careers site."
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="New in the last 48 hr" value={newToday} meta={f.view === "new" ? "Shown below" : "Switch to New to see them"} />
        <StatCard label="Companies watched" value={companyCount} meta="Checked every 10 min" />
        <StatCard
          label="Last check"
          value={lastRun ? timeAgo(lastRun.finished_at) : "Never"}
          meta={lastRun ? (lastRun.companies_failed ? `${lastRun.companies_failed} companies failed` : "All companies OK") : "Waiting for the first run"}
        />
      </section>

      <nav aria-label="Filters" className="flex flex-col gap-3 border border-line bg-card p-4 sm:p-5">
        <FilterRow label="Show">
          <Chip href={href(f, { view: "new" })} active={f.view === "new"}>
            New (14 days)
          </Chip>
          <Chip href={href(f, { view: "all" })} active={f.view === "all"}>
            All open
          </Chip>
        </FilterRow>
        <FilterRow label="Type">
          <Chip href={href(f, { family: undefined })} active={!f.family}>
            All
          </Chip>
          {FAMILIES.map(([fam, label]) => (
            <Chip key={fam} href={href(f, { family: fam })} active={f.family === fam}>
              {label}
            </Chip>
          ))}
        </FilterRow>
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
      </nav>

      {groups.length === 0 ? (
        <EmptyState
          title={lastRun ? (f.view === "new" ? "Nothing new yet" : "No matching jobs") : "Waiting for the first check"}
          body={
            !lastRun
              ? "The job checker hasn't saved anything yet. Once it runs with the database connected, every open job appears under All open, and anything posted after that shows up here as New."
              : filtered
                ? "No jobs match these filters. Try loosening one, or clear them."
                : f.view === "new"
                  ? "No new matching postings in the last 14 days. Everything currently open is under All open."
                  : "No open jobs right now."
          }
          action={
            f.view === "new" && lastRun ? (
              <Link href={href(f, { view: "all" })} className="font-mono text-sm text-link hover:underline">
                See all open jobs →
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
              const header = f.sort === "company" && (!prev || (prev.lead.company?.name ?? prev.lead.company_id) !== name);
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
                  <JobCard g={g} listHref={listHref} />
                </Fragment>
              );
            })}
          </ul>
        </section>
      )}

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, experience and requirements are read from each posting automatically, so double-check them on the company&apos;s
        page. Jobs that don&apos;t mention experience or a degree are kept when you filter. Closed jobs disappear within about
        20 minutes (up to about 6 hours for big Workday boards like Pfizer).
      </p>
    </div>
  );
}
