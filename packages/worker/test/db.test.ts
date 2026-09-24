import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { runPoll } from "../src/poll.ts";
import { FIXTURE_COMPANIES, fixturesFetch } from "../src/fixtures-fetch.ts";
import {
  applyPlan,
  planPersist,
  stateFromDb,
  type CompanyRow,
  backfillDetails,
  DETAILS_VERSION,
  type JobDetailsUpdate,
  type JobInsertRow,
  type JobNeedingDetails,
  type JobsDb,
  type OpenJobRow,
  type RunRow,
} from "../src/db.ts";

const FIXTURES = join(__dirname, "../../../fixtures");

/** In-memory stand-in for Supabase that behaves like the SQL in 0002_jobs.sql. */
class FakeDb implements JobsDb {
  companies = new Map<string, CompanyRow>();
  jobs = new Map<string, JobInsertRow & { id: number; misses: number; closed_at: string | null; description_text: string | null }>();
  private nextId = 1;
  runs: RunRow[] = [];
  private k = (c: string, e: string) => `${c}::${e}`;

  async loadCompanies() {
    return [...this.companies.values()];
  }
  async loadOpenJobs(): Promise<OpenJobRow[]> {
    return [...this.jobs.values()]
      .filter((j) => j.closed_at === null)
      .map((j) => ({ company_id: j.company_id, external_id: j.external_id, title: j.title, first_seen_at: j.first_seen_at, last_seen_at: j.last_seen_at, misses: j.misses }));
  }
  async upsertCompanies(rows: CompanyRow[]) {
    for (const r of rows) this.companies.set(r.id, { ...this.companies.get(r.id), ...r });
  }
  async deactivateCompaniesNotIn(ids: string[]) {
    for (const c of this.companies.values()) if (!ids.includes(c.id)) c.active = false;
  }
  async insertJobs(rows: JobInsertRow[]) {
    for (const r of rows) {
      if (!this.companies.has(r.company_id)) throw new Error("FK violation: company missing");
      this.jobs.set(this.k(r.company_id, r.external_id), { ...r, id: this.nextId++, misses: 0, closed_at: null });
    }
  }
  async touchJobs(c: string, ids: string[], at: string) {
    for (const id of ids) {
      const j = this.jobs.get(this.k(c, id));
      if (j && !j.closed_at) Object.assign(j, { last_seen_at: at, misses: 0 });
    }
  }
  async markMissed(c: string, ids: string[]) {
    for (const id of ids) {
      const j = this.jobs.get(this.k(c, id));
      if (j && !j.closed_at) j.misses++;
    }
  }
  async closeJobs(c: string, ids: string[], at: string) {
    for (const id of ids) {
      const j = this.jobs.get(this.k(c, id));
      if (j && !j.closed_at) j.closed_at = at;
    }
  }
  async insertRun(r: RunRow) {
    this.runs.push(r);
  }
  async loadJobsNeedingDetails(limit: number, version: number): Promise<JobNeedingDetails[]> {
    return [...this.jobs.values()].filter((j) => !j.closed_at && j.details_version < version).slice(0, limit);
  }
  async updateJobDetails(rows: JobDetailsUpdate[]) {
    for (const u of rows) {
      const j = [...this.jobs.values()].find((x) => x.id === u.id)!;
      Object.assign(j, { ...u, description_text: u.description_text ?? j.description_text, locations: u.locations ?? j.locations });
    }
  }
}

const RUN = (finished: string): RunRow => ({
  started_at: finished, finished_at: finished, companies_ok: 0, companies_failed: 0, new_jobs: 0, new_matches: 0, closed_jobs: 0, requests: 0, github_run_url: null,
});

/** One full poller run against the fake DB, exactly like main() does it. */
async function cycle(db: FakeDb, at: string, mutate?: (file: string, data: any) => any) {
  const state = stateFromDb(await db.loadCompanies(), await db.loadOpenJobs());
  const before = structuredClone(state);
  const summary = await runPoll({
    companies: FIXTURE_COMPANIES,
    state,
    dryRun: true,
    fetch: fixturesFetch(FIXTURES, mutate),
    now: () => new Date(at),
  });
  const plan = planPersist(FIXTURE_COMPANIES, before, state, summary.fetched, summary.newKeys, summary.finishedAt);
  await applyPlan(db, plan, FIXTURE_COMPANIES.map((c) => c.id), RUN(summary.finishedAt));
  return { summary, plan };
}

const gh = (key: string) => (db: FakeDb) => db.jobs.get(`example-gh::${key}`);

