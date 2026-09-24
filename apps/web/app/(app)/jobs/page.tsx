import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
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
  isMarkView,
  postedLabel,
  salaryLabel,
  timeAgo,
  timingLabel,
  type JobFilters,
  type JobGroup,
  type SortKey,
  type View,
} from "@/lib/jobs";
import { getCompanyPrefs, getJobActions, getProfile, noteVisit, type CompanyPref } from "@/lib/me";
import { qualify, type Profile } from "@/lib/profile";
import { CompanySelect } from "./company-select";
import { FiltersShell, SortSelect } from "./filters-shell";
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
    starred: one("starred") === "1",
    fit: one("fit") === "likely" || one("fit") === "ok" ? (one("fit") as "likely" | "ok") : undefined,
    kind: one("kind") === "intern" || one("kind") === "fulltime" ? (one("kind") as "intern" | "fulltime") : undefined,
    sort: (["company", "pay", "deadline"] as const).find((k) => k === one("sort")) as SortKey | undefined,
  };
}

/** Link to the same page with some filters changed (undefined/false removes one). */
function href(f: JobFilters, change: Partial<JobFilters>) {
  const n = { ...f, ...change };
  const p = new URLSearchParams();
  if (n.view !== "foryou") p.set("view", n.view);
  if (n.since) p.set("since", n.since);
  if (n.fit) p.set("fit", n.fit);
  if (n.starred) p.set("starred", "1");
  if (n.kind) p.set("kind", n.kind);
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
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 px-3 font-mono text-sm whitespace-nowrap transition-colors duration-100 ${
        active ? "bg-heading font-medium text-bg" : "text-subtle hover:bg-muted hover:text-heading"
      }`}
    >
      {children}
    </Link>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{label}</span>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">{children}</div>
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
  const posted = postedLabel(j);
  const exp = experienceLabel(j.experience_min_years);
  const type = j.employment_type && j.employment_type !== "full_time" ? EMPLOYMENT_LABEL[j.employment_type] : null;
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
      footer={!g.closed && <JobDetails id={j.id} requirements={j.requirements ?? []} pageHref={page} applyUrl={j.url} />}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle">
        {g.isNew && <Badge tone="new">NEW</Badge>}
        <span className="font-medium text-body">
          {starred && (
            <span className="text-link" title="A company you starred">
              ★{" "}
            </span>
          )}
          {j.company?.name ?? j.company_id}
        </span>
        <span aria-hidden>·</span>
        <span title={`Primer found it ${timeAgo(j.first_seen_at)}`}>{posted ?? `found ${timeAgo(j.first_seen_at)}`}</span>
      </div>
      <Link href={page} className="mt-1 block font-mono text-[15px] leading-6 font-semibold text-heading hover:text-link">
        {j.title}
        {g.listings.length > 1 && <span className="ml-2 font-normal text-subtle">({g.listings.length} listings)</span>}
      </Link>
      <p className="mt-0.5 truncate font-mono text-xs text-subtle">{locText}</p>

      {/* The facts people decide on first */}
      {(pay || timing || deadline || q) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
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
  const f = parseFilters(sp);

  const { supabase, user } = await requireUser();
  const [profile, actions, newSince, companyPrefs] = await Promise.all([
    getProfile(supabase, user.id),
    getJobActions(supabase),
    noteVisit(supabase),
    getCompanyPrefs(supabase),
  ]);
  const viewer = { profile, actions, newSince, companyPrefs };
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
  if (f.family) active.push({ label: FAMILY_LABEL[f.family] ?? f.family, href: href(f, { family: undefined }) });
  if (f.company) active.push({ label: companyName(f.company), href: href(f, { company: undefined }) });
  if (f.exp !== undefined) active.push({ label: f.exp === 0 ? "No experience needed" : `Up to ${f.exp} yr${f.exp > 1 ? "s" : ""}`, href: href(f, { exp: undefined }) });
  if (f.degree) active.push({ label: f.degree === "bs" ? "Bachelor's is enough" : "Master's is enough", href: href(f, { degree: undefined }) });
  if (f.pay) active.push({ label: "Pay listed", href: href(f, { pay: false }) });
  if (f.noContract) active.push({ label: "No contract roles", href: href(f, { noContract: false }) });
  const cleared = href({ view: f.view, sort: f.sort }, {});

  const sinceText = new Date(newSince).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <div className="flex flex-col gap-6">
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

      <div className="flex flex-col gap-4 border-y border-line py-4">
        {/* Which list */}
        <nav aria-label="Lists" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tab href={href({ view: "foryou", sort: f.sort }, {})} active={f.view === "foryou"}>
            For you
          </Tab>
          <Tab href={href({ view: "all", sort: f.sort }, {})} active={f.view === "all"}>
            All jobs
          </Tab>
          <Tab href={href({ view: "saved" }, {})} active={f.view === "saved"}>
            Saved{counts.saved ? <span className="opacity-70">{counts.saved}</span> : null}
          </Tab>
          <Tab href={href({ view: "applied" }, {})} active={f.view === "applied"}>
            Applied{counts.applied ? <span className="opacity-70">{counts.applied}</span> : null}
          </Tab>
          {(hiddenCount > 0 || f.view === "hidden") && (
            <Tab href={href({ view: "hidden" }, {})} active={f.view === "hidden"}>
              Hidden<span className="opacity-70">{hiddenCount}</span>
            </Tab>
          )}
        </nav>

        {!marks ? (
          <FiltersShell
            activeCount={panelActive}
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
                  { label: "Newest", href: href(f, { sort: undefined }), active: !f.sort },
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
                <PanelRow label="Type">
                  <Chip href={href(f, { family: undefined })} active={!f.family}>
                    All
                  </Chip>
                  {FAMILIES.filter(([fam]) => f.view !== "foryou" || profile.families.includes(fam) || f.family === fam).map(([fam, label]) => (
                    <Chip key={fam} href={href(f, { family: fam })} active={f.family === fam}>
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
                  <JobCard g={g} listHref={listHref} profile={profile} hiddenView={f.view === "hidden"} starred={pref(g.lead.company_id) === "star"} />
                </Fragment>
              );
            })}
          </ul>
        </section>
      )}

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, dates, deadlines, experience and requirements are read from each posting automatically, so double-check them on
        the company&apos;s page. &ldquo;Likely qualify&rdquo; only means nothing we could read rules you out. Apply checks with
        the company first, so you won&apos;t land on a dead posting.
      </p>
    </div>
  );
}
