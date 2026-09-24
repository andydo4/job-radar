import { describe, expect, it } from "vitest";
import { compareByDeadline, countdownLabel, daysUntil, formatDate, todayET, urgencyFor } from "../lib/deadlines";
import { parseProgramForm } from "../lib/programs";

describe("deadlines", () => {
  it("uses US Eastern time for 'today'", () => {
    // 03:30 UTC on Dec 1 is still Nov 30 in New York.
    expect(todayET(new Date("2026-12-01T03:30:00Z"))).toBe("2026-11-30");
    expect(todayET(new Date("2026-12-01T15:00:00Z"))).toBe("2026-12-01");
  });

  it("counts whole days, across months and DST", () => {
    expect(daysUntil("2026-12-01", "2026-09-24")).toBe(68);
    expect(daysUntil("2026-11-02", "2026-10-31")).toBe(2); // DST ends Nov 1
    expect(daysUntil("2026-09-24", "2026-09-24")).toBe(0);
    expect(daysUntil("2026-09-20", "2026-09-24")).toBe(-4);
  });

  it("maps days to urgency: red at 3, amber at 14", () => {
    expect([null, -1, 0, 3, 4, 14, 15].map(urgencyFor)).toEqual(["none", "past", "danger", "danger", "warning", "warning", "ok"]);
  });

  it("labels countdowns", () => {
    expect([null, -2, 0, 1, 23].map(countdownLabel)).toEqual(["No deadline", "Closed", "Due today", "1 day left", "23 days left"]);
  });

  it("formats dates without timezone drift", () => {
    expect(formatDate("2026-12-01")).toBe("Dec 1, 2026");
  });

  it("sorts upcoming first, then no deadline, then past", () => {
    const rows = [
      { id: "past-old", deadline: "2026-09-01" },
      { id: "none", deadline: null },
      { id: "dec15", deadline: "2026-12-15" },
      { id: "past-recent", deadline: "2026-09-20" },
      { id: "dec1", deadline: "2026-12-01" },
    ];
    expect(rows.sort(compareByDeadline("2026-09-24")).map((r) => r.id)).toEqual(["dec1", "dec15", "none", "past-recent", "past-old"]);
  });
});

describe("parseProgramForm", () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ degree: "PhD", gre: "Unknown", status: "Researching", ...o })) f.set(k, v);
    return f;
  };

  it("accepts the minimum (school + program)", () => {
    const r = parseProgramForm(fd({ school: " MIT ", program: "Biology" }));
    expect(r).toMatchObject({ ok: true, data: { school: "MIT", program: "Biology", deadline: null, fee: null, url: null } });
  });

  it("cleans up fee and link", () => {
    const r = parseProgramForm(fd({ school: "MIT", program: "Bio", fee: "$1,05.50", url: "biology.mit.edu/grad" }));
    expect(r.ok && r.data.fee).toBe(105.5);
    expect(r.ok && r.data.url).toBe("https://biology.mit.edu/grad");
  });

  it("reports field errors and echoes the input back", () => {
    const r = parseProgramForm(fd({ school: "", program: "Bio", deadline: "2026-02-30", fee: "abc", degree: "BS" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["deadline", "degree", "fee", "school"]);
      expect(r.values.program).toBe("Bio");
    }
  });

  it("catches an opening date after the deadline", () => {
    const r = parseProgramForm(fd({ school: "A", program: "B", opens_on: "2026-12-10", deadline: "2026-12-01" }));
    expect(!r.ok && r.errors.opens_on).toBeTruthy();
  });
});
