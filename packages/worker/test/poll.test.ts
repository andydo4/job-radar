import { describe, expect, it } from "vitest";
import { join } from "node:path";
import type { FetchResult, NormalizedJob } from "@job-radar/shared";
import { runPoll } from "../src/poll.ts";
import { FIXTURE_COMPANIES, fixturesFetch } from "../src/fixtures-fetch.ts";
import { applyFetch, emptyState, looksFresh, needsFullSweep } from "../src/store.ts";
import { parseCsv } from "../src/companies.ts";

const FIXTURES = join(__dirname, "../../../fixtures");
const clock = (iso: string) => () => new Date(iso);

describe("runPoll end to end (fixtures)", () => {
  it("baselines silently, then reports only new postings, then closes missing jobs after 2 full sweeps", async () => {
    const state = emptyState();
    const base = { companies: FIXTURE_COMPANIES, state, dryRun: true, workdayPartialPages: 3, fullSweepHours: 3 };

    // Run 1: first time we see these companies -> baseline, zero "new".
    const r1 = await runPoll({ ...base, fetch: fixturesFetch(FIXTURES), now: clock("2026-09-20T12:00:00Z") });
    expect(r1.results.every((r) => r.ok && r.baselined)).toBe(true);
    expect(r1.allNew).toHaveLength(0);

    // Run 2: one fresh Greenhouse job appears, and one old one disappears.
    const withNewJob = (file: string, data: any) => {
      if (file === "greenhouse.json") {
        data.jobs = data.jobs.filter((j: any) => j.id !== 5238882008); // Senior Scientist removed
        data.jobs.push({
          id: 999,
          title: "Research Associate I",
          absolute_url: "https://job-boards.greenhouse.io/examplebio/jobs/999",
          location: { name: "Cambridge, MA" },
          first_published: "2026-09-20T11:50:00Z",
          content: "&lt;p&gt;BS required&lt;/p&gt;",
        });
      }
      return data;
    };
    const r2 = await runPoll({ ...base, fetch: fixturesFetch(FIXTURES, withNewJob), now: clock("2026-09-20T12:10:00Z") });
    expect(r2.allNew.map((j) => j.title)).toEqual(["Research Associate I"]);
    expect(r2.matches[0]).toMatchObject({ roleFamily: "research", seniority: "entry", metroTier: 1, degreeMin: "bs", isUS: true });
    expect(r2.results.find((r) => r.company.ats === "greenhouse")!.closed).toBe(0); // 1st miss only

    // Workday was fully swept at 12:00, so at 12:10 it does a partial sweep.
    expect(r2.results.find((r) => r.company.ats === "workday")!.mode).toBe("partial");

    // Run 3: still missing -> closed. The new job is no longer "new".
    const r3 = await runPoll({ ...base, fetch: fixturesFetch(FIXTURES, withNewJob), now: clock("2026-09-20T12:20:00Z") });
    expect(r3.allNew).toHaveLength(0);
    expect(r3.results.find((r) => r.company.ats === "greenhouse")!.closed).toBe(1);
  });

  it("records a failure without stopping other companies", async () => {
    const state = emptyState();
    const broken = FIXTURE_COMPANIES.map((c) => (c.ats === "lever" ? { ...c, atsKey: "nope" } : c));
    const failingFetch = fixturesFetch(FIXTURES);
    const r = await runPoll({
      companies: broken,
      state,
      dryRun: true,
      now: clock("2026-09-20T12:00:00Z"),
      fetch: async (url, init) => (url.includes("api.lever.co") ? { status: 404, json: async () => ({}) } : failingFetch(url, init)),
    });
    const lever = r.results.find((x) => x.company.ats === "lever")!;
    expect(lever.ok).toBe(false);
    expect(lever.error).toContain("404");
    expect(r.results.filter((x) => x.ok)).toHaveLength(3);
    expect(state.companies["example-lever"]!.consecutiveFailures).toBe(1);
  });
});

describe("store rules", () => {
  const company = FIXTURE_COMPANIES[0]!;
  const job = (id: string, extra: Partial<NormalizedJob> = {}): NormalizedJob => ({
    companyId: company.id,
    externalId: id,
    title: `Job ${id}`,
    url: `https://x/${id}`,
    locations: [],
    remote: false,
    postedAt: null,
    ...extra,
  });
  const result = (jobs: NormalizedJob[], complete = true): FetchResult => ({ jobs, complete, requests: 1 });

  it("never closes jobs on a partial sweep", () => {
    const s = emptyState();
    applyFetch(s, company, result([job("a"), job("b")]), new Date("2026-09-20T00:00:00Z"));
    for (let i = 1; i <= 3; i++) {
      const r = applyFetch(s, company, result([job("a")], false), new Date(`2026-09-20T0${i}:00:00Z`));
      expect(r.closed).toHaveLength(0);
    }
    expect(Object.keys(s.companies[company.id]!.jobs)).toEqual(["a", "b"]);
  });

  it("does not close everything when a feed suddenly comes back empty", () => {
    const s = emptyState();
    applyFetch(s, company, result(["a", "b", "c", "d", "e", "f"].map((x) => job(x))), new Date("2026-09-20T00:00:00Z"));
    for (let i = 1; i <= 3; i++) {
      const r = applyFetch(s, company, result([]), new Date(`2026-09-20T0${i}:00:00Z`));
      expect(r.suspiciousEmpty).toBe(true);
      expect(r.closed).toHaveLength(0);
    }
  });

  it("treats first-seen-but-old postings as backlog, not new", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    expect(looksFresh(job("x", { postedAt: "2026-09-19T12:00:00Z" }), now)).toBe(true);
    expect(looksFresh(job("x", { postedAt: "2026-08-01T12:00:00Z" }), now)).toBe(false);
    expect(looksFresh(job("x", { postedText: "Posted Today" }), now)).toBe(true);
    expect(looksFresh(job("x", { postedText: "Posted 3 Days Ago" }), now)).toBe(true);
    expect(looksFresh(job("x", { postedText: "Posted 30+ Days Ago" }), now)).toBe(false);
    expect(looksFresh(job("x"), now)).toBe(true);
  });

  it("schedules Workday full sweeps every N hours", () => {
    const s = emptyState();
    const wd = FIXTURE_COMPANIES[3]!;
    expect(needsFullSweep(s, wd, new Date("2026-09-20T00:00:00Z"), 3)).toBe(true);
    applyFetch(s, wd, result([job("a")]), new Date("2026-09-20T00:00:00Z"));
    expect(needsFullSweep(s, wd, new Date("2026-09-20T02:59:00Z"), 3)).toBe(false);
    expect(needsFullSweep(s, wd, new Date("2026-09-20T03:00:00Z"), 3)).toBe(true);
  });
});

describe("csv", () => {
  it("handles quotes, comments and blank lines", () => {
    const rows = parseCsv('id,name,notes\n# comment\n\na,"Acme, Inc.","say ""hi"""\r\nb,Beta,\n');
    expect(rows).toEqual([
      { id: "a", name: "Acme, Inc.", notes: 'say "hi"' },
      { id: "b", name: "Beta", notes: "" },
    ]);
  });
});
