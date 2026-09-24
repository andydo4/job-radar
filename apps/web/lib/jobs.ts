import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyPref, JobStatus } from "./me";
import { allowedDegrees, maxExperience, qualify, type Profile } from "./profile";

export const FAMILIES = [
  ["research", "Research"],
  ["process", "Process & mfg"],
  ["quality", "Quality"],
  ["clinical", "Clinical"],
  ["regulatory", "Regulatory"],
  ["compbio", "Comp bio"],
  ["engineering", "Engineering"],
  ["commercial", "Commercial"],
  ["consulting", "Consulting"],
  ["vc", "Venture"],
] as const;
export type Family = (typeof FAMILIES)[number][0];
export const FAMILY_LABEL = Object.fromEntries(FAMILIES) as Record<string, string>;

export const TIER_LABEL: Record<number, string> = { 1: "Boston / NYC", 2: "Coasts / remote", 3: "Other US" };

export interface JobRow {
  id: number;
  company_id: string;
  title: string;
  url: string;
  locations: string[];
  remote: boolean;
  role_family: string;
  seniority: string;
  degree_min: string | null;
  metro_tier: number | null;
  is_backlog: boolean;
  first_seen_at: string;
  last_seen_at: string;
  posted_at: string | null;
  posted_text: string | null;
  dedupe_key: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "year" | "hour" | null;
  employment_type: string | null;
  experience_min_years: number | null;
  requirements: string[] | null;
  term: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_label: string | null;
  duration_text: string | null;
  deadline: string | null;
  company: { name: string; segment: string } | null;
}

export interface JobFilters {
  view: View;
  /** Only jobs first seen since your last visit, or in the last 7 days. */
  since?: "visit" | "week";
  family?: string;
  /** Max years of experience a posting may ask for (jobs that don't say are kept). */
  exp?: number;
  /** Highest degree you have: hides jobs that need more ("bs" hides MS/PhD-only). */
  degree?: "bs" | "ms";
  /** Only jobs that list pay. */
  pay?: boolean;
  /** Hide contract / temporary roles. */
  noContract?: boolean;
  /** Only this company (companies.id). */
  company?: string;
  /** Only your starred companies. */
  starred?: boolean;
  /** "likely" = only Likely qualify; "ok" = Likely or Stretch. */
  fit?: "likely" | "ok";
  /** Internships & co-ops only, or everything else. */
  kind?: "intern" | "fulltime";
  sort?: SortKey;
}

export type SortKey = "new" | "company" | "pay" | "deadline";

const COLUMNS =
  "id, company_id, title, url, locations, remote, role_family, seniority, degree_min, metro_tier, is_backlog, first_seen_at, last_seen_at, posted_at, posted_text, dedupe_key, salary_min, salary_max, salary_period, employment_type, experience_min_years, requirements, term, start_date, end_date, dates_label, duration_text, deadline, company:companies(name, segment)";

/** One role, possibly posted as several listings (one per city). */
export interface JobGroup {
  key: string;
  lead: JobRow;
  listings: JobRow[];
  locations: string[];
  isNew: boolean;
  /** Your mark on any listing of this role (applied beats saved). */
  status: JobStatus | null;
  /** Set for Saved / Applied: the job is no longer on the company's site. */
  closed: boolean;
}

export type View = "foryou" | "all" | "saved" | "applied" | "hidden";
export const MARK_VIEWS = ["saved", "applied", "hidden"] as const;
export const isMarkView = (v: View): v is (typeof MARK_VIEWS)[number] => (MARK_VIEWS as readonly string[]).includes(v);

/** Mirrors DEFAULT_FILTER in packages/shared/src/filter.ts. */
const LEVELS = ["intern", "entry", "unspecified"];

/** What the list needs to know about the person looking at it. */
export interface Viewer {
  profile: Profile;
  actions: Map<number, JobStatus>;
  /** "New" means first seen after this moment (your previous visit). */
  newSince: string;
  /** Your starred / hidden companies. */
  companyPrefs: Map<string, CompanyPref>;
}

