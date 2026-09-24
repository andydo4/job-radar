/**
 * When a job happens, read from the posting with plain pattern rules (no AI):
 * - term:      "Summer 2027", "Fall 2026" (internships / co-ops)
 * - dates:     "May 26 – Aug 15, 2027", or just a start ("Jun 2027")
 * - duration:  "12 weeks", "10–12 weeks", "6 months" (stated, or worked out from the dates)
 * - deadline:  "Apply by October 15" -> 2026-10-15
 * - posted:    Workday's "Posted 3 Days Ago" -> a real date
 * Anything we can't read confidently stays null.
 */

export interface Timing {
  term: string | null;
  /** YYYY-MM-DD (first of the month when only the month is known). */
  startDate: string | null;
  endDate: string | null;
  /** Human label for the dates, e.g. "May 26 – Aug 15, 2027" or "Jun 2027". */
  datesLabel: string | null;
  durationText: string | null;
  /** YYYY-MM-DD */
  deadline: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON = String.raw`(?<![a-z])(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?![a-z])`;
const DAY = String.raw`(?:\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?)?`;
const YEAR = String.raw`(?:,?\s*(20\d{2}))?`;

const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());
/** "may" and "march" are also ordinary words; only trust them capitalized. */
const realMonth = (m: string) => !/^(may|march)$/.test(m);

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const validDay = (y: number, m: number, d: number) => d >= 1 && d <= new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** A month/day with no year: the next one on or after `from` (minus some slack). */
function inferYear(m: number, d: number, from: Date, slackDays: number): number {
  const y = from.getUTCFullYear();
  const t = Date.UTC(y, m, d);
  return t < from.getTime() - slackDays * 86_400_000 ? y + 1 : y;
}

// ---------------------------------------------------------------------------
// Term: "Summer 2027", "Fall '26", "2027 Summer"
// ---------------------------------------------------------------------------

const SEASON = String.raw`(Summer|Fall|Autumn|Winter|Spring)`;
const TERM_RE = new RegExp(String.raw`\b${SEASON}\s*(?:of\s+|semester\s+|term\s+|session\s+)?(?:(20\d{2})|['’](\d{2}))\b|\b(20\d{2})\s+${SEASON}\b`, "i");

export function termFrom(text: string): string | null {
  const m = text.match(TERM_RE);
  if (!m) return null;
  const season = (m[1] ?? m[5])!;
  const year = m[2] ?? (m[3] ? `20${m[3]}` : m[4]);
  const s = season.toLowerCase() === "autumn" ? "Fall" : season[0]!.toUpperCase() + season.slice(1).toLowerCase();
  return `${s} ${year}`;
}

// ---------------------------------------------------------------------------
// Date ranges: "May 26 – August 15, 2027", "January - June 2027", "Jun 2027 to Dec 2027"
// ---------------------------------------------------------------------------

const RANGE_RE = new RegExp(String.raw`${MON}${DAY}${YEAR}\s*(?:-|–|—|to|through|thru|until)\s*${MON}${DAY}${YEAR}`, "gi");
const CONTEXT_RE = /\b(intern(?:ship)?s?|co-?op|program|session|assignment|term|duration|dates?|summer|fall|spring|winter|semester|rotation|runs?|from|start)\b/i;

interface Range {
  start: { y: number; m: number; d: number | null };
  end: { y: number; m: number; d: number | null };
}

