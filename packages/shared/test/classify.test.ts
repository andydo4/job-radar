import { describe, expect, it } from "vitest";
import {
  classifyDegreeMin,
  classifyLocation,
  classifyRoleFamily,
  classifySeniority,
  dedupeKey,
} from "../src/index.ts";

describe("seniority", () => {
  it.each([
    ["Associate Scientist, Protein Engineering", "entry"],
    ["Research Associate I", "entry"],
    ["Research Associate I/II", "entry"],
    ["Scientist I, Immunology", "entry"],
    ["QC Analyst", "entry"],
    ["Research Associate II, Assay Development", "mid"],
    ["Scientist III", "mid"],
    ["Senior Research Associate", "senior"],
    ["Associate Director, Clinical Operations", "senior"],
    ["Principal Scientist", "senior"],
    ["Summer Intern - Process Development", "intern"],
    ["Co-op, Analytical Development", "intern"],
    ["Venture Fellow", "entry"],
    ["Scientist, Phase 2 Oncology", "unspecified"],
    ["Scientist", "unspecified"],
  ])("%s -> %s", (title, expected) => {
    expect(classifySeniority(title)).toBe(expected);
  });
});

describe("role family", () => {
  it.each([
    ["Associate Scientist, Protein Engineering", "biotech", "research"],
    ["Process Development Associate", "biotech", "process"],
    ["Manufacturing Technician I", "pharma", "process"],
    ["QC Analyst I", "biotech", "quality"],
    ["Clinical Trial Associate", "pharma", "clinical"],
    ["Regulatory Affairs Associate", "pharma", "regulatory"],
    ["Bioinformatics Scientist", "biotech", "compbio"],
    ["Software Engineer, Lab Automation", "tools", "engineering"],
    ["Associate Consultant", "consulting", "consulting"],
    ["Analyst", "consulting", "consulting"],
    ["Recruiting Coordinator", "consulting", "other"],
    ["Investment Associate", "vc", "vc"],
    ["Strategy Analyst, Commercial Consulting", "pharma", "consulting"],
    ["Payroll Specialist", "biotech", "other"],
  ] as const)("%s @ %s -> %s", (title, segment, expected) => {
    expect(classifyRoleFamily(title, segment)).toBe(expected);
  });
});

describe("degree", () => {
  it("picks the lowest degree mentioned", () => {
    expect(classifyDegreeMin("Bachelor's or Master's degree in Biology")).toBe("bs");
    expect(classifyDegreeMin("PhD or MS in Computational Biology")).toBe("ms");
    expect(classifyDegreeMin("PhD in Chemistry required.")).toBe("phd");
    expect(classifyDegreeMin("Proficiency in MS Office. PhD required.")).toBe("phd");
    expect(classifyDegreeMin("Great team!")).toBeNull();
    expect(classifyDegreeMin(undefined)).toBeNull();
  });
});

describe("location", () => {
  it.each([
    [["Boston, Massachusetts"], false, true, 1],
    [["Cambridge, MA"], false, true, 1],
    [["New York, NY"], false, true, 1],
    [["Rahway, NJ"], false, true, 1],
    [["Philadelphia, PA"], false, true, 2],
    [["Research Triangle Park, NC"], false, true, 2],
    [["South San Francisco, CA"], false, true, 2],
    [["Seattle, WA"], false, true, 2],
    [["Remote - US"], true, true, 2],
    [["Kalamazoo, MI"], false, true, 3],
    [["Austin, Texas"], false, true, 3],
    [["Cambridge, United Kingdom"], false, false, null],
    [["Basel, Switzerland"], false, false, null],
    [["Remote"], true, null, 2],
    [[], false, null, 3],
    [["Basel, Switzerland", "Cambridge, MA"], false, true, 1],
    [["Washington, DC"], false, true, 2],
  ] as const)("%j remote=%s -> US=%s tier=%s", (locs, remote, isUS, tier) => {
    expect(classifyLocation([...locs], remote)).toEqual({ isUS, metroTier: tier });
  });
});

describe("dedupeKey", () => {
  it("groups the same role posted in different cities", () => {
    expect(dedupeKey("pfizer", "Associate Scientist - Andover, MA")).toBe(dedupeKey("pfizer", "Associate Scientist (Pearl River)"));
    expect(dedupeKey("pfizer", "Associate Scientist | Remote")).toBe(dedupeKey("pfizer", "Associate Scientist"));
  });

  it("keeps genuinely different roles apart", () => {
    expect(dedupeKey("x", "Associate Scientist - Protein Therapeutics")).not.toBe(dedupeKey("x", "Associate Scientist - Cell Biology"));
    expect(dedupeKey("x", "Analyst, QC")).not.toBe(dedupeKey("x", "Analyst"));
  });
});
