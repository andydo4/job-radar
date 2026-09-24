import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { runPoll } from "../src/poll.ts";
import { FIXTURE_COMPANIES, fixturesFetch } from "../src/fixtures-fetch.ts";
import {
  applyPlan,
  planPersist,
  stateFromDb,
  type CompanyRow,
  type JobInsertRow,
  type JobsDb,
  type OpenJobRow,
  type RunRow,
} from "../src/db.ts";

const FIXTURES = join(__dirname, "../../../fixtures");

/** In-memory stand-in for Supabase that behaves like the SQL in 0002_jobs.sql. */
class FakeDb implements JobsDb {
  companies = new Map<string, CompanyRow>();
  jobs = new Map<string, JobInsertRow & { misses: number; closed_at: string | null }>();
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
      this.jobs.set(this.k(r.company_id, r.external_id), { ...r, misses: 0, closed_at: null });
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