describe("poller + database", () => {
  it("first run saves every existing job as backlog, with classification", async () => {
    const db = new FakeDb();
    const { plan } = await cycle(db, "2026-09-20T12:00:00Z");
    expect(db.companies.size).toBe(4);
    expect([...db.companies.values()].every((c) => c.baselined_at === "2026-09-20T12:00:00.000Z")).toBe(true);
    // 4 greenhouse + 2 lever + 2 listed ashby + 27 workday
    expect(db.jobs.size).toBe(35);
    expect([...db.jobs.values()].every((j) => j.is_backlog)).toBe(true);
    expect(gh("5238882007")(db)).toMatchObject({ role_family: "research", seniority: "entry", metro_tier: 1, is_us: true, degree_min: "bs" });
    expect(plan.touches.size).toBe(0);
    expect(db.runs).toHaveLength(1);
  });

  it("second run: a new posting is saved as NOT backlog; seen jobs are touched; missing ones count a miss", async () => {
    const db = new FakeDb();
    await cycle(db, "2026-09-20T12:00:00Z");
    const change = (file: string, data: any) => {
      if (file === "greenhouse.json") {
        data.jobs = data.jobs.filter((j: any) => j.id !== 5238882008);
        data.jobs.push({ id: 999, title: "Research Associate I", absolute_url: "https://x/999", location: { name: "Boston, MA" }, first_published: "2026-09-20T12:05:00Z", content: "" });
      }
      return data;
    };
    const { summary } = await cycle(db, "2026-09-20T12:10:00Z", change);
    expect(summary.matches.map((j) => j.title)).toEqual(["Research Associate I"]);
    expect(gh("999")(db)).toMatchObject({ is_backlog: false, first_seen_at: "2026-09-20T12:10:00.000Z" });
    expect(gh("5238882007")(db)!.last_seen_at).toBe("2026-09-20T12:10:00.000Z");
    expect(gh("5238882008")(db)).toMatchObject({ misses: 1, closed_at: null });

    // Third run: still missing -> closed. Nothing is "new" twice.
    const third = await cycle(db, "2026-09-20T12:20:00Z", change);
    expect(third.summary.allNew).toHaveLength(0);
    expect(gh("5238882008")(db)!.closed_at).toBe("2026-09-20T12:20:00.000Z");
    // And the closed job is no longer loaded as open.
    expect((await db.loadOpenJobs()).some((j) => j.external_id === "5238882008")).toBe(false);
  });

  it("state survives a round trip through the database (no duplicate 'new' after reload)", async () => {
    const db = new FakeDb();
    await cycle(db, "2026-09-20T12:00:00Z");
    const again = await cycle(db, "2026-09-20T12:10:00Z");
    expect(again.summary.allNew).toHaveLength(0);
    expect(again.plan.inserts).toHaveLength(0);
    expect(db.jobs.size).toBe(35);
  });

  it("companies removed from the CSV are deactivated, not deleted", async () => {
    const db = new FakeDb();
    await cycle(db, "2026-09-20T12:00:00Z");
    db.companies.set("old-co", { ...db.companies.get("example-gh")!, id: "old-co", active: true });
    await cycle(db, "2026-09-20T12:10:00Z");
    expect(db.companies.get("old-co")!.active).toBe(false);
  });
});

describe("job details", () => {
  it("saves pay, job type and requirements when a job is first saved (Lever/Ashby structured fields)", async () => {
    const db = new FakeDb();
    await cycle(db, "2026-09-20T12:00:00Z");
    const lever = db.jobs.get("example-lever::165ff672-7f3c-42a9-a00d-662a60cf12ff")!;
    expect(lever).toMatchObject({ salary_min: 70000, salary_max: 85000, salary_period: "year", employment_type: "contract", details_version: DETAILS_VERSION });
    expect(lever.requirements).toHaveLength(2);
    const gh = db.jobs.get("example-gh::5238882007")!;
    expect(gh.details_version).toBe(DETAILS_VERSION);
  });

  it("Workday jobs without a description are filled in by the backfill, within a per-run budget", async () => {
    const db = new FakeDb();
    const { summary } = await cycle(db, "2026-09-20T12:00:00Z");
    const workday = () => [...db.jobs.values()].filter((j) => j.company_id === "example-wd");
    expect(workday().every((j) => j.details_version === 0)).toBe(true);

    const ctx = { fetch: fixturesFetch(FIXTURES), userAgent: "test" };
    const first = await backfillDetails(db, ctx, FIXTURE_COMPANIES, summary.fetched, { maxWorkdayFetches: 10 });
    expect(first.fetchedDetails).toBe(10);
    expect(workday().filter((j) => j.details_version === DETAILS_VERSION)).toHaveLength(10);
    const done = workday().find((j) => j.details_version === DETAILS_VERSION)!;
    expect(done).toMatchObject({ salary_min: 68000, salary_max: 113400, employment_type: "full_time", experience_min_years: 0, is_us: true });
    expect(done.description_text).toContain("vaccines team");

    // Keep going until everything is filled in.
    for (let i = 0; i < 5; i++) await backfillDetails(db, ctx, FIXTURE_COMPANIES, summary.fetched, { maxWorkdayFetches: 10 });
    expect(workday().every((j) => j.details_version === DETAILS_VERSION)).toBe(true);
    expect((await db.loadJobsNeedingDetails(100, DETAILS_VERSION))).toHaveLength(0);
  });

  it("saves term, dates, length and deadline for new postings (and Workday 'Posted N Days Ago' as a date)", async () => {
    const db = new FakeDb();
    await cycle(db, "2026-09-20T12:00:00Z");
    const change = (file: string, data: any) => {
      if (file === "greenhouse.json") {
        data.jobs.push({
          id: 777,
          title: "Research Intern, Summer 2027",
          absolute_url: "https://x/777",
          location: { name: "Boston, MA" },
          first_published: "2026-09-20T12:05:00Z",
          content: "&lt;p&gt;Our 12-week internship runs May 26 - August 15, 2027. Application deadline: October 15, 2026.&lt;/p&gt;",
        });
      }
      return data;
    };
    await cycle(db, "2026-09-20T12:10:00Z", change);
    expect(gh("777")(db)).toMatchObject({
      term: "Summer 2027",
      start_date: "2027-05-26",
      end_date: "2027-08-15",
      dates_label: "May 26 – Aug 15, 2027",
      duration_text: "12 weeks",
      deadline: "2026-10-15",
    });
    const wd = [...db.jobs.values()].find((j) => j.company_id === "example-wd" && /today/i.test(j.posted_text ?? ""));
    if (wd) expect(wd.posted_at).toBe("2026-09-20T12:00:00.000Z");
  });
});
