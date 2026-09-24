// Each person's job preferences (set on Welcome, edited in Settings) and the
// "Do I qualify?" check. Pure functions only, so they're unit-tested in test/profile.test.ts.

export const FAMILY_IDS = [
  "research",
  "process",
  "quality",
  "clinical",
  "regulatory",
  "compbio",
  "engineering",
  "commercial",
  "consulting",
  "vc",
] as const;

export const DEGREE_OPTIONS = [
  ["bs", "Bachelor's"],
  ["ms", "Master's"],
  ["phd", "PhD"],
  ["none", "No degree yet"],
] as const;
export type UserDegree = (typeof DEGREE_OPTIONS)[number][0];

export const TIER_OPTIONS = [
  [1, "Boston & New York City"],
  [2, "Rest of the East & West Coast, plus remote"],
  [3, "Everywhere else in the US"],
] as const;

export interface Profile {
  degree: UserDegree | null;
  field: string | null;
  /** First day of the graduation month, "2026-05-01". */
  grad_month: string | null;
  years_experience: number | null;
  families: string[];
  include_internships: boolean;
  metro_tiers: number[];
  hide_contract: boolean;
  onboarded_at: string | null;
}

export const PROFILE_COLUMNS =
  "degree, field, grad_month, years_experience, families, include_internships, metro_tiers, hide_contract, onboarded_at";

export const DEFAULT_PROFILE: Profile = {
  degree: null,
  field: null,
  grad_month: null,
  years_experience: null,
  families: [...FAMILY_IDS],
  include_internships: true,
  metro_tiers: [1, 2, 3],
  hide_contract: false,
  onboarded_at: null,
};

const RANK: Record<string, number> = { none: 0, bs: 1, ms: 2, phd: 3 };
export const degreeRank = (d: string | null | undefined) => (d ? (RANK[d] ?? 0) : 0);

// ---------------------------------------------------------------------------
// Form parsing
// ---------------------------------------------------------------------------

export type ProfileErrors = Partial<Record<"degree" | "field" | "grad_month" | "years_experience" | "families" | "metro_tiers", string>>;

export interface ProfileFormState {
  errors?: ProfileErrors;
  message?: string;
  /** What was submitted, so a failed save doesn't wipe the form. */
  draft?: ProfileInput;
}

export type ProfileInput = Omit<Profile, "onboarded_at">;

export function parseProfileForm(
  fd: FormData,
): { ok: true; data: ProfileInput } | { ok: false; errors: ProfileErrors; draft: ProfileInput } {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const errors: ProfileErrors = {};

  const degree = s("degree");
  if (!DEGREE_OPTIONS.some(([d]) => d === degree)) errors.degree = "Pick your highest degree.";

  const field = s("field");
  if (field.length > 200) errors.field = "Keep it under 200 characters.";

  // <input type="month"> sends "2026-05".
  const gm = s("grad_month");
  let grad_month: string | null = null;
  if (gm) {
    const m = gm.match(/^(\d{4})-(\d{2})$/);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[1]) < 1950 || Number(m[1]) > 2100) errors.grad_month = "Pick a month.";
    else grad_month = `${m[1]}-${m[2]}-01`;
  }

  const ye = s("years_experience");
  let years_experience: number | null = null;
  if (ye) {
    if (!/^\d{1,2}$/.test(ye) || Number(ye) > 50) errors.years_experience = "Pick a number of years.";
    else years_experience = Number(ye);
  }

  const families = fd.getAll("families").filter((v): v is string => typeof v === "string" && (FAMILY_IDS as readonly string[]).includes(v));
  if (families.length === 0) errors.families = "Pick at least one kind of job.";

  const metro_tiers = [...new Set(fd.getAll("metro_tiers").map(Number))].filter((n) => n === 1 || n === 2 || n === 3).sort();
  if (metro_tiers.length === 0) errors.metro_tiers = "Pick at least one area.";

  const data: ProfileInput = {
    degree: errors.degree ? null : (degree as UserDegree),
    field: field || null,
    grad_month,
    years_experience,
    families: [...new Set(families)],
    include_internships: fd.get("include_internships") === "on",
    metro_tiers,
    hide_contract: fd.get("hide_contract") === "on",
  };
  if (Object.keys(errors).length) return { ok: false, errors, draft: data };
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// "Do I qualify?"
// ---------------------------------------------------------------------------

