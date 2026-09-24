/**
 * Pull the facts people actually decide on out of a posting: pay, years of experience,
 * job type and the requirement bullets. Structured ATS fields win (Lever salaryRange,
 * Ashby compensation); otherwise we read the description text.
 */

export type SalaryPeriod = "year" | "hour";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern" | "temporary";

export interface Salary {
  min: number;
  max: number;
  currency: string;
  period: SalaryPeriod;
}

export interface JobDetails {
  salary: Salary | null;
  employmentType: EmploymentType | null;
  /** Smallest "N years of experience" mentioned (lenient: if any path needs 0-2, that's 0). */
  experienceMinYears: number | null;
  /** Up to 8 requirement / qualification bullets. */
  requirements: string[];
}

/** Structured hints some ATSs give us (set by the adapters). */
export interface DetailHints {
  salary?: Salary | null;
  employmentTypeText?: string;
  requirementLists?: string[][];
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kK])?`;
const RANGE_RE = new RegExp(
  String.raw`\$\s?${NUM}\s*(?:USD|usd)?\s*(?:[-–—]|to|and)\s*\$?\s?${NUM}(?:\s*(?:USD|usd))?(\s*(?:/|per|an|a)\s*(?:hour|hr|year|yr|annum|annually))?`,
  "g",
);
const SINGLE_HOURLY_RE = new RegExp(String.raw`\$\s?${NUM}\s*(?:/|per|an)\s*(?:hour|hr)\b`, "gi");

function toNumber(raw: string, k: string | undefined): number {
  const n = Number(raw.replace(/,/g, ""));
  return k ? n * 1000 : n;
}

function plausible(s: Salary): boolean {
  if (s.min <= 0 || s.max < s.min) return false;
  if (s.period === "year") return s.min >= 15_000 && s.max <= 1_500_000;
  return s.min >= 7 && s.max <= 500;
}

/** All pay ranges in the text, merged into one overall range per period (annual preferred). */
export function salaryFromText(text: string | undefined): Salary | null {
  if (!text) return null;
  const found: Salary[] = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const min = toNumber(m[1]!, m[2]);
    const max = toNumber(m[3]!, m[4]);
    const tail = (m[5] ?? "") + text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    if (/^\s*(?:million|billion|[mb]n?\b)/i.test(text.slice(m.index! + m[0].length))) continue; // funding, not pay
    const period: SalaryPeriod = /hour|hr\b|hourly/i.test(tail) || max < 500 ? "hour" : "year";
    const s = { min, max, currency: "USD", period };
    if (plausible(s)) found.push(s);
  }
  if (!found.length) {
    for (const m of text.matchAll(SINGLE_HOURLY_RE)) {
      const v = toNumber(m[1]!, m[2]);
      const s: Salary = { min: v, max: v, currency: "USD", period: "hour" };
      if (plausible(s)) found.push(s);
    }
  }
  if (!found.length) return null;
  const period: SalaryPeriod = found.some((s) => s.period === "year") ? "year" : "hour";
  const same = found.filter((s) => s.period === period);
  return {
    min: Math.min(...same.map((s) => s.min)),
    max: Math.max(...same.map((s) => s.max)),
    currency: "USD",
    period,
  };
}

// ---------------------------------------------------------------------------
// Employment type
// ---------------------------------------------------------------------------

export function employmentTypeFrom(title: string, hint?: string): EmploymentType | null {
  const t = title.toLowerCase();
  if (/\b(intern|internship|co-?op)\b/.test(t)) return "intern";
  if (/\b(contract|contractor|consultant \(contract\)|temp to perm)\b/.test(t)) return "contract";
  if (/\b(temporary|temp)\b/.test(t)) return "temporary";
  const h = (hint ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (!h) return null;
  if (h.includes("intern")) return "intern";
  if (h.includes("contract")) return "contract";
  if (h.includes("temp")) return "temporary";
  if (h.includes("parttime")) return "part_time";
  if (h.includes("fulltime") || h === "regular" || h === "permanent") return "full_time";
  return null;
}

// ---------------------------------------------------------------------------
// Years of experience
// ---------------------------------------------------------------------------

const EXP_RE =
  /(\d{1,2})\s*(?:\+|or more|plus)?\s*(?:(?:-|–|—|to)\s*(\d{1,2})\s*\+?)?\s*(?:years?|yrs?)(?:['’]s?)?\s+(?:of\s+)?(?:[a-z/&,-]+\s+){0,4}?(?:experience|exp\b)/gi;

export function experienceFromText(text: string | undefined): number | null {
  if (!text) return null;
  let min: number | null = null;
  for (const m of text.matchAll(EXP_RE)) {
    const n = Number(m[1]);
    if (n > 25) continue;
    min = min === null ? n : Math.min(min, n);
  }
  return min;
}

// ---------------------------------------------------------------------------
// Requirement bullets
// ---------------------------------------------------------------------------

const REQ_HEADING =
  /^(?:#+\s*)?(?:basic |minimum |required |key |your |preferred and )?(?:requirements?|qualifications?|what you(?:'|’| wi)ll (?:need|bring)|what (?:we're|we are) looking for|who you are|you (?:have|bring|might be a fit)|about you|skills (?:and|&) experience|required (?:skills|experience)|what you need|must haves?)\b/i;
const OTHER_HEADING =
  /^(?:#+\s*)?(?:preferred|nice to have|bonus|responsibilities|what you(?:'|’| wi)ll do|the role|about (?:us|the)|benefits|what we offer|perks|compensation|pay|salary|why join|our values|equal opportunity|eeo|location|how to apply)\b/i;
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)])\s+/;

function cleanBullet(line: string): string {
  const s = line.replace(BULLET, "").replace(/\s+/g, " ").trim();
  return s.length > 220 ? `${s.slice(0, 217).trimEnd()}…` : s;
}

/** Bullets under the first "Requirements / Qualifications / What you'll need" heading. */
export function requirementsFromText(text: string | undefined, max = 8): string[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => !BULLET.test(l) && l.length <= 90 && REQ_HEADING.test(l.replace(/[:.]$/, "")));
  if (start < 0) return [];
  const out: string[] = [];
  // Bullet mode: once the section starts with bullets, the first non-bullet line ends it.
  // Plain mode: some sites use one short paragraph per requirement, no bullet characters.
  let mode: "bullet" | "plain" | null = null;
  for (const line of lines.slice(start + 1)) {
    const isBullet = BULLET.test(line);
    const looksLikeHeading = !isBullet && line.length <= 90 && (OTHER_HEADING.test(line) || /:$/.test(line));
    if (looksLikeHeading) {
      if (out.length) break;
      continue;
    }
    mode ??= isBullet ? "bullet" : "plain";
    if (mode === "bullet" && !isBullet) break;
    if (mode === "plain" && (isBullet || line.length >= 300 || /[.!?]\s+\S+.*[.!?]\s+\S+/.test(line))) break;
    const cleaned = cleanBullet(line);
    if (cleaned.length >= 8) out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

/** Lever-style lists: [{ text: "Requirements", content: "<li>…</li>" }] -> bullet strings. */
export function listItemsFromHtml(html: string): string[] {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
  );
  return items.filter((s) => s.length >= 8).map((s) => (s.length > 220 ? `${s.slice(0, 217).trimEnd()}…` : s));
}

// ---------------------------------------------------------------------------

export function extractDetails(title: string, description: string | undefined, hints: DetailHints = {}): JobDetails {
  const structured = hints.salary && plausible(hints.salary) ? hints.salary : null;
  const fromLists = (hints.requirementLists ?? []).flat();
  return {
    salary: structured ?? salaryFromText(description),
    employmentType: employmentTypeFrom(title, hints.employmentTypeText),
    experienceMinYears: experienceFromText([description ?? "", ...fromLists].join("\n")),
    requirements: fromLists.length ? fromLists.slice(0, 8) : requirementsFromText(description),
  };
}

/** "$85K–$110K / yr", "$28–$32 / hr" */
export function formatSalary(s: { min: number; max: number; period: SalaryPeriod }): string {
  const f = (n: number) =>
    s.period === "year" ? `$${Math.round(n / 1000)}K` : `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const range = s.min === s.max ? f(s.min) : `${f(s.min)}–${f(s.max)}`;
  return `${range} / ${s.period === "year" ? "yr" : "hr"}`;
}
