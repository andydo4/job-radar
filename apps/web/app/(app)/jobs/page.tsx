import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JOBS_QUERY_COOKIE, validJobsQuery } from "@/lib/remember";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { CompanyPrefButtons } from "@/components/company-pref-button";
import {
  EMPLOYMENT_LABEL,
  FAMILIES,
  FAMILY_LABEL,
  TIER_LABEL,
  deadlineInfo,
  experienceLabel,
  getCompanyCount,
  getCompanyCounts,
  getJobs,
  getLastRun,
  getMapJobs,
  PAGE_SIZE,
  isMarkView,
  postedLabel,
  salaryLabel,
  timeAgo,
  timingLabel,
  trackFamilies,
  workModelBadge,
  type JobFilters,
  type JobGroup,
  type SortKey,
  type View,
} from "@/lib/jobs";
import { getCompanyPrefs, getJobActions, getProfile, noteVisit, type CompanyPref } from "@/lib/me";
import { qualify, timelineTag, type Profile } from "@/lib/profile";
import { CompanySelect } from "./company-select";
import { FiltersShell, SortSelect } from "./filters-shell";
import { JobCardShell } from "./job-card-shell";
import { JobDetails } from "./job-details";
import { RememberFilters } from "./remember-filters";
import { UsMap } from "./us-map";
import { NO_STATE, REMOTE, cityCounts, parseCity, parseState, placeName, type StateCount } from "@/lib/map";
import { requireUser } from "@/lib/supabase/server";
import { newestListing } from "@/lib/sort";

export const metadata: Metadata = { title: "Jobs" };

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", entry: "Entry level", unspecified: "Level not stated" };

function parseFilters(sp: Record<string, string | string[] | undefined>): JobFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const exp = one("exp");
  const views: View[] = ["all", "saved", "applied", "hidden"];
  return {
    view: views.find((v) => v === one("view")) ?? "foryou",
    since: one("since") === "visit" || one("since") === "week" ? (one("since") as "visit" | "week") : undefined,
    family: (() => {
      const want = (one("family") ?? "").split(",");
      const fams = FAMILIES.map(([f]) => f as string).filter((f) => want.includes(f));
      return fams.length ? fams : undefined;
    })(),
    exp: exp !== undefined && /^[0-3]$/.test(exp) ? Number(exp) : undefined,
    degree: one("degree") === "bs" || one("degree") === "ms" ? (one("degree") as "bs" | "ms") : undefined,
    pay: one("pay") === "1",
    noContract: one("contract") === "hide",
    company: /^[a-z0-9-]{1,80}$/.test(one("company") ?? "") ? one("company") : undefined,
    starred: one("starred") === "1",
    fit: one("fit") === "likely" || one("fit") === "ok" ? (one("fit") as "likely" | "ok") : undefined,
    kind: one("kind") === "intern" || one("kind") === "fulltime" ? (one("kind") as "intern" | "fulltime") : undefined,
    sort: (["company", "pay", "deadline"] as const).find((k) => k === one("sort")) as SortKey | undefined,
    map: one("mode") === "map",
    state: parseState(one("state")),
    city: parseState(one("state")) ? parseCity(one("city")) ?? (one("city") === "" ? "" : undefined) : undefined,
    show: /^\d{1,4}$/.test(one("show") ?? "") ? Math.min(2000, Math.max(PAGE_SIZE, Number(one("show")))) : undefined,
  };
}

