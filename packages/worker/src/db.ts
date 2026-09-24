/**
 * Phase 1: the poller's memory lives in Supabase instead of state/state.json.
 *
 * Flow per run:
 *   1. load companies + open jobs from the DB  -> build the same in-memory `State` the file store used
 *   2. run the poll (unchanged, tested logic in store.ts / poll.ts)
 *   3. diff the state before vs after          -> planPersist() (pure, tested)
 *   4. write the diff: upsert companies, insert new jobs, touch/miss/close existing jobs, log the run
 *
 * Only the poller writes these tables, with the Supabase SECRET key (GitHub Actions secret).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  classifyJob,
  enrichJob,
  needsJobPage,
  extractDetails,
  extractTiming,
  extractAudience,
  extractGlance,
  classifySeniority,
  postedAtFromText,
  mapLimit,
  type ClassifiedJob,
  type Company,
  type HttpContext,
  type NormalizedJob,
} from "@job-radar/shared";
import type { CompanyState, State } from "./store.ts";

// ---------------------------------------------------------------------------
// Row shapes (match supabase/migrations/0002_jobs.sql)
// ---------------------------------------------------------------------------

export interface CompanyRow {
  id: string;
  name: string;
  ats: string;
  ats_key: string;
  segment: string;
  active: boolean;
  baselined_at: string | null;
  last_polled_at: string | null;
  last_full_sweep_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  updated_at?: string;
}

export interface OpenJobRow {
  company_id: string;
  external_id: string;
  title: string;
  first_seen_at: string;
  last_seen_at: string;
  misses: number;
}

export interface JobInsertRow {
  company_id: string;
  external_id: string;
  title: string;
  url: string;
  locations: string[];
  remote: boolean;
  country: string | null;
  department: string | null;
  description_text: string | null;
  posted_at: string | null;
  posted_text: string | null;
  role_family: string;
  seniority: string;
  degree_min: string | null;
  is_us: boolean | null;
  metro_tier: number | null;
  states: string[];
  places: string[];
  dedupe_key: string;
  is_backlog: boolean;
  first_seen_at: string;
  last_seen_at: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  experience_min_years: number | null;
  requirements: string[];
  term: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_label: string | null;
  duration_text: string | null;
  deadline: string | null;
  intern_levels: string[];
  grad_from: string | null;
  grad_to: string | null;
  work_model: string | null;
  work_model_detail: string | null;
  visa_sponsorship: string | null;
  travel: string | null;
  clearance_required: boolean | null;
  housing: string | null;
  application_extras: string[];
  details_version: number;
}

/**
 * Bump when details extraction improves: every open job below this version is re-processed
 * by backfillDetails() over the next few runs.
 */
export const DETAILS_VERSION = 7; // 2: term, dates, duration, deadline, Workday posted date. 3: re-check job type. 4: at-a-glance parsing. 5: states/places for the map + non-US "…, DE" fix. 6: "Indianapolis IN" (no comma) locations. 7: software jobs at biotech/pharma -> Software

/** A saved job that still needs its details filled in. */
export interface JobNeedingDetails {
  id: number;
  company_id: string;
  external_id: string;
  title: string;
  url: string;
  locations: string[];
  remote: boolean;
  country: string | null;
  department: string | null;
  description_text: string | null;
  posted_at: string | null;
  posted_text: string | null;
  first_seen_at: string;
}

export interface JobDetailsUpdate {
  id: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  experience_min_years: number | null;
  requirements: string[];
  term: string | null;
  start_date: string | null;
  end_date: string | null;
  dates_label: string | null;
  duration_text: string | null;
  deadline: string | null;
  intern_levels: string[];
  grad_from: string | null;
  grad_to: string | null;
  posted_at: string | null;
  /** Set only when the job's own page was read (careers sites: the real title replaces the guess). */
  title: string | null;
  /** Always re-computed from the (possibly corrected) title. */
  role_family: string | null;
  seniority: string | null;
  dedupe_key: string | null;
  description_text: string | null;
  locations: string[] | null;
  country: string | null;
  is_us: boolean | null;
  metro_tier: number | null;
  states: string[];
  places: string[];
  degree_min: string | null;
  work_model: string | null;
  work_model_detail: string | null;
  visa_sponsorship: string | null;
  travel: string | null;
  clearance_required: boolean | null;
  housing: string | null;
  application_extras: string[];
  details_version: number;
}

