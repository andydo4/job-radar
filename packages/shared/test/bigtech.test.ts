import { describe, expect, it } from "vitest";
import {
  amazonEarlyCareer,
  amazonUrl,
  classifyJob,
  eightfoldUrl,
  fetchAmazon,
  fetchApple,
  fetchEightfold,
  fetchGoogle,
  parseAmazon,
  parseApple,
  parseEightfold,
  parseGoogle,
  type Company,
  type FetchFn,
  type HttpContext,
} from "../src/index.ts";

// Shapes copied from the live sites on 2026-09-24 (trimmed).
const co = (ats: Company["ats"], atsKey: string, id: string = ats): Company => ({ id, name: id, ats, atsKey, segment: "tech", active: true });

const fakeFetch = (routes: (url: string) => { status?: number; body: unknown } | undefined): FetchFn => {
  const fn: FetchFn = async (url) => {
    const r = routes(url) ?? { status: 404, body: "not found" };
    const status = r.status ?? 200;
    return { status, json: async () => r.body, text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) };
  };
  return fn;
};
const ctx = (f: FetchFn): HttpContext => ({ fetch: f, userAgent: "test", timeoutMs: 1000 });

const amazonJob = (id: number, title: string) => ({
  id: `uuid-${id}`,
  id_icims: String(id),
  title,
  job_path: `/en/jobs/${id}/slug`,
  normalized_location: "Seattle, Washington, USA",
  posted_date: "September 24, 2026",
  job_category: "Software Development",
  description: "Build things.<br/>At scale.",
  basic_qualifications: "- Bachelor's degree in Computer Science<br/>- 0+ years of experience",
  preferred_qualifications: "- Internship experience",
});

describe("Amazon", () => {
  it("parses a page", () => {
    const { jobs, hits } = parseAmazon(co("amazon", "software-development"), { hits: 1, jobs: [amazonJob(1, "Software Development Engineer I, Early Career - 2027")] });
    expect(hits).toBe(1);
    expect(jobs[0]).toMatchObject({
      externalId: "1",
      url: "https://www.amazon.jobs/en/jobs/1/slug",
      locations: ["Seattle, Washington, USA"],
      postedAt: "2026-09-24T12:00:00.000Z",
      country: "US",
    });
    expect(jobs[0]!.descriptionText).toContain("Basic qualifications");
    const c = classifyJob(jobs[0]!, co("amazon", "x"));
    expect(c).toMatchObject({ roleFamily: "software", seniority: "entry", isUS: true, states: ["WA"] });
  });
  it("pages until the end", async () => {
    const page = (offset: number) => Array.from({ length: offset === 0 ? 100 : 30 }, (_, i) => amazonJob(offset + i, i % 2 ? "Software Development Engineer I" : "Software Development Engineer"));
    const f = fakeFetch((u) => {
      const offset = Number(new URL(u).searchParams.get("offset"));
      return { body: { hits: 130, jobs: page(offset) } };
    });
    const res = await fetchAmazon(ctx(f), co("amazon", "software-development"));
    expect(res).toMatchObject({ complete: true, requests: 2 });
    expect(res.jobs).toHaveLength(65); // only the early-career half
  });
  it("keeps only early-career roles", () => {
    expect(["Software Development Engineer I, Annapurna Labs, Early Career - 2027", "Software Development Engineer Intern - Summer 2027 (USA)", "Software Dev Engineer I", "University Graduate Software Engineer"].every(amazonEarlyCareer)).toBe(true);
    expect(["Software Development Engineer", "Software Development Engineer II", "Senior SDE", "Software Development Manager"].some(amazonEarlyCareer)).toBe(false);
    expect(amazonUrl("software-development;machine-learning", 0)).toContain("category%5B%5D=software-development&category%5B%5D=machine-learning");
  });
});

const googlePage = (rows: unknown[], total: number) =>
  `<html><script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify([rows, null, total, 20])}, sideChannel: {}});</script></html>`;
const googleRow = (id: string, title: string, locs: string[]) => [
  id,
  title,
  "https://www.google.com/about/careers/applications/signin?jobId=x",
  [null, "<ul><li>Write code.</li></ul>"],
  [null, "<h3>Minimum qualifications:</h3><ul><li>Bachelor's degree or equivalent practical experience.</li></ul>"],
  "projects/x",
  null,
  "Google",
  "en-US",
  locs.map((l) => [l, [], "", "", "", "US"]),
  [null, "<p>Google's software engineers develop the next-generation technologies.</p>"],
  [2],
  [1789481287, 411000000],
];

describe("Google", () => {
  it("reads the job list embedded in the page", () => {
    const { jobs, total } = parseGoogle(co("google", "EARLY"), googlePage([googleRow("78703249065943750", "Software Engineer, Early Career, Campus", ["Mountain View, CA, USA", "Cambridge, MA, USA"])], 1));
    expect(total).toBe(1);
    expect(jobs[0]).toMatchObject({
      externalId: "78703249065943750",
      url: "https://www.google.com/about/careers/applications/jobs/results/78703249065943750",
      locations: ["Mountain View, CA, USA", "Cambridge, MA, USA"],
    });
    expect(jobs[0]!.descriptionText).toMatch(/Responsibilities[\s\S]*Minimum qualifications/);
    expect(classifyJob(jobs[0]!, co("google", "x")).states).toEqual(["CA", "MA"]);
  });
  it("reads every page of every level", async () => {
    const f = fakeFetch((u) => {
      const p = new URL(u).searchParams;
      const level = p.get("target_level");
      const page = Number(p.get("page") ?? 1);
      if (level === "EARLY") return { body: googlePage(page === 1 ? Array.from({ length: 20 }, (_, i) => googleRow(`e${i}`, "SWE", ["New York, NY, USA"])) : [googleRow("e20", "SWE", ["Austin, TX, USA"])], 21) };
      return { body: googlePage([googleRow("i1", "Software Engineering Intern", ["Seattle, WA, USA"])], 1) };
    });
    const res = await fetchGoogle(ctx(f), co("google", "EARLY;INTERN_AND_APPRENTICE"));
    expect(res).toMatchObject({ complete: true, requests: 3 });
    expect(res.jobs.map((j) => j.externalId)).toContain("i1");
    expect(res.jobs).toHaveLength(22);
  });
});

