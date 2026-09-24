import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CompanyPrefButtons } from "@/components/company-pref-button";
import {
  EMPLOYMENT_LABEL,
  FAMILY_LABEL,
  deadlineInfo,
  experienceLabel,
  getCompany,
  getJobs,
  postedLabel,
  salaryLabel,
  timeAgo,
  timingLabel,
  visaBadge,
  workModelBadge,
  type JobGroup,
  type SortKey,
} from "@/lib/jobs";
import { getCompanyPrefs, getJobActions, getProfile, noteVisit, type CompanyPref } from "@/lib/me";
import { qualify, timelineTag, type Profile } from "@/lib/profile";
import { JobCardShell } from "../../jobs/job-card-shell";
import { JobDetails } from "../../jobs/job-details";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Company" };

const SEGMENT_LABEL: Record<string, string> = {
  pharma: "Pharma",
  biotech: "Biotech",
  tools: "Tools",
  cro: "CRO",
  consulting: "Consulting",
  vc: "Venture",
  academic: "Academic",
  tech: "Tech",
};

const LEVEL_LABEL: Record<string, string> = {
  intern: "Intern",
  entry: "Entry level",
  unspecified: "Level not stated",
};

const QUALIFY_TONE = { likely: "success", stretch: "warning", unlikely: "danger" } as const;

// ---------------------------------------------------------------------------
// Job card
// ---------------------------------------------------------------------------

