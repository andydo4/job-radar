import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { discoverOne, keyFromCareersUrl, slugVariants, slugify } from "../src/discover.ts";
import { newestFirstScore, postedDaysAgo } from "../src/workday-test.ts";
import { loadCompanies } from "../src/companies.ts";
import type { FetchFn } from "@job-radar/shared";

describe("discover", () => {
  it("slugifies names", () => {
    expect(slugify("Johnson & Johnson")).toBe("johnson-and-johnson");
    expect(slugify("L.E.K. Consulting")).toBe("l-e-k-consulting");
  });

  it("guesses sensible slugs, full name first", () => {
    const v = slugVariants("Generate Biomedicines");
    expect(v[0]).toBe("generatebiomedicines");
    expect(v).toContain("generate-biomedicines");
    expect(slugVariants("Moderna Therapeutics")).toEqual(
      expect.arrayContaining(["modernatherapeutics", "moderna", "modernatx"]),
    );
  });

  it("recognizes pasted careers links for every ATS", () => {
    expect(keyFromCareersUrl("https://job-boards.greenhouse.io/ginkgobioworks/jobs/5238882007")).toEqual({ ats: "greenhouse", key: "ginkgobioworks" });
    expect(keyFromCareersUrl("https://boards.greenhouse.io/recursionpharmaceuticals")).toEqual({ ats: "greenhouse", key: "recursionpharmaceuticals" });
    expect(keyFromCareersUrl("https://jobs.lever.co/adverum/165ff672")).toEqual({ ats: "lever", key: "adverum" });
    expect(keyFromCareersUrl("https://jobs.ashbyhq.com/benchling/abc")).toEqual({ ats: "ashby", key: "benchling" });
    expect(keyFromCareersUrl("https://gilead.wd1.myworkdayjobs.com/en-US/gileadcareers/job/X_R1")).toEqual({
      ats: "workday",
      key: "gilead|wd1|gileadcareers",
    });
    expect(keyFromCareersUrl("https://careers.example.com")).toBeNull();
  });

  it("probes Greenhouse, Ashby, Lever and returns the first board with jobs", async () => {
    const tried: string[] = [];
    const fetch: FetchFn = async (url) => {
      tried.push(url);
      if (url.startsWith("https://api.lever.co/v0/postings/generate-biomedicines")) {
        return { status: 200, json: async () => [{ id: "1" }, { id: "2" }] };
      }
      return { status: 404, json: async () => ({}) };
    };
    const hit = await discoverOne({ fetch, userAgent: "t" }, "Generate Biomedicines");
    expect(hit).toMatchObject({ ats: "lever", key: "generate-biomedicines", jobs: 2 });
    // tried all 3 ATSs for the first guess before moving on
    expect(tried.slice(0, 3).map((u) => new URL(u).hostname)).toEqual(["boards-api.greenhouse.io", "api.ashbyhq.com", "api.lever.co"]);
  }, 20_000);
});

describe("workday-test helpers", () => {
  it("reads Workday posted-on text", () => {
    expect(postedDaysAgo("Posted Today")).toBe(0);
    expect(postedDaysAgo("Posted Yesterday")).toBe(1);
    expect(postedDaysAgo("Posted 4 Days Ago")).toBe(4);
    expect(postedDaysAgo("Posted 30+ Days Ago")).toBe(30);
    expect(postedDaysAgo(undefined)).toBeNull();
  });

  it("scores sort order", () => {
    expect(newestFirstScore([0, 0, 1, 2, 5, 30])).toBe(1);
    expect(newestFirstScore([30, 0, 30, 0, 30, 0])).toBeLessThan(0.7);
    expect(newestFirstScore([0, 1])).toBeNull();
  });
});

describe("seed/companies.csv", () => {
  it("is valid", () => {
    const companies = loadCompanies(join(__dirname, "../../../seed/companies.csv"));
    expect(companies.length).toBeGreaterThanOrEqual(10);
    expect(companies.filter((c) => c.ats === "workday").length).toBeGreaterThanOrEqual(2);
  });
});