export type QualifyLevel = "likely" | "stretch" | "unlikely";

export interface QualifyResult {
  level: QualifyLevel;
  label: string;
  /** Why, in plain words, for the tooltip / details. Empty when nothing stands in the way. */
  reasons: string[];
}

export interface QualifyJob {
  degree_min: string | null;
  experience_min_years: number | null;
  seniority: string;
}

const DEGREE_NAME: Record<string, string> = { bs: "a bachelor's", ms: "a master's", phd: "a PhD" };

/**
 * Compare what the posting asks for with the profile. Only uses what was read from
 * the posting (degree, years of experience), so "Likely" means "nothing we could read
 * rules you out", not a promise.
 */
export function qualify(p: Pick<Profile, "degree" | "years_experience" | "grad_month">, j: QualifyJob, now = new Date()): QualifyResult | null {
  if (!p.degree && p.years_experience === null) return null; // no profile yet
  const reasons: string[] = [];
  let level: QualifyLevel = "likely";
  const bump = (to: QualifyLevel) => {
    if (to === "unlikely" || (to === "stretch" && level === "likely")) level = to;
  };

  // Degree ("degree" is the highest one you have or are finishing).
  const need = degreeRank(j.degree_min);
  const have = degreeRank(p.degree);
  if (need > have) {
    if (j.degree_min === "phd") {
      reasons.push("Asks for a PhD");
      bump("unlikely");
    } else {
      reasons.push(`Asks for ${DEGREE_NAME[j.degree_min!] ?? "a higher degree"}`);
      bump(need - have >= 2 ? "unlikely" : "stretch");
    }
  }

  // Experience. Advanced degrees often count toward "years of experience" in biotech postings.
  if (j.experience_min_years !== null && p.years_experience !== null) {
    const credit = have >= 3 ? 2 : have === 2 ? 1 : 0;
    const effective = p.years_experience + credit;
    const short = j.experience_min_years - effective;
    if (short > 0) {
      reasons.push(`Asks for ${j.experience_min_years}+ yrs experience`);
      bump(short <= 1 ? "stretch" : "unlikely");
    }
  }

  // Internships are usually for current students.
  if (j.seniority === "intern" && p.grad_month && monthsUntil(p.grad_month, now) < 0) {
    reasons.push("Internships are usually for current students");
    bump("stretch");
  }

  const label = level === "likely" ? "Likely qualify" : level === "stretch" ? "Stretch" : reasons[0]?.startsWith("Asks for a PhD") ? "Needs PhD" : "Unlikely";
  return { level, label, reasons };
}

/** Whole months from now until the given "YYYY-MM-DD" (negative = in the past). */
export function monthsUntil(ymd: string, now = new Date()): number {
  const [y, m] = ymd.split("-").map(Number);
  return (y! - now.getUTCFullYear()) * 12 + (m! - 1 - now.getUTCMonth());
}

// ---------------------------------------------------------------------------
// "For you" filter: which jobs the profile hides outright
// ---------------------------------------------------------------------------

/**
 * Degrees a posting may ask for and still show under For you: yours, or one step up
 * (shown as a Stretch). PhD-only roles show only if you have or are finishing a PhD.
 */
export function allowedDegrees(degree: UserDegree | null): string[] {
  const have = degreeRank(degree);
  return ["bs", "ms", "phd"].filter((d) => (d === "phd" ? have >= 3 : degreeRank(d) <= have + 1));
}

/** Max years a posting may ask for and still show under For you (null = no limit). */
export function maxExperience(years: number | null, degree: UserDegree | null): number | null {
  if (years === null) return null;
  const credit = degreeRank(degree) >= 3 ? 2 : degreeRank(degree) === 2 ? 1 : 0;
  return years + credit + 1;
}