function CompanyJobCard({ g, profile, pref }: { g: JobGroup; profile: Profile; pref: CompanyPref | null }) {
  const j = g.lead;
  const locs = g.locations;
  const locText =
    locs.length === 0 ? "Location not listed" : locs.length > 2 ? `${locs.slice(0, 2).join(" · ")} +${locs.length - 2}` : locs.join(" · ");
  const pay = salaryLabel(j);
  const timing = timingLabel(j);
  const deadline = deadlineInfo(j.deadline);
  const posted = postedLabel(j);
  const exp = experienceLabel(j.experience_min_years);
  const type = j.employment_type && j.employment_type !== "full_time" ? EMPLOYMENT_LABEL[j.employment_type] : null;
  const q = qualify(profile, j);
  const when = timelineTag(profile, { ...j, locations: g.locations });
  const model = workModelBadge(j);
  const visa = visaBadge(j.visa_sponsorship);
  const page = `/jobs/${j.id}?back=${encodeURIComponent(`/companies/${j.company_id}`)}`;

  return (
    <JobCardShell
      ids={[j.id, ...g.listings.filter((l) => l.id !== j.id).map((l) => l.id)]}
      initialStatus={g.status}
      applyHref={`/go/${j.id}`}
      closed={g.closed}
      verified={g.closed ? "no longer on the company's site" : `verified ${timeAgo(j.last_seen_at)}`}
      hiddenView={false}
      footer={
        !g.closed && (
          <JobDetails
            id={j.id}
            requirements={j.requirements ?? []}
            pageHref={page}
            applyUrl={j.url}
            glance={{
              workModel: j.work_model,
              workModelDetail: j.work_model_detail,
              visa: j.visa_sponsorship,
              travel: j.travel,
              housing: j.housing,
              clearance: j.clearance_required,
              extras: j.application_extras,
            }}
          />
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle">
        {g.isNew && <Badge tone="new">NEW</Badge>}
        <span title={`Primer found it ${timeAgo(j.first_seen_at)}`}>{posted ?? `found ${timeAgo(j.first_seen_at)}`}</span>
      </div>
      <Link href={page} className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link">
        {j.title}
        {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
      </Link>
      <p className="mt-0.5 truncate font-mono text-xs text-subtle">{locText}</p>

      {(when || pay || timing || deadline || q || model || visa) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {model && <Badge tone={model.tone}>{model.label}</Badge>}
          {visa && <Badge tone={visa.tone}>{visa.label}</Badge>}
          {when && (
            <Badge tone={when.tone} className="font-semibold">
              {when.label}
            </Badge>
          )}
          {pay && (
            <Badge tone="success" className="font-semibold">
              {pay}
            </Badge>
          )}
          {timing && <Badge tone="brand">{timing}</Badge>}
          {deadline && <Badge tone={deadline.tone}>{deadline.label}</Badge>}
          {q && (
            <span title={q.reasons.length ? q.reasons.join(" · ") : "Nothing in the posting rules you out"}>
              <Badge tone={QUALIFY_TONE[q.level]}>
                {q.level === "likely" ? "✓ " : ""}
                {q.label}
                {q.level === "stretch" && q.reasons[0] ? `: ${q.reasons[0].replace(/^Asks for /, "asks ")}` : ""}
              </Badge>
            </span>
          )}
        </div>
      )}
      <p className="mt-2 font-mono text-[11px] leading-5 text-subtle">
        {[
          exp,
          j.degree_min ? `${j.degree_min.toUpperCase()}+` : null,
          type,
          FAMILY_LABEL[j.role_family] ?? j.role_family,
          LEVEL_LABEL[j.seniority] ?? j.seniority,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </JobCardShell>
  );
}

// ---------------------------------------------------------------------------
// Group header when jobs are grouped by role family
// ---------------------------------------------------------------------------

function FamilyHeader({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-baseline justify-between border-b border-line bg-muted px-4 py-2 sm:px-6">
      <span className="font-mono text-sm font-semibold text-heading">{label}</span>
      <span className="font-mono text-xs text-subtle">
        {count} role{count === 1 ? "" : "s"}
      </span>
    </li>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-100 ${
        active ? "border-brand bg-brand text-white" : "border-line bg-surface text-body hover:border-line-strong hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CompanyPage(props: PageProps<"/companies/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;

  if (!/^[a-z0-9-]{1,80}$/.test(id)) notFound();

  const kind = sp.kind === "intern" || sp.kind === "fulltime" ? (sp.kind as "intern" | "fulltime") : undefined;
  const sort = (["company", "pay", "deadline"] as const).find((k) => k === sp.sort) as SortKey | undefined;

  const { supabase, user } = await requireUser();
  const [company, profile, actions, newSince, companyPrefs] = await Promise.all([
    getCompany(supabase, id),
    getProfile(supabase, user.id),
    getJobActions(supabase),
    noteVisit(supabase),
    getCompanyPrefs(supabase),
  ]);

  if (!company) notFound();
  const co = company!;

  const viewer = { profile, actions, newSince, companyPrefs };

  // Fetch all jobs for stats and the filtered set for display
  const [{ groups: allGroups }, { groups: filteredGroups }] = await Promise.all([
    getJobs(supabase, { view: "all", company: id }, viewer),
    getJobs(supabase, { view: "all", company: id, kind, sort }, viewer),
  ]);

  // Quick stat counts across all open jobs
  const internCount = allGroups.filter((g) => g.lead.seniority === "intern" || g.lead.employment_type === "intern").length;
  const fulltimeCount = allGroups.filter((g) => g.lead.seniority !== "intern" && g.lead.employment_type !== "intern").length;
  const newCount = allGroups.filter((g) => g.isNew).length;

  // Group filtered jobs by role family for display
  const byFamily = new Map<string, JobGroup[]>();
  for (const g of filteredGroups) {
    const fam = g.lead.role_family;
    const arr = byFamily.get(fam) ?? [];
    arr.push(g);
    byFamily.set(fam, arr);
  }
  const families = [...byFamily.entries()].sort((a, b) => b[1].length - a[1].length);

  const pref = companyPrefs.get(id) ?? null;
  const segmentLabel = SEGMENT_LABEL[co.segment] ?? co.segment;

  // Build filter query strings
  const filterHref = (nextKind?: string, nextSort?: string) => {
    const p = new URLSearchParams();
    const k = nextKind !== undefined ? nextKind : kind;
    const s = nextSort !== undefined ? nextSort : sort;
    if (k) p.set("kind", k);
    if (s) p.set("sort", s);
    const qs = p.toString();
    return qs ? `/companies/${id}?${qs}` : `/companies/${id}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/jobs?view=all" className="font-mono text-xs text-link hover:underline">
            ← All jobs
          </Link>
          <PageHeader
            eyebrow={segmentLabel}
            title={co.name}
            description={`${co.open} open role${co.open === 1 ? "" : "s"} · Primer tracks this company's public postings.`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:mt-8 sm:shrink-0">
          <CompanyPrefButtons companyId={id} name={co.name} initial={pref} />
          {co.careersite_url && (
            <a
              href={co.careersite_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface px-3 font-mono text-xs text-body hover:border-line-strong hover:bg-muted"
            >
              Careers site ↗
            </a>
          )}
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Open roles" value={co.open} />
        <StatCard label="Internships" value={internCount} />
        <StatCard label="Full-time" value={fulltimeCount} />
        <StatCard label="New recently" value={newCount} tone={newCount > 0 ? "new" : undefined} meta={newCount > 0 ? "NEW" : undefined} />
      </div>

      {/* Filter and sort bar */}
      <div className="flex flex-col gap-3 border-y border-line py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">Role kind:</span>
          <Chip href={filterHref("", undefined)} active={!kind}>
            All ({co.open})
          </Chip>
          <Chip href={filterHref("intern", undefined)} active={kind === "intern"}>
            Internships ({internCount})
          </Chip>
          <Chip href={filterHref("fulltime", undefined)} active={kind === "fulltime"}>
            Full-time ({fulltimeCount})
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">Sort:</span>
          <Chip href={filterHref(undefined, "")} active={!sort}>
            Newest
          </Chip>
          <Chip href={filterHref(undefined, "deadline")} active={sort === "deadline"}>
            Deadline
          </Chip>
          <Chip href={filterHref(undefined, "pay")} active={sort === "pay"}>
            Highest pay
          </Chip>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState
          title={allGroups.length === 0 ? "No open jobs right now" : "No matching roles"}
          body={
            allGroups.length === 0
              ? "Primer checks this company every 10 minutes. Check back soon, or star it to keep it front of mind."
              : "No roles match this filter. Try viewing all roles."
          }
          action={
            kind ? (
              <Link href={`/companies/${id}`} className="font-mono text-sm text-link hover:underline">
                View all open roles →
              </Link>
            ) : (
              <Link href="/jobs?view=all" className="font-mono text-sm text-link hover:underline">
                See all open jobs →
              </Link>
            )
          }
        />
      ) : (
        <section aria-label={`${co.name} jobs`} className="border border-line bg-surface">
          <ul>
            {families.map(([fam, fGroups]) => (
              <Fragment key={fam}>
                <FamilyHeader label={FAMILY_LABEL[fam] ?? fam} count={fGroups.length} />
                {fGroups.map((g) => (
                  <CompanyJobCard key={g.key} g={g} profile={profile} pref={pref} />
                ))}
              </Fragment>
            ))}
          </ul>
        </section>
      )}

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, dates, deadlines, experience and requirements are read from each posting automatically, so double-check them on the company&apos;s
        page.
      </p>
    </div>
  );
}
