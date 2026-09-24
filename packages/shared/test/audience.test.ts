import { describe, expect, it } from "vitest";
import { extractAudience, gradWindow, studentLevels } from "../src/audience.ts";

describe("student levels", () => {
  it.each([
    ["(2028 Bachelor's/Master's graduates) Cyber Consulting Analyst Intern (Summer 2027)", ["undergrad", "masters"]],
    ["PhD Intern, Computational Biology", ["phd"]],
    ["Summer 2027 MBA Intern, Commercial Strategy", ["mba"]],
    ["Research Intern", []],
    ["Senior Scientist Intern Program", []], // "Senior Scientist" isn't the class year
  ])("title: %s", (title, want) => expect(studentLevels(title)).toEqual(want));

  it("reads the 'who can apply' sentence when the title says nothing", () => {
    expect(studentLevels("Research Intern", "Candidates must be currently pursuing a Master's or PhD in Biology. Great team.")).toEqual(["masters", "phd"]);
    expect(studentLevels("R&D Co-op", "Must be enrolled in an undergraduate program in Chemical Engineering.")).toEqual(["undergrad"]);
    expect(studentLevels("R&D Intern", "Join our team of 12 PhD scientists.")).toEqual([]); // not an eligibility sentence
  });
});

describe("graduation window", () => {
  it.each([
    ["(2028 Bachelor's/Master's graduates) Consulting Intern", "2027-12-01", "2028-12-01"],
    ["Class of 2027 New Grad Analyst", "2026-12-01", "2027-12-01"],
    ["Expected graduation between December 2027 and June 2028.", "2027-12-01", "2028-06-01"],
    ["Must be graduating by May 2027", null, "2027-05-01"],
    ["Expected graduation date: Spring 2028", "2028-05-01", "2028-05-01"],
    ["Graduating in May 2028", "2028-05-01", "2028-05-01"],
    ["We graduated 50 fellows in 2019 and 2020.", null, null],
    ["Founded in 2011", null, null],
  ])("%s", (text, from, to) => expect(gradWindow(text)).toEqual({ gradFrom: from, gradTo: to }));
});

describe("extractAudience", () => {
  it("only for internships and new-grad roles", () => {
    expect(extractAudience("Scientist I", "Expected graduation between December 2027 and June 2028.", false)).toEqual({ levels: [], gradFrom: null, gradTo: null });
    expect(extractAudience("New Grad Associate Scientist", "For those graduating by June 2027.", false)).toEqual({ levels: [], gradFrom: null, gradTo: "2027-06-01" });
    expect(extractAudience("(2028 Bachelor's/Master's graduates) Analyst Intern (Summer 2027)", "", true)).toEqual({
      levels: ["undergrad", "masters"],
      gradFrom: "2027-12-01",
      gradTo: "2028-12-01",
    });
  });
});