/** Link to the same page with some filters changed (undefined/false removes one). */
function href(f: JobFilters, change: Partial<JobFilters>) {
  // "Load more" depth is kept only for this exact list (and links back to it), not when a filter changes.
  const keepShow = "show" in change || Object.keys(change).length === 0;
  const n = { ...f, ...change, show: keepShow ? ("show" in change ? change.show : f.show) : undefined };
  const p = new URLSearchParams();
  // Always explicit, so a bare /jobs means "bring back my last filters".
  p.set("view", n.view);
  if (n.map) p.set("mode", "map");
  if (n.since) p.set("since", n.since);
  if (n.fit) p.set("fit", n.fit);
  if (n.starred) p.set("starred", "1");
  if (n.kind) p.set("kind", n.kind);
  if (n.family?.length) p.set("family", n.family.join(","));
  if (n.exp !== undefined) p.set("exp", String(n.exp));
  if (n.degree) p.set("degree", n.degree);
  if (n.pay) p.set("pay", "1");
  if (n.noContract) p.set("contract", "hide");
  if (n.company) p.set("company", n.company);
  if (n.sort && n.sort !== "new") p.set("sort", n.sort);
  if (n.state) p.set("state", n.state);
  if (n.state && n.city !== undefined) p.set("city", n.city);
  if (n.show && n.show > PAGE_SIZE) p.set("show", String(n.show));
  const s = p.toString();
  return s ? `/jobs?${s}` : "/jobs";
}

/** Tap a job type: add it to the selection, or take it out (none left = All). Kept in FAMILIES order. */
function toggleFamily(current: string[] | undefined, fam: string): string[] | undefined {
  const set = new Set(current ?? []);
  if (set.has(fam)) set.delete(fam);
  else set.add(fam);
  const next = FAMILIES.map(([f]) => f as string).filter((f) => set.has(f));
  return next.length ? next : undefined;
}

