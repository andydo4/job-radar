import { describe, expect, it } from "vitest";
import {
  employmentTypeFrom,
  experienceFromText,
  extractDetails,
  formatSalary,
  listItemsFromHtml,
  requirementsFromText,
  salaryFromText,
} from "../src/details.ts";

describe("salary", () => {
  it.each([
    ["The base salary range for this role is $92,000—$126,000 USD.", { min: 92000, max: 126000, period: "year" }],
    ["Pay range: $85K - $110K annually", { min: 85000, max: 110000, period: "year" }],
    ["Hourly rate: $28.50 - $32.00 per hour", { min: 28.5, max: 32, period: "hour" }],
    ["The expected pay is $30 to $38/hr depending on experience", { min: 30, max: 38, period: "hour" }],
    ["This intern role pays $25 per hour.", { min: 25, max: 25, period: "hour" }],
    [
      "Boston: $100,000 - $130,000. San Diego: $95,000 - $125,000. Remote: $90,000 - $120,000.",
      { min: 90000, max: 130000, period: "year" },
    ],
  ])("%s", (text, expected) => {
    expect(salaryFromText(text)).toMatchObject(expected);
  });

  it("ignores non-pay dollar amounts and nonsense", () => {
    expect(salaryFromText("We raised $400 - $500 million in Series C funding.")).toBeNull(); // not plausible: max 500 "hour"? no, 400-500 hourly is out of range
    expect(salaryFromText("No pay info here.")).toBeNull();
    expect(salaryFromText(undefined)).toBeNull();
  });

  it("formats compactly", () => {
    expect(formatSalary({ min: 92000, max: 126000, period: "year" })).toBe("$92K–$126K / yr");
    expect(formatSalary({ min: 28.5, max: 32, period: "hour" })).toBe("$28.50–$32 / hr");
    expect(formatSalary({ min: 25, max: 25, period: "hour" })).toBe("$25 / hr");
  });
});

describe("experience", () => {
  it.each([
    ["BS with 2+ years of relevant industry experience", 2],
    ["Bachelor's degree and 0-2 years of laboratory experience", 0],
    ["BS/BA with 3 years experience, or MS with 1 year of experience", 1],
    ["5+ yrs of hands-on experience in cell culture", 5],
    ["Minimum of 2 years’ experience in a GMP environment", 2],
    ["We have been around for 10 years. Great benefits.", null],
    ["", null],
  ])("%s -> %s", (text, expected) => {
    expect(experienceFromText(text)).toBe(expected);
  });
});

describe("employment type", () => {
  it.each([
    ["Research Associate II (Contract)", undefined, "contract"],
    ["Summer 2027 Intern, Process Development", undefined, "intern"],
    ["Associate Scientist", "Full-time", "full_time"],
    ["Associate Scientist", "FullTime", "full_time"],
    ["Associate Scientist", "Full time", "full_time"],
    ["Associate Scientist", "Part time", "part_time"],
    ["Associate Scientist", undefined, null],
  ])("%s / %s -> %s", (title, hint, expected) => {
    expect(employmentTypeFrom(title, hint)).toBe(expected);
  });
});

describe("requirements", () => {
  const greenhouseStyle = `About the role
We are hiring an Associate Scientist to join our protein team.
What you'll do:
- Run assays
- Analyze data
Qualifications
- BS or MS in Biology, Biochemistry, or related field
- 0-2 years of industry laboratory experience
- Hands-on experience with ELISA and cell culture
Preferred Qualifications
- Experience with automation
Benefits
- Great health insurance`;

  it("takes the bullets under the qualifications heading, stops at the next section", () => {
    expect(requirementsFromText(greenhouseStyle)).toEqual([
      "BS or MS in Biology, Biochemistry, or related field",
      "0-2 years of industry laboratory experience",
      "Hands-on experience with ELISA and cell culture",
    ]);
  });

  it("handles • bullets and 'What you'll need' headings", () => {
    const t = "What You'll Need\n• PhD in Chemistry\n• Strong communication skills\nWhat we offer\n• Equity";
    expect(requirementsFromText(t)).toEqual(["PhD in Chemistry", "Strong communication skills"]);
  });

  it("returns nothing when there is no requirements section", () => {
    expect(requirementsFromText("Join us! We make medicines.")).toEqual([]);
  });

  it("reads Lever list HTML", () => {
    expect(listItemsFromHtml("<ul><li>BS in Biology</li><li>2+ years of <b>cell culture</b> experience</li></ul>")).toEqual([
      "BS in Biology",
      "2+ years of cell culture experience",
    ]);
  });
});

describe("extractDetails", () => {
  it("prefers structured salary and list requirements when the ATS gives them", () => {
    const d = extractDetails("Associate Scientist", "Pay: $50,000 - $60,000", {
      salary: { min: 90000, max: 110000, currency: "USD", period: "year" },
      employmentTypeText: "Full-time",
      requirementLists: [["BS in Biology", "1+ years of lab experience"]],
    });
    expect(d).toEqual({
      salary: { min: 90000, max: 110000, currency: "USD", period: "year" },
      employmentType: "full_time",
      experienceMinYears: 1, // read from the description and the ATS requirement list together
      requirements: ["BS in Biology", "1+ years of lab experience"],
    });
  });
});