function rangeFrom(text: string, seen: Date, termYear: number | null): Range | null {
  for (const m of text.matchAll(RANGE_RE)) {
    const [, m1, d1, y1, m2, d2, y2] = m;
    if (!realMonth(m1!) || !realMonth(m2!)) continue;
    const around = text.slice(Math.max(0, m.index! - 150), m.index! + m[0].length + 60);
    if (!CONTEXT_RE.test(around)) continue;
    const sm = monthIndex(m1!);
    const em = monthIndex(m2!);
    if (sm < 0 || em < 0) continue;
    const nearbyYear = around.match(/\b(20\d{2})\b/)?.[1];
    let ey = y2 ? Number(y2) : y1 ? Number(y1) + (em < sm ? 1 : 0) : nearbyYear ? Number(nearbyYear) : termYear;
    let sy = y1 ? Number(y1) : ey !== null ? ey - (em < sm ? 1 : 0) : null;
    if (sy === null || ey === null) {
      sy = inferYear(sm, d1 ? Number(d1) : 1, seen, 60);
      ey = sy + (em < sm ? 1 : 0);
    }
    const sd = d1 ? Number(d1) : null;
    const ed = d2 ? Number(d2) : null;
    if ((sd !== null && !validDay(sy, sm, sd)) || (ed !== null && !validDay(ey, em, ed))) continue;
    const months = (ey - sy) * 12 + (em - sm);
    if (months < 0 || months > 24) continue; // not a plausible job/internship period
    return { start: { y: sy, m: sm, d: sd }, end: { y: ey, m: em, d: ed } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Start date alone: "Start date: June 1, 2027", "starting in January 2027", "06/01/2027"
// ---------------------------------------------------------------------------

const START_LEAD = String.raw`(?:start(?:ing)?\s+date|anticipated\s+start|expected\s+start|target\s+start|start(?:s|ing)?|begin(?:s|ning)?|commenc(?:es|ing|ement)|available\s+to\s+start)(?:\s+(?:date|in|on|of|is|around|by|no\s+later\s+than))*\s*:?\s*(?:early|mid|late|mid-)?\s*`;
const START_RE = new RegExp(String.raw`${START_LEAD}${MON}${DAY}${YEAR}`, "gi");
const START_NUMERIC_RE = new RegExp(String.raw`${START_LEAD}(\d{1,2})/(\d{1,2})/(20\d{2}|\d{2})\b|${START_LEAD}(20\d{2})-(\d{2})-(\d{2})\b`, "i");

function startFrom(text: string, seen: Date, termYear: number | null): { y: number; m: number; d: number | null } | null {
  for (const m of text.matchAll(START_RE)) {
    const [, mon, d, y] = m;
    if (!realMonth(mon!)) continue;
    const mi = monthIndex(mon!);
    const day = d ? Number(d) : null;
    const year = y ? Number(y) : (termYear ?? inferYear(mi, day ?? 1, seen, 60));
    if (day !== null && !validDay(year, mi, day)) continue;
    return { y: year, m: mi, d: day };
  }
  const n = text.match(START_NUMERIC_RE);
  if (n) {
    const [y, mo, d] = n[1] ? [Number(n[3]!.length === 2 ? `20${n[3]}` : n[3]), Number(n[1]) - 1, Number(n[2])] : [Number(n[4]), Number(n[5]) - 1, Number(n[6])];
    if (mo >= 0 && mo < 12 && validDay(y, mo, d)) return { y, m: mo, d };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Duration: "12-week internship", "10-12 week program", "6-month co-op", "Duration: 6 months"
// ---------------------------------------------------------------------------

const DUR_AFTER_RE =
  /\b(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?[\s-]*(week|wk|month)s?[\s-]+(?:long\s+|paid\s+|full[\s-]time\s+|summer\s+|fall\s+|spring\s+|winter\s+)*(?:intern(?:ship)?|co-?op|program|assignment|contract|rotation|session|position|role|appointment|engagement|fellowship)\b/i;
const DUR_BEFORE_RE =
  /\b(?:duration|length|lasting|last(?:s)?|for\s+(?:a\s+period\s+of\s+)?|runs?\s+for)\s*(?:of\s+)?:?\s*(?:approximately\s+|about\s+|up\s+to\s+|roughly\s+|~)?(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*(weeks?|months?)\b/i;

export function durationFrom(text: string): string | null {
  const m = text.match(DUR_AFTER_RE) ?? text.match(DUR_BEFORE_RE);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : null;
  const unit = m[3]!.toLowerCase().startsWith("w") ? "week" : "month";
  const max = unit === "week" ? 60 : 24;
  if (a < 1 || a > max || (b !== null && (b <= a || b > max))) return null;
  const hi = b ?? a;
  return `${b !== null ? `${a}–${b}` : a} ${unit}${hi === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Deadline: "Application deadline: October 15, 2026", "apply by 10/15/2026", "applications close Nov 1"
// ---------------------------------------------------------------------------

const DEADLINE_LEAD = String.raw`(?:application\s+deadline|deadline\s+(?:to|for)\s+(?:apply|applications?|submission)|deadline|apply\s+(?:no\s+later\s+than|by|before)|submit\s+(?:your\s+)?applications?\s+by|applications?\s+(?:are\s+|will\s+be\s+)?(?:due|accepted|reviewed|open)\s+(?:by|until|through|before)|applications?\s+(?:close|closes|closing)(?:\s+on)?|closing\s+date|(?:job\s+)?posting\s+(?:will\s+)?(?:close|closes|end|ends|expire|expires)(?:\s+on)?|accepting\s+applications\s+(?:until|through))\s*(?:is|on|:)?\s*:?\s*(?:[A-Z][a-z]+day,?\s+)?`;
const DEADLINE_RE = new RegExp(String.raw`${DEADLINE_LEAD}${MON}\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?${YEAR}`, "gi");
const DEADLINE_NUMERIC_RE = new RegExp(String.raw`${DEADLINE_LEAD}(?:(\d{1,2})/(\d{1,2})/(20\d{2}|\d{2})\b|(20\d{2})-(\d{2})-(\d{2})\b)`, "i");

export function deadlineFrom(text: string, seen: Date): string | null {
  let found: { y: number; m: number; d: number } | null = null;
  for (const m of text.matchAll(DEADLINE_RE)) {
    const [, mon, d, y] = m;
    if (!realMonth(mon!)) continue;
    const mi = monthIndex(mon!);
    const day = Number(d);
    const year = y ? Number(y) : inferYear(mi, day, seen, 14);
    if (!validDay(year, mi, day)) continue;
    found = { y: year, m: mi, d: day };
    break;
  }
  if (!found) {
    const n = text.match(DEADLINE_NUMERIC_RE);
    if (n) {
      const [y, mo, d] = n[1] ? [Number(n[3]!.length === 2 ? `20${n[3]}` : n[3]), Number(n[1]) - 1, Number(n[2])] : [Number(n[4]), Number(n[5]) - 1, Number(n[6])];
      if (mo >= 0 && mo < 12 && validDay(y, mo, d)) found = { y, m: mo, d };
    }
  }
  if (!found) return null;
  const t = Date.UTC(found.y, found.m, found.d);
  // Must be around when we saw the posting: not long before it, not more than ~14 months after.
  if (t < seen.getTime() - 45 * 86_400_000 || t > seen.getTime() + 430 * 86_400_000) return null;
  return ymd(found.y, found.m, found.d);
}

// ---------------------------------------------------------------------------

function label(p: { y: number; m: number; d: number | null }, withYear: boolean): string {
  return `${MONTH_NAMES[p.m]}${p.d ? ` ${p.d}` : ""}${withYear ? `${p.d ? "," : ""} ${p.y}` : ""}`;
}

/** Everything above, for one posting. `seen` = when we first saw it (for years that aren't written). */
export function extractTiming(title: string, description: string | undefined, seen: Date): Timing {
  const text = description ?? "";
  const term = termFrom(title) ?? termFrom(text);
  const termYear = term ? Number(term.slice(-4)) : null;
  const both = `${title}\n${text}`;

  const range = rangeFrom(both, seen, termYear);
  let startDate: string | null = null;
  let endDate: string | null = null;
  let datesLabel: string | null = null;
  let derived: string | null = null;
  if (range) {
    const { start: s, end: e } = range;
    startDate = ymd(s.y, s.m, s.d ?? 1);
    endDate = ymd(e.y, e.m, e.d ?? new Date(Date.UTC(e.y, e.m + 1, 0)).getUTCDate());
    datesLabel = `${label(s, s.y !== e.y)} – ${label(e, true)}`;
    if (s.d && e.d) {
      const weeks = Math.round((Date.UTC(e.y, e.m, e.d) - Date.UTC(s.y, s.m, s.d)) / (7 * 86_400_000));
      if (weeks >= 1 && weeks <= 60) derived = `${weeks} weeks`;
    } else {
      const months = (e.y - s.y) * 12 + (e.m - s.m) + 1;
      if (months >= 1 && months <= 24) derived = `${months} months`;
    }
  } else {
    const s = startFrom(both, seen, termYear);
    if (s) {
      startDate = ymd(s.y, s.m, s.d ?? 1);
      datesLabel = label(s, true);
    }
  }

  return {
    term,
    startDate,
    endDate,
    datesLabel,
    durationText: durationFrom(both) ?? derived,
    deadline: deadlineFrom(text, seen),
  };
}

// ---------------------------------------------------------------------------
// Workday "Posted …" text -> date
// ---------------------------------------------------------------------------

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" -> ISO date. "30+ Days Ago" stays null (the text says it). */
export function postedAtFromText(text: string | undefined | null, seen: Date): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  let days: number | null = null;
  if (/\btoday\b/.test(t)) days = 0;
  else if (/\byesterday\b/.test(t)) days = 1;
  else {
    const m = t.match(/\b(\d{1,2})\s+days?\s+ago\b/);
    if (m && !/\+/.test(t)) days = Number(m[1]);
  }
  if (days === null) return null;
  const d = new Date(seen.getTime() - days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T12:00:00.000Z`;
}