const idsWith = (prefs: Map<string, CompanyPref>, want: CompanyPref) => [...prefs].filter(([, p]) => p === want).map(([id]) => id);
/** PostgREST list literal: ("a","b") */
const list = (ids: string[]) => `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;

/** Like PostgREST filters we use; kept loose so it works for any select(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = { is: any; eq: any; in: any; neq: any; gte: any; or: any; not: any };

/**
 * Filters shared by the job list and the company dropdown (everything except the company itself).
 * Every "one of these" condition is collected and sent as a single or=(and(or(..),or(..))) so they combine as AND.
 */
function applyFilters<T extends Q>(q: T, opts: JobFilters, viewer: Viewer): T {
  const anyOf: string[] = [];
  const p = viewer.profile;
  const forYou = opts.view === "foryou";

  q = q.is("closed_at", null).eq("is_us", true).neq("role_family", "other");
  q = q.in("seniority", forYou && !p.include_internships ? LEVELS.filter((l) => l !== "intern") : LEVELS);

  if (forYou) {
    if (p.families.length) q = q.in("role_family", p.families);
    if (p.metro_tiers.length && p.metro_tiers.length < 3) {
      anyOf.push(`metro_tier.in.(${p.metro_tiers.join(",")})${p.metro_tiers.includes(3) ? ",metro_tier.is.null" : ""}`);
    }
    if (p.degree) anyOf.push(`degree_min.is.null,degree_min.in.(${allowedDegrees(p.degree).join(",")})`);
    const maxExp = maxExperience(p.years_experience, p.degree);
    if (maxExp !== null) anyOf.push(`experience_min_years.is.null,experience_min_years.lte.${maxExp}`);
    if (p.hide_contract) anyOf.push("employment_type.is.null,employment_type.not.in.(contract,temporary)");
  }

  // Companies you hid never show, unless you pick one on purpose in the Company dropdown.
  const hidden = idsWith(viewer.companyPrefs, "hide");
  if (hidden.length && !opts.company) q = q.not("company_id", "in", list(hidden));
  if (opts.starred) {
    const starred = idsWith(viewer.companyPrefs, "star");
    q = q.in("company_id", starred.length ? starred : ["-none-"]);
  }
  if (opts.kind === "intern") anyOf.push("seniority.eq.intern,employment_type.eq.intern");
  if (opts.kind === "fulltime") {
    q = q.neq("seniority", "intern");
    anyOf.push("employment_type.is.null,employment_type.neq.intern");
  }

  if (opts.since === "visit") q = q.eq("is_backlog", false).gte("first_seen_at", viewer.newSince);
  if (opts.since === "week") q = q.eq("is_backlog", false).gte("first_seen_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  if (opts.family) q = q.eq("role_family", opts.family);
  if (opts.exp !== undefined) anyOf.push(`experience_min_years.is.null,experience_min_years.lte.${opts.exp}`);
  if (opts.degree === "bs") anyOf.push("degree_min.is.null,degree_min.eq.bs");
  if (opts.degree === "ms") anyOf.push("degree_min.is.null,degree_min.in.(bs,ms)");
  if (opts.pay) q = q.not("salary_min", "is", null);
  if (opts.noContract) anyOf.push("employment_type.is.null,employment_type.not.in.(contract,temporary)");

  if (anyOf.length === 1) q = q.or(anyOf[0]);
  else if (anyOf.length > 1) q = q.or(`and(${anyOf.map((c) => `or(${c})`).join(",")})`);
  return q;
}

/** Yearly pay for sorting (hourly x 2,080 working hours). */
function annualMax(j: JobRow): number {
  if (j.salary_max === null || !j.salary_period) return -1;
  return Number(j.salary_max) * (j.salary_period === "hour" ? 2080 : 1);
}

export async function getJobs(
  supabase: SupabaseClient,
  opts: JobFilters,
  viewer: Viewer,
): Promise<{ groups: JobGroup[]; total: number; hiddenCount: number }> {
  let rows: (JobRow & { closed_at: string | null })[];
  if (isMarkView(opts.view)) {
    // Your saved / applied / hidden jobs, including ones that have since closed.
    const ids = [...viewer.actions].filter(([, st]) => st === opts.view).map(([id]) => id);
    if (!ids.length) return { groups: [], total: 0, hiddenCount: countHidden(viewer) };
    let q = supabase.from("jobs").select(`${COLUMNS}, closed_at`).in("id", ids.slice(0, 1000)).order("first_seen_at", { ascending: false });
    if (opts.family) q = q.eq("role_family", opts.family);
    if (opts.company) q = q.eq("company_id", opts.company);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't load jobs: ${error.message}`);
    rows = (data ?? []) as unknown as typeof rows;
  } else {
    let q = applyFilters(supabase.from("jobs").select(COLUMNS), opts, viewer)
      .order("first_seen_at", { ascending: false })
      .limit(800);
    if (opts.company) q = q.eq("company_id", opts.company);
    const { data, error } = await q;
    if (error) throw new Error(`Couldn't load jobs: ${error.message}`);
    rows = ((data ?? []) as unknown as JobRow[]).map((r) => ({ ...r, closed_at: null }));
  }

  const groups = new Map<string, JobGroup>();
  const newCutoff = new Date(viewer.newSince).getTime();
  const rank = (st: JobStatus | null | undefined) => (st === "hidden" ? 3 : st === "applied" ? 2 : st === "saved" ? 1 : 0);
  for (const r of rows) {
    const st = viewer.actions.get(r.id) ?? null;
    const g = groups.get(r.dedupe_key);
    const locs = r.locations.length ? r.locations : r.remote ? ["Remote"] : [];
    if (g) {
      g.listings.push(r);
      for (const l of locs) if (!g.locations.includes(l)) g.locations.push(l);
      // Lead listing: Boston/NYC first; at the same tier, the one we know more about.
      const richness = (x: JobRow) => (x.deadline ? 2 : 0) + (x.dates_label || x.term ? 2 : 0) + (x.salary_min !== null ? 1 : 0) + (x.requirements?.length ? 1 : 0);
      const tierDiff = (r.metro_tier ?? 9) - (g.lead.metro_tier ?? 9);
      if (tierDiff < 0 || (tierDiff === 0 && richness(r) > richness(g.lead))) g.lead = r;
      if (rank(st) > rank(g.status)) g.status = st;
      g.closed = g.closed && Boolean(r.closed_at);
    } else {
      groups.set(r.dedupe_key, {
        key: r.dedupe_key,
        lead: r,
        listings: [r],
        locations: [...locs],
        isNew: !r.is_backlog && new Date(r.first_seen_at).getTime() >= newCutoff,
        status: st,
        closed: Boolean(r.closed_at),
      });
    }
  }
  // A role you hid stays hidden everywhere except the Hidden list, even if it has other listings.
  let groups_ = [...groups.values()];
  if (!isMarkView(opts.view)) groups_ = groups_.filter((g) => g.status !== "hidden");
  else if (opts.view !== "hidden") groups_ = groups_.filter((g) => g.status === opts.view);
  if (opts.fit) {
    const ok = opts.fit === "likely" ? ["likely"] : ["likely", "stretch"];
    groups_ = groups_.filter((g) => {
      const q = qualify(viewer.profile, g.lead);
      return q === null || ok.includes(q.level); // no profile yet: keep everything
    });
  }

  // Newest first; within the same hour, Boston/NYC before the rest.
  const newest = (a: JobGroup, b: JobGroup) => {
    const ha = Math.floor(new Date(a.lead.first_seen_at).getTime() / 3_600_000);
    const hb = Math.floor(new Date(b.lead.first_seen_at).getTime() / 3_600_000);
    if (ha !== hb) return hb - ha;
    return (a.lead.metro_tier ?? 9) - (b.lead.metro_tier ?? 9);
  };
  const name = (g: JobGroup) => (g.lead.company?.name ?? g.lead.company_id).toLowerCase();
  const now = today();
  const deadlineKey = (g: JobGroup) =>
    g.listings
      .map((l) => l.deadline)
      .filter((d): d is string => Boolean(d) && d! >= now)
      .sort()[0] ?? "9999";
  groups_.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1; // closed ones last in Saved / Applied
    if (opts.sort === "company") return name(a).localeCompare(name(b)) || newest(a, b);
    if (opts.sort === "pay") return annualMax(b.lead) - annualMax(a.lead) || newest(a, b);
    if (opts.sort === "deadline") return deadlineKey(a).localeCompare(deadlineKey(b)) || newest(a, b);
    return newest(a, b);
  });
  return { groups: groups_, total: rows.length, hiddenCount: countHidden(viewer) };
}