/** Link to a job's own page that remembers the filtered list you came from. */
function jobHref(id: number, listHref: string) {
  return `/jobs/${id}?back=${encodeURIComponent(listHref)}`;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

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

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 min-w-0 shrink-0 items-center justify-center gap-1 px-1 font-mono text-xs whitespace-nowrap transition-colors duration-100 sm:gap-1.5 sm:px-3 sm:text-sm ${
        active ? "bg-heading font-medium text-bg" : "text-subtle hover:bg-muted hover:text-heading"
      }`}
    >
      {children}
    </Link>
  );
}

/** List / Map switch; the choice is part of the URL, so it's remembered like the filters. */
function ModeSwitch({ listHref, mapHref, map, compact }: { listHref: string; mapHref: string; map: boolean; compact?: boolean }) {
  const cls = (on: boolean) =>
    `inline-flex h-8 items-center gap-1.5 ${compact ? "px-2.5" : "px-3"} font-mono text-xs transition-colors duration-100 ${on ? "bg-brand text-white" : "text-body hover:bg-muted"}`;
  return (
    <div role="group" aria-label="Show jobs as" className="inline-flex shrink-0 self-start border border-line-strong bg-surface p-0.5 sm:self-auto">
      <Link href={listHref} scroll={false} aria-current={!map ? "true" : undefined} className={cls(!map)}>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="square" />
        </svg>
        <span className={compact ? "sr-only" : ""}>List</span>
      </Link>
      <Link href={mapHref} scroll={false} aria-current={map ? "true" : undefined} className={cls(map)}>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14" strokeLinejoin="round" />
        </svg>
        <span className={compact ? "sr-only" : ""}>Map</span>
      </Link>
    </div>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A removable "active filter" pill. */
function ActiveChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex h-7 items-center gap-1.5 border border-brand-soft bg-brand-softer px-2 font-mono text-xs text-link hover:border-brand"
      title="Remove this filter"
    >
      {children}
      <span aria-hidden className="text-subtle">
        ×
      </span>
      <span className="sr-only">(remove)</span>
    </Link>
  );
}

const QUALIFY_TONE = { likely: "success", stretch: "warning", unlikely: "danger" } as const;

// ---------------------------------------------------------------------------
// One job
// ---------------------------------------------------------------------------

function JobCard({
  g,
  listHref,
  profile,
  hiddenView,
  starred,
}: {
  g: JobGroup;
  listHref: string;
  profile: Profile;
  hiddenView: boolean;
  starred: boolean;
}) {
  const j = g.lead;
  const locs = g.locations;
  const locText = locs.length === 0 ? "Location not listed" : locs.length > 2 ? `${locs.slice(0, 2).join(" · ")} +${locs.length - 2}` : locs.join(" · ");
  const pay = salaryLabel(j);
  const timing = timingLabel(j);
  const deadline = deadlineInfo(j.deadline);
  // Label the role by its newest listing, so it matches "Newest posted" (a new city can re-open an old role).
  const newest = newestListing(g);
  const posted = postedLabel(newest);
  const newCity = g.listings.length > 1 && newest.id !== j.id && newest.locations[0] ? ` (${newest.locations[0]})` : "";
  const exp = experienceLabel(j.experience_min_years);
  const type = j.employment_type && j.employment_type !== "full_time" ? EMPLOYMENT_LABEL[j.employment_type] : null;
  const q = qualify(profile, j);
  const when = timelineTag(profile, { ...j, locations: g.locations });
  const page = jobHref(j.id, listHref);
  const model = workModelBadge(j);

  return (
    <JobCardShell
      ids={[j.id, ...g.listings.filter((l) => l.id !== j.id).map((l) => l.id)]}
      initialStatus={g.status}
      applyHref={`/go/${j.id}`}
      closed={g.closed}
      verified={g.closed ? "no longer on the company's site" : `verified ${timeAgo(j.last_seen_at)}`}
      hiddenView={hiddenView}
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
        <span className="font-medium text-body">
          {starred && (
            <span className="text-link" title="A company you starred">
              ★{" "}
            </span>
          )}
          <Link href={`/companies/${j.company_id}`} className="hover:text-link hover:underline" title={`${j.company?.name ?? j.company_id} company page`}>
            {j.company?.name ?? j.company_id}
          </Link>
        </span>
        <span aria-hidden>·</span>
        <span title={`Primer found it ${timeAgo(newest.first_seen_at)}`}>
          {posted ?? `found ${timeAgo(newest.first_seen_at)}`}
          {newCity}
        </span>
      </div>
      <Link href={page} className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link">
        {j.title}
        {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
      </Link>
      <p className="mt-0.5 truncate font-mono text-xs text-subtle">{locText}</p>

      {/* The facts people decide on first */}
      {(when || pay || timing || deadline || q || model) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {model && <Badge tone={model.tone}>{model.label}</Badge>}
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
      {/* Everything else, quieter */}
      <p className="mt-2 font-mono text-[11px] leading-5 text-subtle">
        {[
          exp,
          j.degree_min ? `${j.degree_min.toUpperCase()}+` : null,
          type,
          FAMILY_LABEL[j.role_family] ?? j.role_family,
          LEVEL_LABEL[j.seniority] ?? j.seniority,
          j.metro_tier === 1 ? TIER_LABEL[1] : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </JobCardShell>
  );
}

/** "Showing 50 of 812 · Load 50 more". A link, so the deeper list survives Back from a job page. */
function LoadMore({ shown, total, href }: { shown: number; total: number; href: string }) {
  if (total <= shown) return total > PAGE_SIZE ? <p className="text-center font-mono text-xs text-subtle">All {total} roles shown</p> : null;
  return (
    <div className="flex flex-col items-center gap-2">
      <Link href={href} scroll={false} className="inline-flex h-11 w-full items-center justify-center border border-line-strong bg-surface font-mono text-sm font-medium text-heading hover:bg-muted sm:w-auto sm:px-8">
        Load {Math.min(PAGE_SIZE, total - shown)} more
      </Link>
      <p className="font-mono text-xs text-subtle">
        Showing {shown} of {total} roles
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map mode
// ---------------------------------------------------------------------------

function PlaceTile({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-9 items-center gap-2 border px-3 font-mono text-xs transition-colors duration-100 ${
        active ? "border-heading bg-muted text-heading" : "border-line bg-surface text-body hover:border-line-strong hover:bg-muted"
      }`}
    >
      {label}
      <span className="font-semibold text-heading">{count}</span>
    </Link>
  );
}

