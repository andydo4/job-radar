import { describe, expect, it } from "vitest";
import { allowedDegrees, maxExperience, monthsUntil, parseProfileForm, qualify } from "../lib/profile";
import { interpretLiveCheck, liveCheck, liveCheckUrl } from "../lib/live-check";

const NOW = new Date("2026-09-23T12:00:00Z");
const job = (degree_min: string | null, experience_min_years: number | null, seniority = "entry") => ({ degree_min, experience_min_years, seniority });

describe("qualify", () => {
  const bs0 = { degree: "bs" as const, years_experience: 0, grad_month: "2026-05-01" };

  it("no profile yet -> no badge", () => {
    expect(qualify({ degree: null, years_experience: null, grad_month: null }, job("bs", 0), NOW)).toBeNull();
  });
  it("nothing stated in the posting -> likely", () => {
    expect(qualify(bs0, job(null, null), NOW)).toMatchObject({ level: "likely", label: "Likely qualify", reasons: [] });
  });
  it("bachelor's, 0 yrs vs a BS / 0-1 yr posting -> likely / stretch", () => {
    expect(qualify(bs0, job("bs", 0), NOW)!.level).toBe("likely");
    expect(qualify(bs0, job("bs", 1), NOW)).toMatchObject({ level: "stretch", reasons: ["Asks for 1+ yrs experience"] });
    expect(qualify(bs0, job("bs", 3), NOW)!.level).toBe("unlikely");
  });
  it("one degree step up is a stretch; PhD-only is 'Needs PhD'", () => {
    expect(qualify(bs0, job("ms", null), NOW)).toMatchObject({ level: "stretch", reasons: ["Asks for a master's"] });
    expect(qualify(bs0, job("phd", null), NOW)).toMatchObject({ level: "unlikely", label: "Needs PhD" });
    expect(qualify({ ...bs0, degree: "phd" }, job("phd", null), NOW)!.level).toBe("likely");
  });
  it("an advanced degree counts toward experience", () => {
    expect(qualify({ ...bs0, degree: "ms" }, job("bs", 1), NOW)!.level).toBe("likely");
    expect(qualify({ ...bs0, degree: "phd" }, job("bs", 2), NOW)!.level).toBe("likely");
  });
  it("internships after graduating are a stretch", () => {
    expect(qualify(bs0, job(null, null, "intern"), NOW)).toMatchObject({ level: "stretch" });
    expect(qualify({ ...bs0, grad_month: "2027-05-01" }, job(null, null, "intern"), NOW)!.level).toBe("likely");
  });
  it("monthsUntil", () => {
    expect(monthsUntil("2026-09-01", NOW)).toBe(0);
    expect(monthsUntil("2027-05-01", NOW)).toBe(8);
    expect(monthsUntil("2026-05-01", NOW)).toBe(-4);
  });
});

describe("For you limits", () => {
  it("degrees: yours plus one step up; PhD-only needs a PhD", () => {
    expect(allowedDegrees("none")).toEqual(["bs"]);
    expect(allowedDegrees("bs")).toEqual(["bs", "ms"]);
    expect(allowedDegrees("ms")).toEqual(["bs", "ms"]);
    expect(allowedDegrees("phd")).toEqual(["bs", "ms", "phd"]);
  });
  it("experience: your years (+ degree credit) + 1", () => {
    expect(maxExperience(null, "bs")).toBeNull();
    expect(maxExperience(0, "bs")).toBe(1);
    expect(maxExperience(1, "ms")).toBe(3);
  });
});

describe("parseProfileForm", () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };
  it("parses a full form", () => {
    const r = parseProfileForm(
      fd([
        ["degree", "bs"],
        ["field", " Biochemistry "],
        ["grad_month", "2026-05"],
        ["years_experience", "1"],
        ["families", "research"],
        ["families", "clinical"],
        ["families", "bogus"],
        ["metro_tiers", "2"],
        ["metro_tiers", "1"],
        ["include_internships", "on"],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        degree: "bs",
        field: "Biochemistry",
        grad_month: "2026-05-01",
        years_experience: 1,
        families: ["research", "clinical"],
        include_internships: true,
        metro_tiers: [1, 2],
        hide_contract: false,
      },
    });
  });
  it("reports missing choices", () => {
    const r = parseProfileForm(fd([["grad_month", "2026-13"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["degree", "families", "grad_month", "metro_tiers"]);
  });
});

describe("live check", () => {
  it("builds the right URL per board", () => {
    expect(liveCheckUrl({ ats: "greenhouse", atsKey: "ginkgo", externalId: "123" })).toBe("https://boards-api.greenhouse.io/v1/boards/ginkgo/jobs/123");
    expect(liveCheckUrl({ ats: "lever", atsKey: "x", externalId: "ab-c" })).toBe("https://api.lever.co/v0/postings/x/ab-c");
    expect(liveCheckUrl({ ats: "workday", atsKey: "pfizer|wd1|PfizerCareers", externalId: "/job/Andover-MA/Scientist_1" })).toBe(
      "https://pfizer.wd1.myworkdayjobs.com/wday/cxs/pfizer/PfizerCareers/job/Andover-MA/Scientist_1",
    );
    expect(liveCheckUrl({ ats: "workday", atsKey: "broken", externalId: "/job/x" })).toBeNull();
  });
  it("reads the answer", () => {
    expect(interpretLiveCheck("greenhouse", "1", 404, null)).toBe("closed");
    expect(interpretLiveCheck("greenhouse", "1", 200, { id: 1 })).toBe("open");
    expect(interpretLiveCheck("lever", "a", 500, null)).toBe("unknown");
    expect(interpretLiveCheck("ashby", "a", 200, { jobs: [{ id: "b" }] })).toBe("closed");
    expect(interpretLiveCheck("ashby", "a", 200, { jobs: [{ id: "a" }] })).toBe("open");
    expect(interpretLiveCheck("ashby", "a", 200, { jobs: [{ id: "a", isListed: false }] })).toBe("closed");
    expect(interpretLiveCheck("ashby", "a", 404, null)).toBe("unknown");
    expect(interpretLiveCheck("workday", "/x", 200, { jobPostingInfo: { title: "t" } })).toBe("open");
    expect(interpretLiveCheck("workday", "/x", 200, { jobPostingInfo: { canApply: false } })).toBe("closed");
    expect(interpretLiveCheck("workday", "/x", 200, { error: "x" })).toBe("unknown");
    expect(interpretLiveCheck("careersite", "u", 404, null)).toBe("closed");
    expect(interpretLiveCheck("careersite", "u", 200, null)).toBe("unknown");
    expect(liveCheckUrl({ ats: "careersite", atsKey: "https://x/sitemap.xml", externalId: "u", url: "https://careers.abbvie.com/en/job/a-jid-1" })).toBe("https://careers.abbvie.com/en/job/a-jid-1");
  });
  it("never blocks on errors or timeouts", async () => {
    const boom = async () => {
      throw new Error("network");
    };
    expect(await liveCheck({ ats: "lever", atsKey: "x", externalId: "y" }, boom)).toBe("unknown");
    const gone = async () => new Response("not found", { status: 404 });
    expect(await liveCheck({ ats: "lever", atsKey: "x", externalId: "y" }, gone)).toBe("closed");
  });
});
