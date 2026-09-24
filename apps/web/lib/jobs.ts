import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  company: { name: string; segment: string } | null;
}

export interface JobFilters {
  view: View;
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
  sort?: SortKey;
}

export type SortKey = "new" | "company" | "pay";

const COLUMNS =
  "id, company_id, title, url, locations, remote, role_family, seniority, degree_min, metro_tier, is_backlog, first_seen_at, last_seen_at, posted_at, posted_text, dedupe_key, salary_min, salary_max, salary_period, employment_type, experience_min_years, requirements, company:companies(name, segment)";

/** One role, possibly posted as several listings (one per city). */
export interface JobGroup {
  key: string;
  lead: JobRow;
  listings: JobRow[];
  locations: string[];
  isNew: boolean;
}

export type View = "new" | "all";

/** Mirrors DEFAULT_FILTER in packages/shared/src/filter.ts (until each person sets their own in Phase 2). */
const LEVELS = ["intern", "entry", "unspecified"];
const NEW_WINDOW_DAYS = 14;
export const NEW_BADGE_HOURS = 48;

/** Filters shared by the job list and the company dropdown (everything except the company itself). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { is: any; eq: any; in: any; neq: any; gte: any; or: any; not: any }>(q: Q, opts: JobFilters): Q {
  q = q.is("closed_at", null).eq("is_us", true).in("seniority", LEVELS).neq("role_family", "other");
  if (opts.view === "new") {
    q = q.eq("is_backlog", false).gte("first_seen_at", new Date(Date.now() - NEW_WINDOW_DAYS * 86_400_000).toISOString());
  }
  if (opts.family) q = q.eq("role_family", opts.family);
  if (opts.exp !== undefined) q = q.or(`experience_min_years.is.null,experience_min_years.lte.${opts.exp}`);
  if (opts.degree === "bs") q = q.or("degree_min.is.null,degree_min.eq.bs");
  if (opts.degree === "ms") q = q.or("degree_min.is.null,degree_min.in.(bs,ms)");
  if (opts.pay) q = q.not("salary_min", "is", null);
  if (opts.noContract) q = q.or("employment_type.is.null,employment_type.not.in.(contract,temporary)");
  return q;
}

/** Yearly pay for sorting (hourly x 2,080 working hours). */
function annualMax(j: JobRow): number {
  if (j.salary_max === null || !j.salary_period) return -1;
  return Number(j.salary_max) * (j.salary_period === "hour" ? 2080 : 1);
}

export async function getJobs(supabase: SupabaseClient, opts: JobFilters): Promise<{ groups: JobGroup[]; total: number }> {
  let q = applyFilters(supabase.from("jobs").select(COLUMNS), opts)
    .order("first_seen_at", { ascending: false })
    .limit(800);
  if (opts.company) q = q.eq("company_id", opts.company);

  const { data, error } = await q;
  if (error) throw new Error(`Couldn't load jobs: ${error.message}`);
  const rows = (data ?? []) as unknown as JobRow[];

  const groups = new Map<string, JobGroup>();
  const badgeCutoff = Date.now() - NEW_BADGE_HOURS * 3_600_000;
  for (const r of rows) {
    const g = groups.get(r.dedupe_key);
    const locs = r.locations.length ? r.locations : r.remote ? ["Remote"] : [];
    if (g) {
      g.listings.push(r);
      for (const l of locs) if (!g.locations.includes(l)) g.locations.push(l);
      if ((r.metro_tier ?? 9) < (g.lead.metro_tier ?? 9)) g.lead = r;
    } else {
      groups.set(r.dedupe_key, {
        key: r.dedupe_key,
        lead: r,
        listings: [r],
        locations: [...locs],
        isNew: !r.is_backlog && new Date(r.first_seen_at).getTime() >= badgeCutoff,
      });
    }
  }
  // Newest first; within the same hour, Boston/NYC before the rest.
  const newest = (a: JobGroup, b: JobGroup) => {
    const ha = Math.floor(new Date(a.lead.first_seen_at).getTime() / 3_600_000);
    const hb = Math.floor(new Date(b.lead.first_seen_at).getTime() / 3_600_000);
    if (ha !== hb) return hb - ha;
    return (a.lead.metro_tier ?? 9) - (b.lead.metro_tier ?? 9);
  };
  const name = (g: JobGroup) => (g.lead.company?.name ?? g.lead.company_id).toLowerCase();
  const sorted = [...groups.values()].sort((a, b) => {
    if (opts.sort === "company") return name(a).localeCompare(name(b)) || newest(a, b);
    if (opts.sort === "pay") return annualMax(b.lead) - annualMax(a.lead) || newest(a, b);
    return newest(a, b);
  });
  return { groups: sorted, total: rows.length };
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
export async function getCompanyCounts(supabase: SupabaseClient, opts: JobFilters): Promise<{ id: string; name: string; count: number }[]> {
  const { data } = await applyFilters(supabase.from("jobs").select("company_id, dedupe_key, company:companies(name)"), opts).limit(5000);
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