const applePage = (rows: unknown[], total: number) => {
  const json = JSON.stringify({ loaderData: { root: {}, search: { searchResults: rows, totalRecords: total } } });
  return `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(json)});</script>`;
};
const appleRow = (id: string, title: string, city: string, state?: string) => ({
  positionId: id,
  postingTitle: title,
  transformedPostingTitle: "software-engineering-internships",
  postDateInGMT: "2026-08-27T20:41:24.044Z",
  locations: [{ name: city, city, stateProvince: state }],
  team: { teamName: "Students" },
  jobSummary: "Imagine what you could do here.",
});

describe("Apple", () => {
  it("merges one row per location into one job", () => {
    const { jobs } = parseApple(
      co("apple", "internships-STDNT-INTRN"),
      applePage([appleRow("200673612", "Software Engineering Internships", "Cupertino", "California"), appleRow("200673612", "Software Engineering Internships", "Austin", "Texas")], 2),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ locations: ["Cupertino, California, United States", "Austin, Texas, United States"], url: "https://jobs.apple.com/en-us/details/200673612/software-engineering-internships" });
    expect(classifyJob(jobs[0]!, co("apple", "x"))).toMatchObject({ seniority: "intern", roleFamily: "software", states: ["CA", "TX"] });
  });
  it("fetches pages", async () => {
    const f = fakeFetch(() => ({ body: applePage([appleRow("1", "Hardware Engineering Internships", "Cupertino", "California")], 1) }));
    const res = await fetchApple(ctx(f), co("apple", "internships-STDNT-INTRN"));
    expect(res).toMatchObject({ complete: true, requests: 1 });
  });
});

describe("Eightfold (Microsoft, Netflix)", () => {
  const ms = co("eightfold", "apply.careers.microsoft.com|microsoft.com|software engineer", "microsoft");
  const nf = co("eightfold", "explore.jobs.netflix.net|netflix.com|", "netflix");
  const pcsxPos = (id: number, name: string) => ({
    id,
    name,
    locations: ["United States, Washington, Redmond"],
    standardizedLocations: ["Redmond, WA, US"],
    postedTs: 1790283471,
    department: "Software Engineering",
    workLocationOption: "onsite",
    positionUrl: `/careers/job/${id}`,
  });
  it("parses the PCSX API (Microsoft)", () => {
    const { jobs, count } = parseEightfold(ms, { host: "apply.careers.microsoft.com", domain: "microsoft.com", query: "" }, { status: 200, data: { positions: [pcsxPos(1970393557002604, "Software Engineer")], count: 1246 } });
    expect(count).toBe(1246);
    expect(jobs[0]).toMatchObject({ externalId: "1970393557002604", url: "https://apply.careers.microsoft.com/careers/job/1970393557002604", locations: ["Redmond, WA, US"] });
    expect(classifyJob(jobs[0]!, ms).states).toEqual(["WA"]);
  });
  it("parses the older v2 API (Netflix)", () => {
    const { jobs } = parseEightfold(nf, { host: "explore.jobs.netflix.net", domain: "netflix.com", query: "" }, {
      positions: [{ id: 790318615785, name: "Software Engineer (L4)", locations: ["Los Gatos,California,United States of America"], t_create: 1790121600, canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790318615785" }],
      count: 198,
    });
    expect(jobs[0]).toMatchObject({ url: "https://explore.jobs.netflix.net/careers/job/790318615785", locations: ["Los Gatos, California, United States of America"] });
    expect(classifyJob(jobs[0]!, nf).states).toEqual(["CA"]);
  });
  it("falls back to v2 when PCSX is off, and a rate limit ends the read without closing anything", async () => {
    let v2Calls = 0;
    const f = fakeFetch((u) => {
      if (u.includes("/api/pcsx/")) return { status: 403, body: { message: "Not authorized for PCSX" } };
      v2Calls++;
      const start = Number(new URL(u).searchParams.get("start"));
      if (start >= 20) return { status: 429, body: "Please try again later" };
      return { body: { positions: Array.from({ length: 10 }, (_, i) => ({ id: start + i, name: "Software Engineer", locations: ["Los Gatos,California,United States"] })), count: 198 } };
    });
    const res = await fetchEightfold(ctx(f), nf);
    expect(res.jobs).toHaveLength(20);
    expect(res.complete).toBe(false);
    expect(v2Calls).toBeGreaterThanOrEqual(3);
    expect(eightfoldUrl({ host: "h", domain: "d.com", query: "software engineer" }, "pcsx", 10)).toBe(
      "https://h/api/pcsx/search?domain=d.com&query=software%20engineer&location=United%20States&start=10&num=10&sort_by=timestamp",
    );
  }, 20_000);
});
