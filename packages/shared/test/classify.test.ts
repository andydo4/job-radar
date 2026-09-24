import { describe, expect, it } from "vitest";
import {
  classifyDegreeMin,
  placesOf,
  placeKeys,
  statesOf,
  stateOf,
  classifyLocation,
  classifyRoleFamily,
  classifySeniority,
  dedupeKey,
  hiddenReason,
  DEFAULT_FILTER,
  type ClassifiedJob,
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
    ["Software Engineer, Lab Automation", "tools", "software"],
    ["Associate Consultant", "consulting", "consulting"],
    ["Analyst", "consulting", "consulting"],
    ["Recruiting Coordinator", "consulting", "other"],
    ["Investment Associate", "vc", "vc"],
    ["Strategy Analyst, Commercial Consulting", "pharma", "consulting"],
    // Generalist firms: only life-science / health practices count as consulting.
    ["(2028 Bachelor's/Master's graduates) Cyber and Forensic Technology Consulting Analyst/Associate Intern (Summer 2027)", "consulting", "other"],
    ["Antitrust & Competition Economics Associate", "consulting", "other"],
    ["Energy Consulting Analyst", "consulting", "other"],
    ["Life Sciences Consulting Associate", "consulting", "consulting"],
    ["Health Care Technology Consulting Analyst", "consulting", "consulting"],
    ["Forensic Services Analyst, Life Sciences Litigation", "consulting", "consulting"],
    ["Technology Consulting Analyst", "pharma", "other"],
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

describe("location with an ATS country field", () => {
  it.each([
    [[], false, "US", true, 3],
    [["Remote"], true, "US", true, 2],
    [["Remote"], true, "United States of America", true, 2],
    [["Chihuahua"], false, "Mexico", false, null],
    [["Toluca"], false, "MX", false, null],
    [["Toluca", "Pearl River, NY"], false, "Mexico", true, 2], // any US location wins
    [["Remote"], true, undefined, null, 2],
    [["Chihuahua, Chihuahua"], false, undefined, false, null], // known non-US city, no country field
  ] as const)("%j remote=%s country=%s -> US=%s tier=%s", (locs, remote, country, isUS, tier) => {
    expect(classifyLocation([...locs], remote, country)).toEqual({ isUS, metroTier: tier });
  });
});

describe("US-only default filter", () => {
  const base: Omit<ClassifiedJob, "isUS" | "metroTier"> = {
    companyId: "x", externalId: "1", title: "Associate Scientist", url: "u", locations: [], remote: false, postedAt: null,
    roleFamily: "research", seniority: "entry", degreeMin: null, dedupeKey: "x::a", states: [], places: [],
  };
  it("keeps US jobs and hides non-US and unknown ones, with a reason", () => {
    expect(hiddenReason({ ...base, isUS: true, metroTier: 1 }, DEFAULT_FILTER)).toBeNull();
    expect(hiddenReason({ ...base, isUS: false, metroTier: null }, DEFAULT_FILTER)).toBe("outside US");
    expect(hiddenReason({ ...base, isUS: null, metroTier: 2 }, DEFAULT_FILTER)).toBe("location unknown");
    expect(hiddenReason({ ...base, isUS: true, metroTier: 1, seniority: "senior" }, DEFAULT_FILTER)).toBe("senior level");
  });
});

describe("software roles at tech companies (Phase 3)", () => {
  it.each([
    ["Software Engineer, New Grad", "software", "entry"],
    ["Software Engineer, Early Career (AI)", "software", "entry"],
    ["[2027] Software Engineer, Early Career", "software", "entry"],
    ["Forward Deployed Engineer - New Grad", "software", "entry"],
    ["Product Engineer", "software", "unspecified"],
    ["Design Engineer", "software", "unspecified"],
    ["Product Designer, University Grad", "software", "entry"],
    ["Software Engineering AMTS, College Grad", "software", "entry"],
    ["Senior Software Engineer, Backend", "software", "senior"],
    ["Software Engineer II", "software", "mid"],
    ["Account Executive, Enterprise", "other", "unspecified"],
    ["Recruiting Coordinator", "other", "unspecified"],
    ["Software Engineering Intern (Summer 2027)", "software", "intern"],
  ])("%s", (title, family, level) => {
    expect(classifyRoleFamily(title, "tech")).toBe(family);
    expect(classifySeniority(title)).toBe(level);
  });

  it("software jobs at biotech / pharma are Software too (so unticking Software hides them)", () => {
    expect(classifyRoleFamily("Software Engineer, Lab Automation", "tools")).toBe("software");
    expect(classifyRoleFamily("Data Engineer II", "pharma")).toBe("software");
    expect(classifyRoleFamily("Full Stack Developer - Clinical Platforms", "pharma")).toBe("software");
    expect(classifyRoleFamily("Salesforce Developer", "pharma")).toBe("software");
  });
  it("...but lab, plant and instrument engineers stay Engineering / Process", () => {
    expect(classifyRoleFamily("Automation Engineer", "biotech")).toBe("engineering");
    expect(classifyRoleFamily("Systems Engineer, Instrumentation", "tools")).toBe("engineering");
    expect(classifyRoleFamily("Bioinformatics Scientist", "biotech")).toBe("compbio");
    expect(classifyRoleFamily("Research Associate, Protein Engineering", "biotech")).toBe("research");
  });
});

describe("places for the map", () => {
  it.each([
    [["Boston, MA"], false, ["MA|Boston"]],
    [["Cambridge, Massachusetts, United States"], false, ["MA|Cambridge"]],
    [["US-MA-Waltham"], false, ["MA|Waltham"]],
    [["USA - New Jersey - Rahway"], false, ["NJ|Rahway"]],
    [["South San Francisco, CA 94080"], false, ["CA|South San Francisco"]],
    [["Boston, MA; New York, NY"], false, ["MA|Boston", "NY|New York"]],
    [["San Francisco, CA", "Remote - US"], true, ["CA|San Francisco", "REMOTE|"]],
    [["Remote"], true, ["REMOTE|"]],
    [[], true, ["REMOTE|"]],
    [["New York City"], false, ["NY|New York"]],
    [["Newark, DE"], false, ["DE|Newark"]],
    [["Grenzach-Wyhlen, Baden-Württemberg, DE"], false, []],
    [["3 Locations"], false, []],
    [["US, Indianapolis IN"], false, ["IN|Indianapolis"]],
    [["Titusville NJ"], false, ["NJ|Titusville"]],
    [["Parsippany, New Jersey, United States of America"], false, ["NJ|Parsippany"]],
    [["US - North Carolina - Holly Springs"], false, ["NC|Holly Springs"]],
  ] as const)("%j remote=%s -> %j", (locs, remote, want) => {
    expect(placeKeys(placesOf([...locs], remote))).toEqual(want);
  });

  it("states are unique and sorted", () => {
    expect(statesOf(placesOf(["Boston, MA", "Cambridge, MA", "Remote"], true))).toEqual(["MA", "REMOTE"]);
  });

  it("a German Bayer listing is not Delaware", () => {
    expect(stateOf("Grenzach-Wyhlen, Baden-Württemberg, DE")).toBeNull();
    expect(classifyLocation(["Grenzach-Wyhlen, Baden-Württemberg, DE"], false, "DE")).toEqual({ isUS: false, metroTier: null });
    expect(classifyLocation(["Whippany, New Jersey, US"], false, "US").isUS).toBe(true);
    expect(stateOf("Wilmington, DE")).toBe("DE");
    expect(classifyLocation(["Lebanon IN"], false).isUS).toBe(true);
  });
});
