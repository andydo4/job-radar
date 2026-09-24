import { describe, expect, it } from "vitest";
import { deadlineFrom, durationFrom, extractTiming, postedAtFromText, termFrom } from "../src/dates.ts";

const SEEN = new Date("2026-09-23T12:00:00Z");

describe("term", () => {
  it.each([
    ["Research Intern, Summer 2027", "Summer 2027"],
    ["Co-op - Fall '26 (Process Development)", "Fall 2026"],
    ["2027 Summer Internship – Clinical Operations", "Summer 2027"],
    ["Autumn 2026 Co-op", "Fall 2026"],
    ["Scientist I", null],
    ["Summer Intern", null], // no year: left to the dates / description
  ])("%s", (title, want) => expect(termFrom(title)).toBe(want));
});

describe("dates, duration, deadline", () => {
  it("internship with a full range and a deadline", () => {
    const t = extractTiming(
      "Summer 2027 Intern, Analytical Development",
      "Our 12-week summer internship runs from May 26 – August 15, 2027.\nApplication deadline: October 15, 2026.",
      SEEN,
    );
    expect(t).toEqual({
      term: "Summer 2027",
      startDate: "2027-05-26",
      endDate: "2027-08-15",
      datesLabel: "May 26 – Aug 15, 2027",
      durationText: "12 weeks",
      deadline: "2026-10-15",
    });
  });

  it("co-op with months only: works out the length", () => {
    const t = extractTiming("Co-op, Process Development", "This co-op runs January - June 2027 in Cambridge, MA.", SEEN);
    expect(t).toMatchObject({ startDate: "2027-01-01", endDate: "2027-06-30", datesLabel: "Jan – Jun 2027", durationText: "6 months" });
  });

  it("range crossing a year, with the year only on the end", () => {
    const t = extractTiming("Fall Co-op", "The co-op session dates are July – December 2026.", SEEN);
    expect(t).toMatchObject({ datesLabel: "Jul – Dec 2026", durationText: "6 months" });
    const x = extractTiming("Co-op", "Program dates: Sept 2026 – Jan 2027", SEEN);
    expect(x).toMatchObject({ startDate: "2026-09-01", endDate: "2027-01-31", datesLabel: "Sep 2026 – Jan 2027" });
  });

  it("start date on its own", () => {
    expect(extractTiming("Research Associate I", "Anticipated start date: June 1, 2027.", SEEN)).toMatchObject({ startDate: "2027-06-01", datesLabel: "Jun 1, 2027", endDate: null });
    expect(extractTiming("RA", "Candidates must be available to start in January 2027.", SEEN)).toMatchObject({ datesLabel: "Jan 2027" });
    expect(extractTiming("RA", "Start date: 01/11/2027", SEEN)).toMatchObject({ startDate: "2027-01-11" });
    // No year written: the next January after we saw it.
    expect(extractTiming("RA", "Expected start date is January 2027 or sooner. Start in March", SEEN).startDate).toBe("2027-01-01");
    expect(extractTiming("RA", "The program starts in March.", SEEN).startDate).toBe("2027-03-01");
  });

  it("ignores 'may' the word and ranges with no job context", () => {
    const t = extractTiming("Scientist", "You may to some degree travel. Our offices are closed December 24 - January 2 each year.", SEEN);
    expect(t.datesLabel).toBeNull();
    expect(extractTiming("Scientist", "Responsibilities may include assays. Hours: Monday - Friday.", SEEN).datesLabel).toBeNull();
  });

  it.each([
    ["This is a 10-12 week paid internship.", "10–12 weeks"],
    ["A 6-month co-op based in Boston.", "6 months"],
    ["Duration: 12 weeks", "12 weeks"],
    ["This contract role will last approximately 9 months.", "9 months"],
    ["Requires 3 months of experience.", null],
    ["Benefits start within 30 days.", null],
  ])("duration: %s", (text, want) => expect(durationFrom(text)).toBe(want));

  it.each([
    ["Application deadline: October 15, 2026", "2026-10-15"],
    ["Please apply by Nov 1.", "2026-11-01"],
    ["Applications close on Friday, December 5th", "2026-12-05"],
    ["We are accepting applications until 1/31/2027.", "2027-01-31"],
    ["This posting will close on 2026-10-01", "2026-10-01"],
    ["Deadline to apply: January 9", "2027-01-09"], // no year and already past this year -> next January
    ["Founded in March 2011, we raised $50M.", null],
    ["Application deadline: October 15, 2019", null], // stale template text
  ])("deadline: %s", (text, want) => expect(deadlineFrom(text, SEEN)).toBe(want));
});

describe("Workday posted text", () => {
  it.each([
    ["Posted Today", "2026-09-23T12:00:00.000Z"],
    ["Posted Yesterday", "2026-09-22T12:00:00.000Z"],
    ["Posted 3 Days Ago", "2026-09-20T12:00:00.000Z"],
    ["Posted 30+ Days Ago", null],
    [null, null],
  ])("%s", (text, want) => expect(postedAtFromText(text, SEEN)).toBe(want));
});
