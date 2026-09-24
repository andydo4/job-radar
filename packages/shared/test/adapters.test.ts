import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enrichWorkdayJob,
  fetchWorkday,
  parseAshby,
  parseWorkdayDetail,
  parseGreenhouse,
  parseLever,
  workdayKeyFromUrl,
  type Company,
  type FetchFn,
} from "../src/index.ts";

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, "../../../fixtures", name), "utf8"));

const co = (ats: Company["ats"], atsKey: string, segment: Company["segment"] = "biotech"): Company => ({
  id: "example",
  name: "Example",
  ats,
  atsKey,
  segment,
  active: true,
});

describe("greenhouse", () => {
  const jobs = parseGreenhouse(co("greenhouse", "examplebio"), fx("greenhouse.json"));

  it("maps every job", () => {
    expect(jobs).toHaveLength(4);
    expect(jobs[0]).toMatchObject({
      externalId: "5238882007",
      title: "Associate Scientist, Protein Engineering",
      url: "https://job-boards.greenhouse.io/examplebio/jobs/5238882007",
      locations: ["Boston, Massachusetts"],
      remote: false,
      postedAt: "2026-09-15T13:59:39-04:00",
      department: "Research",
    });
  });

  it("decodes the entity-escaped HTML description to text", () => {
    expect(jobs[0]!.descriptionText).toContain("Bachelor's or Master's degree in Biology");
    expect(jobs[0]!.descriptionText).not.toContain("&lt;");
  });

  it("flags remote locations", () => {
    expect(jobs[3]!.remote).toBe(true);
  });
});

describe("lever", () => {
  const jobs = parseLever(co("lever", "examplelever"), fx("lever.json"));

  it("maps postings and converts epoch ms to ISO", () => {
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.postedAt).toBe(new Date(1785893219672).toISOString());
    expect(jobs[0]!.externalId).toBe("165ff672-7f3c-42a9-a00d-662a60cf12ff");
  });

  it("merges allLocations without duplicates", () => {
    expect(jobs[1]!.locations).toEqual(["Cambridge, MA", "New York, NY"]);
  });
});

describe("ashby", () => {
  const jobs = parseAshby(co("ashby", "exampleashby"), fx("ashby.json"));

  it("drops unlisted jobs", () => {
    expect(jobs.map((j) => j.title)).not.toContain("Hidden Draft Role");
    expect(jobs).toHaveLength(2);
  });

  it("includes secondary locations", () => {
    expect(jobs[0]!.locations).toEqual(["New York, NY", "Boston, MA"]);
  });
});

describe("workday", () => {
  it("parses tenant|wd|site from a careers URL", () => {
    expect(workdayKeyFromUrl("https://pfizer.wd1.myworkdayjobs.com/en-US/PfizerCareers/job/Associate-Scientist_4924655-2")).toBe(
      "pfizer|wd1|PfizerCareers",
    );
    expect(workdayKeyFromUrl("https://gilead.wd1.myworkdayjobs.com/gileadcareers")).toBe("gilead|wd1|gileadcareers");
    expect(workdayKeyFromUrl("https://example.com/careers")).toBeNull();
  });

  // Fake fetch that serves page 0 / page 1 fixtures based on the POST body offset.
  function fakeFetch(calls: { url: string; body: any }[]): FetchFn {
    return async (url, init) => {
      const body = JSON.parse(init?.body ?? "{}");
      calls.push({ url, body });
      const page = body.offset / 20;
      const data = page === 0 ? fx("workday-page0.json") : page === 1 ? fx("workday-page1.json") : { total: 0, jobPostings: [] };
      return { status: 200, json: async () => data };
    };
  }

  it("paginates 20 at a time, uses total from page 0, and reports a complete sweep", async () => {
    const calls: { url: string; body: any }[] = [];
    const res = await fetchWorkday({ fetch: fakeFetch(calls), userAgent: "test" }, co("workday", "pfizer|wd1|PfizerCareers", "pharma"), {
      pageDelayMs: 0,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://pfizer.wd1.myworkdayjobs.com/wday/cxs/pfizer/PfizerCareers/jobs");
    expect(calls.every((c) => c.body.limit === 20)).toBe(true);
    expect(res.jobs).toHaveLength(27);
    expect(res.complete).toBe(true);
    expect(res.requests).toBe(2);
    expect(res.jobs[0]!.url).toMatch(/^https:\/\/pfizer\.wd1\.myworkdayjobs\.com\/en-US\/PfizerCareers\/job\//);
    expect(res.jobs[0]!.postedText).toBe("Posted Today");
  });

  it("marks a page-limited sweep as NOT complete (so it can never close jobs)", async () => {
    const res = await fetchWorkday({ fetch: fakeFetch([]), userAgent: "test" }, co("workday", "pfizer|wd1|PfizerCareers", "pharma"), {
      maxPages: 1,
      pageDelayMs: 0,
    });
    expect(res.jobs).toHaveLength(20);
    expect(res.complete).toBe(false);
  });

  it('drops the useless "3 Locations" text', async () => {
    const res = await fetchWorkday({ fetch: fakeFetch([]), userAgent: "test" }, co("workday", "pfizer|wd1|PfizerCareers", "pharma"), {
      pageDelayMs: 0,
    });
    const director = res.jobs.find((j) => j.title.startsWith("Director"));
    expect(director!.locations).toEqual([]);
  });
});

describe("country fields", () => {
  it("lever passes through `country`", () => {
    const jobs = parseLever(co("lever", "examplelever"), fx("lever.json"));
    expect(jobs[0]!.country).toBe("US");
  });

  it("workday detail gives description, every location and the country", () => {
    const d = parseWorkdayDetail(fx("workday-detail.json"));
    expect(d.country).toBe("United States of America");
    expect(d.locations).toEqual(["Pearl River, NY", "Andover, MA"]);
    expect(d.descriptionText).toContain("Bachelor's degree in Biology");
  });

  it("enrichWorkdayJob fills in a vague list entry", async () => {
    const calls: string[] = [];
    const fetch: FetchFn = async (url) => {
      calls.push(url);
      return { status: 200, json: async () => fx("workday-detail.json") };
    };
    const job = {
      companyId: "example", externalId: "/job/X/Associate-Scientist_4999999", title: "Associate Scientist",
      url: "u", locations: [], remote: false, postedAt: null, postedText: "Posted Today",
    };
    const out = await enrichWorkdayJob({ fetch, userAgent: "t" }, co("workday", "pfizer|wd1|PfizerCareers", "pharma"), job);
    expect(calls[0]).toBe("https://pfizer.wd1.myworkdayjobs.com/wday/cxs/pfizer/PfizerCareers/job/X/Associate-Scientist_4999999");
    expect(out.locations).toEqual(["Pearl River, NY", "Andover, MA"]);
    expect(out.country).toBe("United States of America");
  });
});