export interface RunRow {
  started_at: string;
  finished_at: string;
  companies_ok: number;
  companies_failed: number;
  new_jobs: number;
  new_matches: number;
  closed_jobs: number;
  requests: number;
  github_run_url: string | null;
}

/** Everything the poller needs from the database. A fake implements this in tests. */
export interface JobsDb {
  loadCompanies(): Promise<CompanyRow[]>;
  loadOpenJobs(): Promise<OpenJobRow[]>;
  upsertCompanies(rows: CompanyRow[]): Promise<void>;
  deactivateCompaniesNotIn(ids: string[]): Promise<void>;
  insertJobs(rows: JobInsertRow[]): Promise<void>;
  touchJobs(companyId: string, externalIds: string[], seenAt: string): Promise<void>;
  markMissed(companyId: string, externalIds: string[]): Promise<void>;
  closeJobs(companyId: string, externalIds: string[], closedAt: string): Promise<void>;
  insertRun(row: RunRow): Promise<void>;
  /**
   * Open, showable jobs below `version`. Jobs from `pageCompanyIds` (careers sites, whose first title is
   * only a guess from the link) are included while never read (details_version 0), whatever their guessed type.
   */
  loadJobsNeedingDetails(limit: number, version: number, pageCompanyIds?: string[]): Promise<JobNeedingDetails[]>;
  updateJobDetails(rows: JobDetailsUpdate[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// DB rows <-> in-memory State
// ---------------------------------------------------------------------------

export function stateFromDb(companies: CompanyRow[], openJobs: OpenJobRow[]): State {
  const state: State = { version: 1, companies: {} };
  for (const c of companies) {
    state.companies[c.id] = {
      baselinedAt: c.baselined_at,
      lastPolledAt: c.last_polled_at,
      lastFullSweepAt: c.last_full_sweep_at,
      consecutiveFailures: c.consecutive_failures,
      lastError: c.last_error,
      jobs: {},
    };
  }
  for (const j of openJobs) {
    const cs = state.companies[j.company_id];
    if (!cs) continue;
    cs.jobs[j.external_id] = {
      title: j.title,
      firstSeenAt: new Date(j.first_seen_at).toISOString(),
      lastSeenAt: new Date(j.last_seen_at).toISOString(),
      misses: j.misses,
    };
  }
  return state;
}

const key = (companyId: string, externalId: string) => `${companyId}::${externalId}`;
export { key as jobKey };

const MAX_DESCRIPTION = 20_000;

/** Workday / careers-site list entries have no description until we open the job's own page. */
function needsDetailFetch(j: NormalizedJob, ats: string | undefined): boolean {
  return ats !== undefined && needsJobPage(ats, j);
}

function detailColumns(j: NormalizedJob, seenAt: string) {
  const d = extractDetails(j.title, j.descriptionText, j.detailHints);
  const t = extractTiming(j.title, j.descriptionText, new Date(seenAt));
  const student = d.employmentType === "intern" || classifySeniority(j.title) === "intern";
  const a = extractAudience(j.title, j.descriptionText, student);
  const g = extractGlance(j.title, j.descriptionText);
  return {
    intern_levels: a.levels,
    grad_from: a.gradFrom,
    grad_to: a.gradTo,
    term: t.term,
    start_date: t.startDate,
    end_date: t.endDate,
    dates_label: t.datesLabel,
    duration_text: t.durationText,
    deadline: t.deadline,
    salary_min: d.salary?.min ?? null,
    salary_max: d.salary?.max ?? null,
    salary_currency: d.salary?.currency ?? null,
    salary_period: d.salary?.period ?? null,
    employment_type: d.employmentType,
    experience_min_years: d.experienceMinYears,
    requirements: d.requirements,
    work_model: g.workModel,
    work_model_detail: g.workModelDetail,
    visa_sponsorship: g.visaSponsorship,
    travel: g.travel,
    clearance_required: g.clearanceRequired,
    housing: g.housing,
    application_extras: g.applicationExtras,
  };
}

function toInsertRow(j: ClassifiedJob, isBacklog: boolean, firstSeenAt: string, lastSeenAt: string, ats?: string): JobInsertRow {
  return {
    company_id: j.companyId,
    external_id: j.externalId,
    title: j.title,
    url: j.url,
    locations: j.locations,
    remote: j.remote,
    country: j.country ?? null,
    department: j.department ?? null,
    // Keep descriptions only for roles the site can show (entry level, a known type). Senior roles and
    // "other" jobs at big tech/pharma boards would otherwise fill the free database with text nobody reads.
    description_text: j.descriptionText && isShowable(j) ? j.descriptionText.slice(0, MAX_DESCRIPTION) : null,
    posted_at: j.postedAt ?? postedAtFromText(j.postedText, new Date(firstSeenAt)),
    posted_text: j.postedText ?? null,
    role_family: j.roleFamily,
    seniority: j.seniority,
    degree_min: j.degreeMin,
    is_us: j.isUS,
    metro_tier: j.metroTier,
    states: j.states,
    places: j.places,
    dedupe_key: j.dedupeKey,
    is_backlog: isBacklog,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    ...detailColumns(j, firstSeenAt),
    details_version: needsDetailFetch(j, ats) ? 0 : DETAILS_VERSION,
  };
}

/** Could this job ever appear on the site? (Mirrors the site's base filter: entry-level-ish and a known job type.) */
export function isShowable(j: Pick<ClassifiedJob, "seniority" | "roleFamily">): boolean {
  return (j.seniority === "intern" || j.seniority === "entry" || j.seniority === "unspecified") && j.roleFamily !== "other";
}

function companyRow(c: Company, cs: CompanyState | undefined, nowIso: string): CompanyRow {
  return {
    id: c.id,
    name: c.name,
    ats: c.ats,
    ats_key: c.atsKey,
    segment: c.segment,
    active: c.active,
    baselined_at: cs?.baselinedAt ?? null,
    last_polled_at: cs?.lastPolledAt ?? null,
    last_full_sweep_at: cs?.lastFullSweepAt ?? null,
    consecutive_failures: cs?.consecutiveFailures ?? 0,
    last_error: cs?.lastError ?? null,
    updated_at: nowIso,
  };
}

export interface PersistPlan {
  companies: CompanyRow[];
  inserts: JobInsertRow[];
  touches: Map<string, { ids: string[]; at: string }>;
  missed: Map<string, string[]>;
  closed: Map<string, string[]>;
}

/**
 * Work out every database write from the state before and after the run.
 * - in `after` but not `before`  -> insert (new = not backlog)
 * - lastSeenAt changed           -> touch (seen again)
 * - misses went up               -> mark missed (not seen on a full sweep)
 * - in `before` but not `after`  -> close
 */
export function planPersist(
  companies: Company[],
  before: State,
  after: State,
  fetched: Map<string, ClassifiedJob[]>,
  newKeys: Set<string>,
  nowIso: string,
): PersistPlan {
  const plan: PersistPlan = { companies: [], inserts: [], touches: new Map(), missed: new Map(), closed: new Map() };

  for (const c of companies) {
    const a = after.companies[c.id];
    plan.companies.push(companyRow(c, a, nowIso));
    if (!a) continue;
    const b = before.companies[c.id]?.jobs ?? {};
    const byId = new Map((fetched.get(c.id) ?? []).map((j) => [j.externalId, j]));

    const touched: string[] = [];
    let touchedAt = "";
    const missed: string[] = [];
    for (const [id, now] of Object.entries(a.jobs)) {
      const prev = b[id];
      if (!prev) {
        const job = byId.get(id);
        if (job) plan.inserts.push(toInsertRow(job, !newKeys.has(key(c.id, id)), now.firstSeenAt, now.lastSeenAt, c.ats));
      } else if (now.lastSeenAt !== prev.lastSeenAt) {
        touched.push(id);
        touchedAt = now.lastSeenAt;
      } else if (now.misses > prev.misses) {
        missed.push(id);
      }
    }
    const closed = Object.keys(b).filter((id) => !(id in a.jobs));
    if (touched.length) plan.touches.set(c.id, { ids: touched, at: touchedAt });
    if (missed.length) plan.missed.set(c.id, missed);
    if (closed.length) plan.closed.set(c.id, closed);
  }
  return plan;
}

export async function applyPlan(db: JobsDb, plan: PersistPlan, csvCompanyIds: string[], run: RunRow): Promise<void> {
  // Companies first: jobs reference them.
  await db.upsertCompanies(plan.companies);
  await db.deactivateCompaniesNotIn(csvCompanyIds);
  for (let i = 0; i < plan.inserts.length; i += 500) await db.insertJobs(plan.inserts.slice(i, i + 500));
  for (const [companyId, { ids, at }] of plan.touches) {
    for (let i = 0; i < ids.length; i += 1000) await db.touchJobs(companyId, ids.slice(i, i + 1000), at);
  }
  for (const [companyId, ids] of plan.missed) await db.markMissed(companyId, ids);
  const closedAt = run.finished_at;
  for (const [companyId, ids] of plan.closed) await db.closeJobs(companyId, ids, closedAt);
  await db.insertRun(run);
}

// ---------------------------------------------------------------------------
// Backfill: fill in details for jobs saved before details existed (and Workday jobs,
// whose description needs one extra request each). A little every run.
// ---------------------------------------------------------------------------

export interface BackfillOptions {
  /** Jobs to process per run. */
  limit?: number;
  /** Workday detail-page requests per run (politeness). */
  maxWorkdayFetches?: number;
}

export async function backfillDetails(
  db: JobsDb,
  ctx: HttpContext,
  companies: Company[],
  fetched: Map<string, ClassifiedJob[]>,
  opts: BackfillOptions = {},
): Promise<{ updated: number; fetchedDetails: number; remaining: boolean }> {
  const limit = opts.limit ?? 300;
  const rows = await db.loadJobsNeedingDetails(
    limit,
    DETAILS_VERSION,
    companies.filter((c) => c.ats === "careersite").map((c) => c.id),
  );
  const byCompany = new Map(companies.map((c) => [c.id, c]));
  // This run's fetch has the structured hints (Lever salaryRange, Ashby compensation) the DB doesn't keep.
  const live = new Map<string, NormalizedJob>();
  for (const [cid, jobs] of fetched) for (const j of jobs) live.set(key(cid, j.externalId), j);

  let workdayBudget = opts.maxWorkdayFetches ?? 40;
  let fetchedDetails = 0;
  const updates = (
    await mapLimit(rows, 2, async (r): Promise<JobDetailsUpdate | null> => {
      const company = byCompany.get(r.company_id);
      if (!company) return null;
      let job: NormalizedJob = live.get(key(r.company_id, r.external_id)) ?? {
        companyId: r.company_id,
        externalId: r.external_id,
        title: r.title,
        url: r.url,
        locations: r.locations,
        remote: r.remote,
        postedAt: r.posted_at,
        country: r.country ?? undefined,
        department: r.department ?? undefined,
        descriptionText: r.description_text ?? undefined,
      };
      if (!job.descriptionText && r.description_text) job = { ...job, descriptionText: r.description_text };
      let gotDescription = false;
      if (needsDetailFetch(job, company.ats)) {
        if (workdayBudget <= 0) return null; // next run
        workdayBudget--;
        try {
          job = await enrichJob(ctx, company, job);
          fetchedDetails++;
          gotDescription = Boolean(job.descriptionText);
        } catch {
          return null; // try again next run
        }
      }
      const c = classifyJob(job, company);
      return {
        id: r.id,
        ...detailColumns(job, r.first_seen_at),
        posted_at: job.postedAt ?? postedAtFromText(r.posted_text, new Date(r.first_seen_at)),
        title: gotDescription ? job.title : null,
        // Re-classify every time, so improvements to the job-type rules reach jobs already saved.
        role_family: c.roleFamily,
        seniority: c.seniority,
        dedupe_key: c.dedupeKey,
        description_text: gotDescription ? (job.descriptionText ?? "").slice(0, MAX_DESCRIPTION) : null,
        locations: gotDescription ? job.locations : null,
        country: job.country ?? null,
        is_us: c.isUS,
        metro_tier: c.metroTier,
        states: c.states,
        places: c.places,
        degree_min: c.degreeMin,
        details_version: DETAILS_VERSION,
      };
    })
  ).filter((u): u is JobDetailsUpdate => u !== null);

  for (let i = 0; i < updates.length; i += 200) await db.updateJobDetails(updates.slice(i, i + 200));
  return { updated: updates.length, fetchedDetails, remaining: rows.length === limit || updates.length < rows.length };
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

function check(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
}

export function supabaseJobsDb(client: SupabaseClient): JobsDb {
  return {
    async loadCompanies() {
      const res = await client.from("companies").select("*");
      check(res, "load companies");
      return (res.data ?? []) as CompanyRow[];
    },
    async loadOpenJobs() {
      const rows: OpenJobRow[] = [];
      for (let from = 0; ; from += 1000) {
        const res = await client
          .from("jobs")
          .select("company_id, external_id, title, first_seen_at, last_seen_at, misses")
          .is("closed_at", null)
          .order("id")
          .range(from, from + 999);
        check(res, "load open jobs");
        rows.push(...((res.data ?? []) as OpenJobRow[]));
        if (!res.data || res.data.length < 1000) break;
      }
      return rows;
    },
    async upsertCompanies(rows) {
      if (rows.length) check(await client.from("companies").upsert(rows, { onConflict: "id" }), "upsert companies");
    },
    async deactivateCompaniesNotIn(ids) {
      if (!ids.length) return;
      const list = `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
      check(await client.from("companies").update({ active: false }).not("id", "in", list), "deactivate companies");
    },
    async insertJobs(rows) {
      if (rows.length) {
        check(
          // A conflict here can only be a job we'd closed that has been re-posted under the same ID
          // (open jobs are always in memory). Overwriting reopens it with fresh details.
          await client.from("jobs").upsert(
            rows.map((r) => ({ ...r, closed_at: null, misses: 0 })),
            { onConflict: "company_id,external_id" },
          ),
          "insert jobs",
        );
      }
    },
    async touchJobs(companyId, externalIds, seenAt) {
      check(await client.rpc("touch_jobs", { p_company_id: companyId, p_external_ids: externalIds, p_seen_at: seenAt }), "touch jobs");
    },
    async markMissed(companyId, externalIds) {
      check(await client.rpc("mark_missed", { p_company_id: companyId, p_external_ids: externalIds }), "mark missed");
    },
    async closeJobs(companyId, externalIds, closedAt) {
      check(await client.rpc("close_jobs", { p_company_id: companyId, p_external_ids: externalIds, p_closed_at: closedAt }), "close jobs");
    },
    async insertRun(row) {
      check(await client.from("poll_runs").insert(row), "insert run");
    },
    async loadJobsNeedingDetails(limit, version, pageCompanyIds = []) {
      const cols = "id, company_id, external_id, title, url, locations, remote, country, department, description_text, posted_at, posted_text, first_seen_at";
      const res = await client
        .from("jobs")
        .select(cols)
        .is("closed_at", null)
        .lt("details_version", version)
        // Only roles the site can show (entry level, a known job family). Senior roles never need details.
        .in("seniority", ["intern", "entry", "unspecified"])
        .neq("role_family", "other")
        .order("first_seen_at", { ascending: false })
        .limit(limit);
      check(res, "load jobs needing details");
      const rows = (res.data ?? []) as JobNeedingDetails[];
      if (pageCompanyIds.length && rows.length < limit) {
        const more = await client
          .from("jobs")
          .select(cols)
          .is("closed_at", null)
          .eq("details_version", 0)
          .in("company_id", pageCompanyIds)
          .order("first_seen_at", { ascending: false })
          .limit(limit - rows.length);
        check(more, "load careers-site jobs needing details");
        const have = new Set(rows.map((r) => r.id));
        rows.push(...((more.data ?? []) as JobNeedingDetails[]).filter((r) => !have.has(r.id)));
      }
      return rows;
    },
    async updateJobDetails(rows) {
      if (rows.length) check(await client.rpc("update_job_details", { p_rows: rows }), "update job details");
    },
  };
}

/** Returns a DB connection when SUPABASE_URL + SUPABASE_SECRET_KEY are set, else null (file mode). */
export function dbFromEnv(env: NodeJS.ProcessEnv = process.env): JobsDb | null {
  const url = env.SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabaseJobsDb(client);
}
