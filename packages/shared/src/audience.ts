/**
 * Who a posting is for, read with pattern rules (no AI):
 * - levels: which students an internship takes ("undergrad", "masters", "phd", "mba")
 * - gradFrom / gradTo: the graduation window it targets ("2028 graduates", "Class of 2028",
 *   "expected graduation between December 2027 and June 2028", "graduating by May 2027")
 * Anything unclear stays empty, and the website then doesn't judge on it.
 */

export type StudentLevel = "undergrad" | "masters" | "phd" | "mba";

export interface Audience {
  levels: StudentLevel[];
  /** First day of the earliest graduation month the posting accepts, "YYYY-MM-01". */
  gradFrom: string | null;
  /** First day of the latest graduation month the posting accepts. */
  gradTo: string | null;
}

const MONTH = String.raw`(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Spring|Summer|Fall|Autumn|Winter)\.?\s+)?`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SEASON_MONTH: Record<string, number> = { spring: 4, summer: 7, fall: 11, autumn: 11, winter: 0 };

const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;

function monthOf(word: string | undefined, fallback: number): number {
  if (!word) return fallback;
  const w = word.toLowerCase();
  if (w in SEASON_MONTH) return SEASON_MONTH[w]!;
  const i = MONTHS.indexOf(w.slice(0, 3));
  return i >= 0 ? i : fallback;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function levelsIn(text: string): StudentLevel[] {
  const out = new Set<StudentLevel>();
  if (/\b(under ?grad\w*|bachelor'?s?|b\.?s\.?(?=[\s/,)])|b\.?a\.?(?=[\s/,)])|rising (sophomore|junior|senior)s?|sophomores?|juniors?|seniors?|college students?)\b/i.test(text)) out.add("undergrad");
  if (/\b(master'?s|m\.?s\.?(?=[\s/,)])|m\.?eng|graduate students?|grad students?)\b/i.test(text)) out.add("masters");
  if (/\b(ph\.?\s?d\.?|doctoral|doctorate|graduate students?|grad students?)\b/i.test(text)) out.add("phd");
  if (/\bmba\b/i.test(text)) out.add("mba");
  return [...out];
}

/**
 * Levels from the title (most reliable: "PhD Intern", "Bachelor's/Master's graduates"),
 * else from the sentence saying who can apply ("currently pursuing a Bachelor's or Master's ...").
 */
export function studentLevels(title: string, description?: string): StudentLevel[] {
  const fromTitle = levelsIn(title.replace(/\bseniors?\s+(scientist|associate|analyst|engineer)/gi, ""));
  if (fromTitle.length) return fromTitle;
  if (!description) return [];
  const found = new Set<StudentLevel>();
  for (const m of description.matchAll(
    /(?:currently\s+)?(?:pursuing|enrolled(?:\s+(?:in|as))?|working toward|candidates? for|must be (?:a )?(?:current|full[- ]time)?\s*student|open to|eligible)[^.\n]{0,160}/gi,
  )) {
    for (const l of levelsIn(m[0])) found.add(l);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Graduation window
// ---------------------------------------------------------------------------

const YEAR = String.raw`(20\d{2})`;

export function gradWindow(text: string): { gradFrom: string | null; gradTo: string | null } {
  // "between December 2027 and June 2028", "from Dec 2027 to Aug 2028" (near "graduat")
  const range = new RegExp(
    String.raw`graduat\w*[^.\n]{0,60}?(?:between|from)\s+${MONTH}${YEAR}\s*(?:and|to|-|–|—|through)\s*${MONTH}${YEAR}`,
    "i",
  ).exec(text);
  if (range) {
    const [, m1, y1, m2, y2] = range;
    return { gradFrom: ym(Number(y1), monthOf(m1, 0)), gradTo: ym(Number(y2), monthOf(m2, 11)) };
  }
  // "(2028 Bachelor's/Master's graduates)", "2027 grads", "Class of 2028"
  const cohort = /\b(?:class of\s+(20\d{2})|(20\d{2})\s+(?:[a-z'’\/&\s]{0,40}?)?(?:grad(?:uate)?s|graduating class))\b/i.exec(text);
  if (cohort) {
    const y = Number(cohort[1] ?? cohort[2]);
    return { gradFrom: ym(y - 1, 11), gradTo: ym(y, 11) }; // a "2028 grad" finishes Dec 2027 - Dec 2028
  }
  // "graduating by May 2027", "graduation date no later than June 2027"
  const by = new RegExp(String.raw`graduat\w*[^.\n]{0,40}?(?:by|before|no later than|prior to)\s+${MONTH}${YEAR}`, "i").exec(text);
  if (by) return { gradFrom: null, gradTo: ym(Number(by[2]), monthOf(by[1], 11)) };
  // "expected graduation (date) in/of May 2028", "graduating in Spring 2028", "graduation date of 2028"
  const single = new RegExp(String.raw`(?:expected\s+)?graduat\w*(?:\s+date)?\s*(?:in|of|is|:)?\s*${MONTH}${YEAR}`, "i").exec(text);
  if (single) {
    const y = Number(single[2]);
    return single[1] ? { gradFrom: ym(y, monthOf(single[1], 0)), gradTo: ym(y, monthOf(single[1], 11)) } : { gradFrom: ym(y - 1, 11), gradTo: ym(y, 11) };
  }
  return { gradFrom: null, gradTo: null };
}

/** Title first (e.g. "(2028 graduates)"), then the description. Only for student / new-grad postings. */
export function extractAudience(title: string, description: string | undefined, isStudentRole: boolean): Audience {
  const newGrad = /\b(new grad\w*|recent grad\w*|university grad\w*|early career|entry[- ]level|graduate program|20\d{2}\s+grad)/i.test(title);
  if (!isStudentRole && !newGrad) return { levels: [], gradFrom: null, gradTo: null };
  const fromTitle = gradWindow(title);
  const window = fromTitle.gradFrom || fromTitle.gradTo ? fromTitle : gradWindow(description ?? "");
  return { levels: isStudentRole ? studentLevels(title, description) : [], ...window };
}
