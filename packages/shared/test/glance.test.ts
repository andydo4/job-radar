import { describe, expect, it } from "vitest";
import {
  applicationExtrasFrom,
  clearanceFrom,
  extractGlance,
  housingFrom,
  travelFrom,
  visaSponsorshipFrom,
  workModelFrom,
} from "../src/glance.ts";

// ---------------------------------------------------------------------------
// Work model
// ---------------------------------------------------------------------------

describe("workModel", () => {
  it.each([
    ["This is a fully remote position.", "remote"],
    ["Remote-first role based in Boston.", "remote"],
    ["This position is remote. Work from home.", "remote"],
    ["Location: Remote", "remote"],
    ["Working remotely from anywhere in the US.", "remote"],
  ])("remote: %s", (text, expected) => {
    expect(workModelFrom(text).model).toBe(expected);
  });

  it.each([
    ["Hybrid role, 3 days in office per week.", "hybrid"],
    ["This is a hybrid position.", "hybrid"],
    ["Hybrid: Tuesday and Thursday on-site.", "hybrid"],
  ])("hybrid: %s", (text, expected) => {
    expect(workModelFrom(text).model).toBe(expected);
  });

  it("extracts hybrid day count", () => {
    expect(workModelFrom("Hybrid role, 3 days in office per week.").detail).toBe("3 days in office");
    expect(workModelFrom("On-site 2-3 days per week in our Cambridge office.").detail).toBe("2–3 days in office");
  });

  it.each([
    ["This is an on-site position in Cambridge, MA.", "onsite"],
    ["In-office only role.", "onsite"],
    ["Position is on-site at our San Diego facility.", "onsite"],
    ["Non-remote position.", "onsite"],
  ])("onsite: %s", (text, expected) => {
    expect(workModelFrom(text).model).toBe(expected);
  });

  it("ignores false positives", () => {
    expect(workModelFrom("Experience with remote sensing required.").model).toBeNull();
    expect(workModelFrom("Remote monitoring of patients.").model).toBeNull();
  });

  it("returns null for ambiguous or missing info", () => {
    expect(workModelFrom("Great benefits and competitive salary.").model).toBeNull();
    expect(workModelFrom("").model).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Visa sponsorship
// ---------------------------------------------------------------------------

describe("visaSponsorship", () => {
  it.each([
    ["We will not sponsor work visas for this position.", "no"],
    ["Must be authorized to work in the U.S. without sponsorship.", "no"],
    ["This position does not offer visa sponsorship.", "no"],
    ["Cannot sponsor visas at this time.", "no"],
    ["No sponsorship available.", "no"],
    ["Sponsorship is unavailable for this role.", "no"],
  ])("no: %s", (text, expected) => {
    expect(visaSponsorshipFrom(text)).toBe(expected);
  });

  it.each([
    ["We will sponsor qualified candidates for work authorization.", "yes"],
    ["Sponsorship is available for the right candidate.", "yes"],
    ["Visa sponsorship offered.", "yes"],
  ])("yes: %s", (text, expected) => {
    expect(visaSponsorshipFrom(text)).toBe(expected);
  });

  it("ignores relocation sponsorship", () => {
    expect(visaSponsorshipFrom("This role does not provide relocation sponsorship.")).toBeNull();
  });

  it("returns null when not mentioned", () => {
    expect(visaSponsorshipFrom("Great job opportunity with competitive pay.")).toBeNull();
    expect(visaSponsorshipFrom("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

describe("travel", () => {
  it.each([
    ["Up to 25% travel required.", "Up to 25% travel"],
    ["Travel: 10-20%", "10–20% travel"],
    ["50% travel", "50% travel"],
    ["Minimal travel required.", "Minimal travel"],
    ["Frequent travel to client sites.", "Frequent travel"],
    ["No travel required.", "No travel required"],
  ])("%s -> %s", (text, expected) => {
    expect(travelFrom(text)).toBe(expected);
  });

  it("returns null when not mentioned", () => {
    expect(travelFrom("Competitive salary and benefits.")).toBeNull();
    expect(travelFrom("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Clearance
// ---------------------------------------------------------------------------

describe("clearance", () => {
  it.each([
    ["Must have active security clearance.", true],
    ["Top Secret clearance is required.", true],
    ["Requires a U.S. security clearance.", true],
    ["Active TS/SCI clearance required.", true],
  ])("%s -> %s", (text, expected) => {
    expect(clearanceFrom(text)).toBe(expected);
  });

  it("returns null when not mentioned", () => {
    expect(clearanceFrom("Standard research position.")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Housing
// ---------------------------------------------------------------------------

describe("housing", () => {
  it.each([
    ["Housing is provided for interns.", "provided"],
    ["Company-provided housing near campus.", "provided"],
    ["Furnished corporate apartment included.", "provided"],
    ["Housing stipend available for summer interns.", "stipend"],
    ["Relocation and housing allowance provided.", "stipend"],
    ["Housing is not provided.", "not_provided"],
    ["No housing assistance available.", "not_provided"],
  ] as [string, string][])("%s -> %s", (text, expected) => {
    expect(housingFrom(text)).toBe(expected);
  });

  it("returns null when not mentioned", () => {
    expect(housingFrom("12-week summer internship in Boston.")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Application extras
// ---------------------------------------------------------------------------

describe("applicationExtras", () => {
  it("finds cover letter", () => {
    expect(applicationExtrasFrom("Please submit a cover letter with your application.")).toContain("cover_letter");
  });

  it("finds transcript", () => {
    expect(applicationExtrasFrom("Unofficial transcripts are required.")).toContain("transcript");
  });

  it("finds references", () => {
    expect(applicationExtrasFrom("Provide 3 professional references.")).toContain("references");
  });

  it("finds coding assessment", () => {
    expect(applicationExtrasFrom("Candidates will complete a take-home assignment.")).toContain("coding_assessment");
  });

  it("finds case study", () => {
    expect(applicationExtrasFrom("The interview includes a case interview.")).toContain("case_study");
  });

  it("finds writing sample", () => {
    expect(applicationExtrasFrom("Submit a writing sample with your resume.")).toContain("writing_sample");
  });

  it("returns empty when nothing found", () => {
    expect(applicationExtrasFrom("Apply online through our portal.")).toEqual([]);
    expect(applicationExtrasFrom("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractGlance (integration)
// ---------------------------------------------------------------------------

describe("extractGlance", () => {
  it("combines all fields from a real-looking internship posting", () => {
    const desc = `
      Summer 2027 Research Intern – Oncology

      This is a hybrid position, 3 days in office at our Cambridge, MA location.
      Housing stipend available for qualified candidates relocating for the summer.

      Must be authorized to work in the United States without sponsorship.

      To apply, submit a cover letter and unofficial transcripts along with your resume.
    `;
    const g = extractGlance("Summer 2027 Research Intern", desc);
    expect(g.workModel).toBe("hybrid");
    expect(g.workModelDetail).toBe("3 days in office");
    expect(g.visaSponsorship).toBe("no");
    expect(g.housing).toBe("stipend");
    expect(g.applicationExtras).toContain("cover_letter");
    expect(g.applicationExtras).toContain("transcript");
    expect(g.travel).toBeNull();
    expect(g.clearanceRequired).toBeNull();
  });

  it("handles title-only (no description)", () => {
    const g = extractGlance("Remote Research Associate", undefined);
    expect(g.workModel).toBeNull(); // "remote" in title without "position/role/job" context
    expect(g.visaSponsorship).toBeNull();
  });
});
