import { describe, expect, it } from "vitest";
import { postedTime } from "../lib/sort";

const l = (posted_at: string | null, first_seen_at: string, is_backlog: boolean) => ({ posted_at, first_seen_at, is_backlog });
const t = (iso: string) => new Date(iso).getTime();

describe("postedTime (Newest sort)", () => {
  it("uses the company's posted date, never later than when Primer found it", () => {
    expect(postedTime({ listings: [l("2026-09-20T10:00:00Z", "2026-09-24T12:00:00Z", true)] })).toBe(t("2026-09-20T10:00:00Z"));
    expect(postedTime({ listings: [l("2026-09-25T00:00:00Z", "2026-09-24T12:00:00Z", false)] })).toBe(t("2026-09-24T12:00:00Z"));
  });
  it("new postings without a date: when found; old ones without a date: last", () => {
    expect(postedTime({ listings: [l(null, "2026-09-24T12:00:00Z", false)] })).toBe(t("2026-09-24T12:00:00Z"));
    expect(postedTime({ listings: [l(null, "2026-09-24T12:00:00Z", true)] })).toBe(0);
  });
  it("a company added today doesn't put its month-old jobs above yesterday's new posting", () => {
    const oldFromNewCompany = { listings: [l("2026-08-25T00:00:00Z", "2026-09-24T12:00:00Z", true)] };
    const yesterday = { listings: [l(null, "2026-09-23T15:00:00Z", false)] };
    expect(postedTime(yesterday)).toBeGreaterThan(postedTime(oldFromNewCompany));
  });
  it("a role posted in several cities counts its newest listing", () => {
    expect(postedTime({ listings: [l(null, "2026-09-20T00:00:00Z", true), l("2026-09-22T00:00:00Z", "2026-09-22T01:00:00Z", false)] })).toBe(t("2026-09-22T00:00:00Z"));
  });
});