function MapView({
  f,
  data,
  lastRun,
  baseHref,
  cityHref,
  jobList,
  moreHref,
}: {
  f: JobFilters;
  data: { counts: StateCount[]; all: JobGroup[]; picked: JobGroup[]; selected: JobGroup[]; truncated: boolean };
  moreHref: string;
  lastRun: boolean;
  /** This page without a picked state. */
  baseHref: string;
  cityHref: (city: string | undefined) => string;
  jobList: (groups: JobGroup[]) => React.ReactNode;
}) {
  const byCode = new Map(data.counts.map((c) => [c.code, c]));
  const states = data.counts.filter((c) => c.code !== REMOTE && c.code !== NO_STATE);
  const stateHref = (code: string) => (code === f.state ? baseHref : `${baseHref}&state=${code}`);
  const sel = f.state ? (byCode.get(f.state) ?? { code: f.state, roles: 0, fresh: 0, top: [] }) : null;
  const cities = f.state && f.state !== REMOTE && f.state !== NO_STATE ? cityCounts(data.all, f.state) : [];
  const max = states[0]?.roles ?? 0;
  const shown = f.city !== undefined ? data.selected.length : sel?.roles ?? 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start">
      <section aria-label="Map" className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-5 xl:sticky xl:top-4">
        <p className="font-mono text-xs text-subtle">
          <span className="font-semibold text-heading">{data.all.length}</span> role{data.all.length === 1 ? "" : "s"} in{" "}
          <span className="font-semibold text-heading">{states.length}</span> state{states.length === 1 ? "" : "s"}
          {data.all.length > 0 && " · a role in several states counts in each"}
        </p>
        <UsMap counts={data.counts} selected={f.state ?? null} baseHref={baseHref} />
        {(byCode.get(REMOTE) || byCode.get(NO_STATE)) && (
          <div className="flex flex-wrap gap-2">
            {byCode.get(REMOTE) && <PlaceTile href={stateHref(REMOTE)} active={f.state === REMOTE} label="Remote (US)" count={byCode.get(REMOTE)!.roles} />}
            {byCode.get(NO_STATE) && <PlaceTile href={stateHref(NO_STATE)} active={f.state === NO_STATE} label="No state listed" count={byCode.get(NO_STATE)!.roles} />}
          </div>
        )}
        {data.truncated && <p className="font-mono text-[11px] text-subtle">Counts use the newest 8,000 listings. Add a filter to narrow it down.</p>}
      </section>

      <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-9rem)] xl:overflow-y-auto xl:overscroll-contain">
        {!sel ? (
          states.length === 0 ? (
            <EmptyState
              title={lastRun ? "No matching jobs" : "Waiting for the first check"}
              body={lastRun ? "Nothing matches these filters anywhere in the US. Try removing one." : "Once the job checker runs, the map fills in."}
            />
          ) : (
            <section aria-label="Top states" className="border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-3 font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase sm:px-5">
                Top states · pick one on the map
              </h2>
              <ol>
                {states.slice(0, 12).map((c, i) => (
                  <li key={c.code} className="border-b border-line last:border-b-0">
                    <Link href={stateHref(c.code)} scroll={false} className="flex items-center gap-3 px-4 py-2.5 font-mono text-sm hover:bg-muted sm:px-5">
                      <span className="w-5 text-right text-xs text-subtle">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-heading">{placeName(c.code)}</span>
                        <span className="mt-1 block h-1 bg-muted">
                          <span className="block h-full bg-brand" style={{ width: `${Math.max(3, (c.roles / max) * 100)}%` }} />
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="font-semibold text-heading">{c.roles}</span>
                        {c.fresh > 0 && <span className="ml-1.5 bg-lime px-1 text-[11px] text-on-lime">{c.fresh} new</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )
        ) : (
          <>
            <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5 xl:sticky xl:top-0 xl:z-10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl leading-tight text-heading">{placeName(sel.code)}</h2>
                  <p className="mt-1 font-mono text-xs text-subtle">
                    <span className="font-semibold text-heading">{sel.roles}</span> role{sel.roles === 1 ? "" : "s"}
                    {sel.fresh > 0 && <span className="text-link"> · {sel.fresh} new since your last visit</span>}
                    {sel.top.length > 0 && <> · most at {sel.top.join(", ")}</>}
                  </p>
                </div>
                <Link href={baseHref} scroll={false} aria-label="Clear the picked state" className="grid size-9 shrink-0 place-items-center border border-line font-mono text-sm text-subtle hover:border-line-strong hover:text-heading">
                  ✕
                </Link>
              </div>
              {cities.length > 1 && (
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0" aria-label="Cities">
                  <Chip href={cityHref(undefined)} active={f.city === undefined}>
                    All
                  </Chip>
                  {cities.slice(0, 10).map((c) => (
                    <Chip key={c.city || "-"} href={cityHref(c.city)} active={f.city === c.city}>
                      {c.city || "No city listed"}
                      <span className="opacity-70">{c.roles}</span>
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            {shown === 0 || data.selected.length === 0 ? (
              <EmptyState title={`No matching roles in ${placeName(sel.code)}`} body="Nothing here matches these filters. Pick another state, or remove a filter." />
            ) : (
              <>
                {jobList(data.selected)}
                <LoadMore shown={data.selected.length} total={data.picked.length} href={moreHref} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const VIEW_TITLE: Record<View, string> = {
  foryou: "For you",
  all: "All open jobs",
  saved: "Saved",
  applied: "Applied",
  hidden: "Hidden jobs",
};

export default async function JobsPage(props: PageProps<"/jobs">) {
  const sp = await props.searchParams;
  // Bare /jobs (nav tab, home-screen app, after sign-in): restore the filters you last used here.
  const filterKeys = Object.keys(sp).filter((k) => k !== "saved");
  if (filterKeys.length === 0) {
    const last = (await cookies()).get(JOBS_QUERY_COOKIE)?.value;
    if (validJobsQuery(last)) redirect(`/jobs?${last}${sp.saved === "profile" ? "&saved=profile" : ""}`);
  }
  const f = parseFilters(sp);

  const { supabase, user } = await requireUser();
  const [profile, actions, newSince, companyPrefs] = await Promise.all([
    getProfile(supabase, user.id),
    getJobActions(supabase),
    noteVisit(supabase),
    getCompanyPrefs(supabase),
  ]);
  const viewer = { profile, actions, newSince, companyPrefs };
  const [jobs, lastRun, companyCount, companies] = await Promise.all([
    f.map ? getMapJobs(supabase, f, viewer, f.show ?? PAGE_SIZE) : getJobs(supabase, f, viewer, f.show ?? PAGE_SIZE),
    getLastRun(supabase),
    getCompanyCount(supabase),
    getCompanyCounts(supabase, f, viewer),
  ]);
  const mapData = "counts" in jobs ? jobs : null;
  // The cards shown: the list, or on the map the roles in the picked state.
  const listData = mapData ? null : (jobs as Awaited<ReturnType<typeof getJobs>>);
  const groups = mapData ? mapData.selected : listData!.groups;
  // Every matching role (the cards are the first `show` of these).
  const matching = mapData ? mapData.picked : listData!.all;
  const hiddenCount = jobs.hiddenCount;
  const listHref = href(f, {});
  const baseQuery = href(f, { company: undefined }).replace(/^\/jobs\??/, "");
  const newCount = (mapData ? mapData.all : listData!.all).filter((g) => g.isNew).length;
  const marks = isMarkView(f.view);
  const counts = { saved: 0, applied: 0 };
  for (const st of actions.values()) if (st === "saved" || st === "applied") counts[st]++;
  const starredCount = [...companyPrefs.values()].filter((p) => p === "star").length;
  const hiddenCompanies = [...companyPrefs.values()].filter((p) => p === "hide").length;
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? groups.find((g) => g.lead.company_id === id)?.lead.company?.name ?? id;
  const pref = (id: string): CompanyPref | null => companyPrefs.get(id) ?? null;

  // Filters that live behind the "Filters" button (the quick toggles are visible anyway).
  const panelActive = [f.family, f.kind, f.since === "week", f.company, f.exp !== undefined, f.degree, f.pay, f.noContract, f.fit === "ok"].filter(Boolean).length;

  // Active filters as removable pills.
  const active: { label: string; href: string }[] = [];
  if (f.since === "visit") active.push({ label: "New since your last visit", href: href(f, { since: undefined }) });
  if (f.since === "week") active.push({ label: "Found in the last 7 days", href: href(f, { since: undefined }) });
  if (f.fit) active.push({ label: f.fit === "likely" ? "Likely qualify" : "Likely or stretch", href: href(f, { fit: undefined }) });
  if (f.starred) active.push({ label: "★ Starred companies", href: href(f, { starred: false }) });
  if (f.kind) active.push({ label: f.kind === "intern" ? "Internships & co-ops" : "Full-time roles", href: href(f, { kind: undefined }) });
  for (const fam of f.family ?? []) active.push({ label: FAMILY_LABEL[fam] ?? fam, href: href(f, { family: toggleFamily(f.family, fam) }) });
  if (f.company) active.push({ label: companyName(f.company), href: href(f, { company: undefined }) });
  if (f.exp !== undefined) active.push({ label: f.exp === 0 ? "No experience needed" : `Up to ${f.exp} yr${f.exp > 1 ? "s" : ""}`, href: href(f, { exp: undefined }) });
  if (f.degree) active.push({ label: f.degree === "bs" ? "Bachelor's is enough" : "Master's is enough", href: href(f, { degree: undefined }) });
  if (f.pay) active.push({ label: "Pay listed", href: href(f, { pay: false }) });
  if (f.noContract) active.push({ label: "No contract roles", href: href(f, { noContract: false }) });
  if (f.state && !f.map) active.push({ label: `📍 ${placeName(f.state)}`, href: href(f, { state: undefined, city: undefined }) });
  if (f.state && f.city !== undefined && !f.map) active.push({ label: f.city || "No city listed", href: href(f, { city: undefined }) });
  const cleared = href({ view: f.view, sort: f.sort, map: f.map }, {});

  const jobList = (groups: JobGroup[]) => (
    <section aria-label="Jobs" className="@container border border-line bg-surface">
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
              <JobCard g={g} listHref={listHref} profile={profile} hiddenView={f.view === "hidden"} starred={pref(g.lead.company_id) === "star"} />
            </Fragment>
          );
        })}
      </ul>
    </section>
  );

  const sinceText = new Date(newSince).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <div className="flex flex-col gap-6">
      <RememberFilters query={href(f, { show: undefined }).replace(/^\/jobs\??/, "")} />
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
      />

      {!marks && (
        <p className="-mt-2 font-mono text-xs leading-5 text-subtle">
          <span className="font-semibold text-heading">{newCount}</span> new since your last visit ({sinceText} ET) · {companyCount} companies · checked{" "}
          {lastRun ? timeAgo(lastRun.finished_at) : "never"}
          {lastRun?.companies_failed ? <span className="text-danger"> · {lastRun.companies_failed} failed</span> : null}
          {f.view === "foryou" && (
            <>
              {" · "}
              <Link href="/settings" className="text-link hover:underline">
                Edit your profile
              </Link>
            </>
          )}
        </p>
      )}

      {!profile.after_grad && (
        <p className="border border-brand-soft bg-brand-softer px-4 py-3 font-mono text-xs leading-5 text-body">
          New: tell Primer what you&apos;re doing after you graduate, so internships that start after then (or are for another
          class year) are handled right.{" "}
          <Link href="/settings" className="font-medium text-link hover:underline">
            Answer in Settings →
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-4 border-y border-line py-4">
        {/* Which list */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Lists" className="grid grid-cols-5 gap-1 sm:flex">
          <Tab href={href({ view: "foryou", sort: f.sort, map: f.map }, {})} active={f.view === "foryou"}>
            For you
          </Tab>
          <Tab href={href({ view: "all", sort: f.sort, map: f.map }, {})} active={f.view === "all"}>
            All<span className="hidden sm:inline"> jobs</span>
          </Tab>
          <Tab href={href({ view: "saved", map: f.map }, {})} active={f.view === "saved"}>
            Saved{counts.saved ? <span className="opacity-70">{counts.saved}</span> : null}
          </Tab>
          <Tab href={href({ view: "applied", map: f.map }, {})} active={f.view === "applied"}>
            Applied{counts.applied ? <span className="opacity-70">{counts.applied}</span> : null}
          </Tab>
          <Tab href={href({ view: "hidden", map: f.map }, {})} active={f.view === "hidden"}>
            Hidden{hiddenCount ? <span className="opacity-70">{hiddenCount}</span> : null}
          </Tab>
        </nav>
        <div className={marks ? "" : "hidden sm:block"}>
          <ModeSwitch listHref={href(f, { map: false })} mapHref={href(f, { map: true })} map={Boolean(f.map)} />
        </div>
        </div>

        {!marks ? (
          <FiltersShell
            activeCount={panelActive}
            mode={<ModeSwitch listHref={href(f, { map: false })} mapHref={href(f, { map: true })} map={Boolean(f.map)} compact />}
            resultLabel={`Show ${matching.length} role${matching.length === 1 ? "" : "s"}`}
            quick={
              <>
                <Chip href={href(f, { since: f.since === "visit" ? undefined : "visit" })} active={f.since === "visit"}>
                  New since last visit
                  {f.since !== "visit" && newCount > 0 && <span className="bg-lime px-1 text-[11px] font-medium text-on-lime">{newCount}</span>}
                </Chip>
                <Chip href={href(f, { fit: f.fit === "likely" ? undefined : "likely" })} active={f.fit === "likely"}>
                  ✓ Likely qualify
                </Chip>
                {starredCount > 0 ? (
                  <Chip href={href(f, { starred: !f.starred })} active={Boolean(f.starred)}>
                    ★ Starred companies
                  </Chip>
                ) : (
                  <Link href="/settings#companies" className="inline-flex h-9 shrink-0 items-center px-2 font-mono text-xs text-subtle hover:text-link">
                    ☆ Star companies…
                  </Link>
                )}
              </>
            }
            sort={
              <SortSelect
                options={[
                  { label: "Newest posted", href: href(f, { sort: undefined }), active: !f.sort },
                  { label: "Deadline soonest", href: href(f, { sort: "deadline" }), active: f.sort === "deadline" },
                  { label: "Highest pay", href: href(f, { sort: "pay" }), active: f.sort === "pay" },
                  { label: "Company A–Z", href: href(f, { sort: "company" }), active: f.sort === "company" },
                ]}
              />
            }
            panel={
              <>
                <PanelRow label="Kind">
                  <Chip href={href(f, { kind: undefined })} active={!f.kind}>
                    Any
                  </Chip>
                  <Chip href={href(f, { kind: "intern" })} active={f.kind === "intern"}>
                    Internships &amp; co-ops
                  </Chip>
                  <Chip href={href(f, { kind: "fulltime" })} active={f.kind === "fulltime"}>
                    Full-time roles
                  </Chip>
                </PanelRow>
                <PanelRow label="Types">
                  <Chip href={href(f, { family: undefined })} active={!f.family}>
                    All
                  </Chip>
                  {FAMILIES.filter(
                    ([fam]) =>
                      f.family?.includes(fam) ||
                      (f.view === "foryou" ? profile.families.includes(fam) : trackFamilies(profile.families).includes(fam)),
                  ).map(([fam, label]) => (
                    <Chip key={fam} href={href(f, { family: toggleFamily(f.family, fam) })} active={Boolean(f.family?.includes(fam))}>
                      {f.family?.includes(fam) ? "✓ " : ""}
                      {label}
                    </Chip>
                  ))}
                </PanelRow>
                <PanelRow label="Fit">
                  <Chip href={href(f, { fit: undefined })} active={!f.fit}>
                    Any
                  </Chip>
                  <Chip href={href(f, { fit: "ok" })} active={f.fit === "ok"}>
                    Likely or stretch
                  </Chip>
                  <Chip href={href(f, { fit: "likely" })} active={f.fit === "likely"}>
                    Likely only
                  </Chip>
                </PanelRow>
                <PanelRow label="Found">
                  <Chip href={href(f, { since: undefined })} active={!f.since}>
                    Any time
                  </Chip>
                  <Chip href={href(f, { since: "visit" })} active={f.since === "visit"}>
                    Since last visit
                  </Chip>
                  <Chip href={href(f, { since: "week" })} active={f.since === "week"}>
                    Last 7 days
                  </Chip>
                </PanelRow>
                <PanelRow label="Company">
                  <CompanySelect companies={companies} value={f.company} baseQuery={baseQuery} />
                  {f.company && <CompanyPrefButtons key={f.company} companyId={f.company} name={companyName(f.company)} initial={pref(f.company)} compact />}
                  <Link href="/settings#companies" className="inline-flex h-9 shrink-0 items-center px-1 font-mono text-xs text-link hover:underline">
                    Manage{hiddenCompanies ? ` (${hiddenCompanies} hidden)` : ""}
                  </Link>
                </PanelRow>
                <PanelRow label="Experience">
                  <Chip href={href(f, { exp: undefined })} active={f.exp === undefined}>
                    Any
                  </Chip>
                  {[0, 1, 2, 3].map((n) => (
                    <Chip key={n} href={href(f, { exp: n })} active={f.exp === n}>
                      {n === 0 ? "None needed" : `Up to ${n} yr${n > 1 ? "s" : ""}`}
                    </Chip>
                  ))}
                </PanelRow>
                <PanelRow label="Degree">
                  <Chip href={href(f, { degree: undefined })} active={!f.degree}>
                    Any
                  </Chip>
                  <Chip href={href(f, { degree: "bs" })} active={f.degree === "bs"}>
                    Bachelor&apos;s is enough
                  </Chip>
                  <Chip href={href(f, { degree: "ms" })} active={f.degree === "ms"}>
                    Master&apos;s is enough
                  </Chip>
                </PanelRow>
                <PanelRow label="Other">
                  <Chip href={href(f, { pay: !f.pay })} active={Boolean(f.pay)}>
                    {f.pay ? "✓ " : ""}Pay listed
                  </Chip>
                  <Chip href={href(f, { noContract: !f.noContract })} active={Boolean(f.noContract)}>
                    {f.noContract ? "✓ " : ""}Hide contract
                  </Chip>
                </PanelRow>
              </>
            }
            chips={
              active.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {active.map((a) => (
                    <ActiveChip key={a.label} href={a.href}>
                      {a.label}
                    </ActiveChip>
                  ))}
                  {active.length > 1 && (
                    <Link href={cleared} scroll={false} className="px-1 font-mono text-xs text-link hover:underline">
                      Clear all
                    </Link>
                  )}
                </div>
              )
            }
          />
        ) : null}
      </div>

      {f.map && mapData ? (
        <MapView f={f} data={mapData} lastRun={Boolean(lastRun)} baseHref={href(f, { state: undefined, city: undefined })} cityHref={(c) => href(f, { city: c })} jobList={jobList} moreHref={href(f, { show: (f.show ?? PAGE_SIZE) + PAGE_SIZE })} />
      ) : (
      groups.length === 0 ? (
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
                    : active.length
                      ? "No jobs match these filters. Try removing one."
                      : f.view === "foryou"
                        ? "Nothing open matches your profile right now. Try All jobs, or widen your profile in Settings."
                        : "No open jobs right now."
          }
          action={
            active.length && !marks ? (
              <Link href={cleared} className="font-mono text-sm text-link hover:underline">
                Clear filters →
              </Link>
            ) : f.view === "foryou" && lastRun ? (
              <Link href={href({ view: "all" }, {})} className="font-mono text-sm text-link hover:underline">
                See all jobs →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {jobList(groups)}
          <LoadMore shown={groups.length} total={matching.length} href={href(f, { show: (f.show ?? PAGE_SIZE) + PAGE_SIZE })} />
        </>
      )
      )}

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, dates, deadlines, experience and requirements are read from each posting automatically, so double-check them on
        the company&apos;s page. &ldquo;Likely qualify&rdquo; only means nothing we could read rules you out. Apply checks with
        the company first, so you won&apos;t land on a dead posting.
      </p>
    </div>
  );
}
