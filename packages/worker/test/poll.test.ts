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

describe("Workday new jobs are checked on their detail page (US-only)", () => {
  it("looks up the country of a new Workday job and hides it if it's outside the US", async () => {
    const state = emptyState();
    const wd = [FIXTURE_COMPANIES[3]!];
    await runPoll({ companies: wd, state, dryRun: true, fetch: fixturesFetch(FIXTURES), now: clock("2026-09-20T12:00:00Z") });

    const newPosting = (country: string) => (file: string, data: any) => {
      if (file === "workday-page0.json") {
        data.jobPostings.unshift({
          title: "Research Associate I",
          externalPath: "/job/Chihuahua/Research-Associate-I_5000001",
          locationsText: "2 Locations",
          postedOn: "Posted Today",
        });
      }
      if (file === "workday-detail.json") {
        data.jobPostingInfo.country = { descriptor: country };
        data.jobPostingInfo.location = "Chihuahua";
        data.jobPostingInfo.additionalLocations = ["Toluca"];
      }
      return data;
    };
    const r = await runPoll({ companies: wd, state, dryRun: true, fetch: fixturesFetch(FIXTURES, newPosting("Mexico")), now: clock("2026-09-20T12:10:00Z") });
    expect(r.allNew).toHaveLength(1);
    expect(r.allNew[0]).toMatchObject({ isUS: false, locations: ["Chihuahua", "Toluca"], country: "Mexico" });
    expect(r.matches).toHaveLength(0);
    expect(r.results[0]!.requests).toBe(1 + 2 + 1); // US-filter probe + 2 list pages (board ends on page 2) + 1 detail lookup
  });
});

describe("Workday full-sweep budget", () => {
  it("reads at most N big boards in full per run; new boards wait their turn, then get baselined", async () => {
    const wd = FIXTURE_COMPANIES.find((c) => c.ats === "workday")!;
    const boards = [1, 2, 3, 4, 5].map((i) => ({ ...wd, id: `wd-${i}`, name: `Pharma ${i}`, atsKey: `pharma${i}|wd1|Careers` }));
    const state = emptyState();
    const base = { companies: boards, state, dryRun: true, fetch: fixturesFetch(FIXTURES), maxWorkdayFullSweeps: 2 };

    const r1 = await runPoll({ ...base, now: clock("2026-09-20T12:00:00Z") });
    expect(r1.results.map((r) => r.mode)).toEqual(["full", "full", "waiting", "waiting", "waiting"]);
    expect(r1.results.every((r) => r.ok)).toBe(true);

    const r2 = await runPoll({ ...base, now: clock("2026-09-20T12:10:00Z") });
    expect(r2.results.map((r) => r.mode)).toEqual(["partial", "partial", "full", "full", "waiting"]);

    const r3 = await runPoll({ ...base, now: clock("2026-09-20T12:20:00Z") });
    expect(r3.results.map((r) => r.mode)).toEqual(["partial", "partial", "partial", "partial", "full"]);
    expect(Object.values(state.companies).every((c) => c.baselinedAt)).toBe(true);
    // Nothing from a first (baseline) read is ever reported as new.
    expect([...r1.allNew, ...r2.allNew, ...r3.allNew]).toHaveLength(0);
  });
});

describe("careers-site boards", () => {
  const site = { id: "abbvie", name: "AbbVie", ats: "careersite" as const, atsKey: "https://careers.example.com/sitemap.xml", segment: "pharma" as const, active: true };
  const page = (title: string) =>
    `<script type="application/ld+json">{"@type":"JobPosting","title":"${title}","description":"<p>BS in Biology. Apply by October 15, 2026.</p>","jobLocation":{"address":{"addressLocality":"Cambridge, MA"}},"datePosted":"2026-09-20T09:00:00Z"}</script>`;
  const makeFetch = (urls: string[], calls: string[]) =>
    (async (url: string) => {
      calls.push(url);
      const text = url.endsWith("sitemap.xml")
        ? `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`
        : page("Research Associate I, Protein Sciences");
      return { status: 200, json: async () => ({}), text: async () => text };
    }) as never;

  it("reads the feed at most hourly, and opens each NEW job's page once", async () => {
    const state = emptyState();
    const u = (n: number) => `https://careers.example.com/en/job/research-associate-${n}-in-cambridge-ma-jid-${n}`;
    const calls: string[] = [];
    const base = { companies: [site], state, dryRun: true };

    const r1 = await runPoll({ ...base, fetch: makeFetch([u(1), u(2)], calls), now: clock("2026-09-20T12:00:00Z") });
    expect(r1.results[0]).toMatchObject({ mode: "full", baselined: true, fetched: 2 });
    expect(calls).toHaveLength(1); // baseline: no page reads

    const r2 = await runPoll({ ...base, fetch: makeFetch([u(1), u(2), u(3)], calls), now: clock("2026-09-20T12:30:00Z") });
    expect(r2.results[0]!.mode).toBe("waiting"); // not due yet
    expect(calls).toHaveLength(1);

    const r3 = await runPoll({ ...base, fetch: makeFetch([u(1), u(2), u(3)], calls), now: clock("2026-09-20T13:05:00Z") });
    expect(r3.results[0]!.mode).toBe("full");
    expect(r3.allNew).toHaveLength(1);
    expect(r3.allNew[0]).toMatchObject({ title: "Research Associate I, Protein Sciences", locations: ["Cambridge, MA"], isUS: true, roleFamily: "research" });
    expect(calls.filter((c) => c.includes("jid-3"))).toHaveLength(1);
  });
});