/** Today's date in US Eastern time, "YYYY-MM-DD". */
export function today(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** "Apply by Oct 15 · 22 days left" with an urgency level, or null. */
export function deadlineInfo(deadline: string | null, now = Date.now()): { label: string; tone: "danger" | "warning" | "neutral"; past: boolean } | null {
  if (!deadline) return null;
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today(now)}T00:00:00Z`)) / 86_400_000);
  const date = new Date(`${deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (days < 0) return { label: `Deadline passed (${date})`, tone: "neutral", past: true };
  const left = days === 0 ? "today" : days === 1 ? "tomorrow" : `${days} days left`;
  return { label: `Apply by ${date} · ${left}`, tone: days <= 7 ? "danger" : days <= 21 ? "warning" : "neutral", past: false };
}

/** "posted 3 days ago" from the ATS date, or Workday's own text ("Posted 30+ Days Ago"). */
export function postedLabel(j: Pick<JobRow, "posted_at" | "posted_text">, now = Date.now()): string | null {
  if (j.posted_at) return `posted ${timeAgo(j.posted_at, now)}`;
  if (j.posted_text) return j.posted_text.replace(/^Posted/i, "posted").replace(/ Days? Ago/i, (m) => m.toLowerCase());
  return null;
}

/** "Summer 2027 · May 26 – Aug 15, 2027 · 12 weeks", or "Starts Jun 2027". */
export function timingLabel(j: Pick<JobRow, "term" | "dates_label" | "end_date" | "duration_text">): string | null {
  const parts: string[] = [];
  if (j.term) parts.push(j.term);
  if (j.dates_label) parts.push(j.end_date ? j.dates_label : `Starts ${j.dates_label}`);
  if (j.duration_text) parts.push(j.duration_text);
  return parts.length ? parts.join(" · ") : null;
}

function countHidden(viewer: Viewer): number {
  let n = 0;
  for (const st of viewer.actions.values()) if (st === "hidden") n++;
  return n;
}

export async function getLastRun(supabase: SupabaseClient): Promise<{ finished_at: string; companies_failed: number } | null> {
  const { data } = await supabase
    .from("poll_runs")
    .select("finished_at, companies_failed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { finished_at: string; companies_failed: number } | null) ?? null;
}

export async function getCompanyCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase.from("companies").select("id", { count: "exact", head: true }).eq("active", true);
  return count ?? 0;
}

/** "just now", "6 min ago", "3 hr ago", "2 days ago" */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** The checker runs every 10 minutes; an hour without a finished run means something's wrong. */
export function isStale(finishedAt: string | undefined, now = Date.now()): boolean {
  return !finishedAt || now - new Date(finishedAt).getTime() > 60 * 60_000;
}

export interface JobDetail extends JobRow {
  description_text: string | null;
  country: string | null;
  department: string | null;
  closed_at: string | null;
}

export async function getJob(supabase: SupabaseClient, id: number): Promise<{ job: JobDetail; siblings: JobRow[] } | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select(`${COLUMNS}, description_text, country, department, closed_at`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load job: ${error.message}`);
  if (!data) return null;
  const job = data as unknown as JobDetail;
  const { data: sib } = await supabase
    .from("jobs")
    .select(COLUMNS)
    .eq("company_id", job.company_id)
    .eq("dedupe_key", job.dedupe_key)
    .is("closed_at", null)
    .neq("id", id)
    .limit(30);
  return { job, siblings: (sib ?? []) as unknown as JobRow[] };
}

/** "$85K–$110K / yr" or "$28–$32 / hr" (mirrors formatSalary in packages/shared). */
export function salaryLabel(j: Pick<JobRow, "salary_min" | "salary_max" | "salary_period">): string | null {
  if (j.salary_min === null || j.salary_max === null || !j.salary_period) return null;
  const min = Number(j.salary_min);
  const max = Number(j.salary_max);
  const f = (n: number) => (j.salary_period === "year" ? `$${Math.round(n / 1000)}K` : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);
  return `${min === max ? f(min) : `${f(min)}–${f(max)}`} / ${j.salary_period === "year" ? "yr" : "hr"}`;
}

export function experienceLabel(years: number | null): string | null {
  if (years === null) return null;
  return years === 0 ? "0+ yrs exp" : `${years}+ yrs exp`;
}

export const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Internship",
  temporary: "Temporary",
};

/** Companies with at least one job under the current filters, for the Company dropdown. */
export async function getCompanyCounts(
  supabase: SupabaseClient,
  opts: JobFilters,
  viewer: Viewer,
): Promise<{ id: string; name: string; count: number }[]> {
  if (isMarkView(opts.view)) return [];
  const { data } = await applyFilters(supabase.from("jobs").select("company_id, dedupe_key, company:companies(name)"), { ...opts, company: undefined }, viewer).limit(5000);
  const byId = new Map<string, { id: string; name: string; roles: Set<string> }>();
  for (const r of (data ?? []) as unknown as { company_id: string; dedupe_key: string; company: { name: string } | null }[]) {
    const e = byId.get(r.company_id) ?? { id: r.company_id, name: r.company?.name ?? r.company_id, roles: new Set<string>() };
    e.roles.add(r.dedupe_key);
    byId.set(r.company_id, e);
  }
  return [...byId.values()]
    .map((e) => ({ id: e.id, name: e.name, count: e.roles.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDescription(supabase: SupabaseClient, id: number): Promise<string | null> {
  const { data } = await supabase.from("jobs").select("description_text").eq("id", id).maybeSingle();
  return (data as { description_text: string | null } | null)?.description_text ?? null;
}

/** Every company Primer watches, with how many open roles each has right now. */
export async function getCompanies(supabase: SupabaseClient): Promise<{ id: string; name: string; segment: string; open: number }[]> {
  const [{ data: cos }, { data: jobs }] = await Promise.all([
    supabase.from("companies").select("id, name, segment").eq("active", true).order("name"),
    supabase.from("jobs").select("company_id, dedupe_key").is("closed_at", null).eq("is_us", true).limit(20000),
  ]);
  const roles = new Map<string, Set<string>>();
  for (const j of (jobs ?? []) as { company_id: string; dedupe_key: string }[]) {
    const s = roles.get(j.company_id) ?? new Set<string>();
    s.add(j.dedupe_key);
    roles.set(j.company_id, s);
  }
  return ((cos ?? []) as { id: string; name: string; segment: string }[]).map((c) => ({ ...c, open: roles.get(c.id)?.size ?? 0 }));
}
