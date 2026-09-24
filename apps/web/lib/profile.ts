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
  "software",
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
  /** After graduating: "work" (done with school), "maybe" (maybe grad school), "grad" (going to grad school). */
  after_grad: AfterGrad | null;
  onboarded_at: string | null;
}

export const AFTER_GRAD_OPTIONS = [
  ["work", "Start working", "No more school after I graduate"],
  ["maybe", "Maybe grad school", "Show grad-student internships too, marked as a stretch"],
  ["grad", "Going to grad school", "Master's or PhD right after"],
] as const;
export type AfterGrad = (typeof AFTER_GRAD_OPTIONS)[number][0];

export const PROFILE_COLUMNS =
  "degree, field, grad_month, years_experience, families, include_internships, metro_tiers, hide_contract, after_grad, onboarded_at";

export const DEFAULT_PROFILE: Profile = {
  degree: null,
  field: null,
  grad_month: null,
  years_experience: null,
  families: [...FAMILY_IDS],
  include_internships: true,
  metro_tiers: [1, 2, 3],
  hide_contract: false,
  after_grad: null,
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
    after_grad: AFTER_GRAD_OPTIONS.some(([v]) => v === s("after_grad")) ? (s("after_grad") as AfterGrad) : null,
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
  /** Timing rules you can't get around (it starts after you graduate, or it's for another class year). Hidden from For you. */
  ineligible: boolean;
}

export interface QualifyJob {
  degree_min: string | null;
  experience_min_years: number | null;
  seniority: string;
  employment_type?: string | null;
  term?: string | null;
  start_date?: string | null;
  intern_levels?: string[] | null;
  grad_from?: string | null;
  grad_to?: string | null;
}

const DEGREE_NAME: Record<string, string> = { bs: "a bachelor's", ms: "a master's", phd: "a PhD" };
const TERM_MONTH: Record<string, string> = { Winter: "01", Spring: "01", Summer: "06", Fall: "09" };
const ym = (d: string) => d.slice(0, 7); // "2027-05-01" -> "2027-05"

/** When an internship starts: its start date, else its term ("Summer 2027" -> 2027-06). */
export function internStart(j: Pick<QualifyJob, "start_date" | "term">): string | null {
  if (j.start_date) return ym(j.start_date);
  const m = j.term?.match(/^(Winter|Spring|Summer|Fall) (\d{4})$/);
  return m ? `${m[2]}-${TERM_MONTH[m[1]!]}` : null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/**
 * Compare what the posting asks for with the profile. Only uses what was read from
 * the posting (degree, experience, who it's for, when it starts), so "Likely" means
 * "nothing we could read rules you out", not a promise.
 */
export function qualify(
  p: Pick<Profile, "degree" | "years_experience" | "grad_month"> & Partial<Pick<Profile, "after_grad">>,
  j: QualifyJob,
  now = new Date(),
): QualifyResult | null {
  if (!p.degree && p.years_experience === null) return null; // no profile yet
  const reasons: string[] = [];
  let level: QualifyLevel = "likely";
  let ineligible = false;
  let blocker: string | null = null; // short label for an ineligible job
  const bump = (to: QualifyLevel) => {
    if (to === "unlikely" || (to === "stretch" && level === "likely")) level = to;
  };
  const block = (reason: string, label: string) => {
    reasons.unshift(reason);
    bump("unlikely");
    ineligible = true;
    blocker ??= label;
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

  // Graduation timing. Unknown plans are treated as "maybe grad school" (never hides anything by guessing).
  const plan = p.after_grad ?? "maybe";
  const grad = p.grad_month ? ym(p.grad_month) : null;
  const levels = j.intern_levels ?? [];
  const takesGradStudents = levels.length === 0 || levels.some((l) => l !== "undergrad");
  const isIntern = j.seniority === "intern" || j.employment_type === "intern";

  if (grad && (j.grad_from || j.grad_to)) {
    const from = j.grad_from ? ym(j.grad_from) : null;
    const to = j.grad_to ? ym(j.grad_to) : null;
    const year = (to ?? from)!.slice(0, 4);
    if (to && grad > to) {
      block(`For people graduating by ${monthLabel(j.grad_to!)}; you graduate ${monthLabel(p.grad_month!)}`, `For ${year} grads`);
    } else if (from && grad < from) {
      // You graduate before the class it's for: only works if you're back in school by then.
      if (plan === "work" || !takesGradStudents) block(`For ${year} graduates; you graduate ${monthLabel(p.grad_month!)}`, `For ${year} grads`);
      else {
        reasons.push(`For ${year} graduates: only if you're in grad school then`);
        bump("stretch");
      }
    }
  }

  if (isIntern && grad) {
    const start = internStart(j);
    if (start && start > grad) {
      if (plan === "work") block(`Starts ${monthLabel(start + "-01")}, after you graduate`, "After you graduate");
      else if (!takesGradStudents) block(`Undergrad internship that starts after you graduate`, "After you graduate");
      else if (!ineligible) {
        reasons.push("Starts after you graduate: only if you're in grad school then");
        bump("stretch");
      }
    } else if (start && (p.degree === "bs" || p.degree === "none") && levels.length && !levels.includes("undergrad")) {
      block("For grad students; you'll still be an undergrad", "For grad students");
    } else if (!start && monthsUntil(p.grad_month!, now) < 0) {
      reasons.push("Internships are usually for current students");
      bump("stretch");
    }
  }

  const label = blocker
    ? blocker
    : level === "likely"
      ? "Likely qualify"
      : level === "stretch"
        ? "Stretch"
        : reasons[0]?.startsWith("Asks for a PhD")
          ? "Needs PhD"
          : "Unlikely";
  return { level, label, reasons, ineligible };
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

// ---------------------------------------------------------------------------
// "Where does this fit in my timeline?" (one tag on every card)
// ---------------------------------------------------------------------------

export interface TimelineTag {
  label: string;
  tone: "success" | "brand" | "warning" | "neutral";
}

/**
 * One glance answer, from your graduation month:
 * - full-time: can you start after you graduate?
 * - internship/co-op before you graduate: "During undergrad", plus remote or on-site
 * - internship/co-op after you graduate: only if you go to grad school
 */
export function timelineTag(
  p: Pick<Profile, "grad_month"> & Partial<Pick<Profile, "after_grad">>,
  j: QualifyJob & { remote?: boolean; locations?: string[]; employment_type?: string | null },
): TimelineTag | null {
  if (!p.grad_month) return null;
  const grad = ym(p.grad_month);
  const isIntern = j.seniority === "intern" || j.employment_type === "intern";
  const where = j.remote || j.locations?.some((l) => /remote/i.test(l)) ? "Remote" : "On-site";
  const partTime = j.employment_type === "part_time" ? "Part-time " : "";
  if (!isIntern) {
    const start = j.start_date ? ym(j.start_date) : null;
    if (j.grad_to && ym(j.grad_to) < grad) return { label: "For earlier grads", tone: "neutral" };
    if (start && start < grad) return { label: `Starts ${monthLabel(start + "-01")}, before you graduate`, tone: "warning" };
    return { label: "Full-time · after you graduate", tone: "success" };
  }
  const start = internStart(j);
  if (start && start > grad) {
    return p.after_grad === "work"
      ? { label: "Internship after you graduate", tone: "neutral" }
      : { label: "Grad-school internship", tone: "warning" };
  }
  if (start) return { label: `${partTime}During undergrad · ${where}`, tone: "brand" };
  return { label: `${partTime}Internship · ${where} · timing not stated`, tone: "neutral" };
}
