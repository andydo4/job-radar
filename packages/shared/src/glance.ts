/**
 * "At a glance" facts people need to decide without reading the full description:
 * work model, visa sponsorship, travel, clearance, housing (internships),
 * and application extras (cover letter, transcript, etc.).
 *
 * All pattern rules, no AI. Anything unclear stays null / empty.
 */

export type WorkModel = "remote" | "hybrid" | "onsite";
export type VisaSponsorship = "yes" | "no";
export type Housing = "provided" | "stipend" | "not_provided";
export type ApplicationExtra =
  | "cover_letter"
  | "transcript"
  | "references"
  | "writing_sample"
  | "coding_assessment"
  | "case_study"
  | "portfolio"
  | "video";

export interface Glance {
  workModel: WorkModel | null;
  /** E.g. "3 days in office", "Tuesdays & Thursdays". */
  workModelDetail: string | null;
  visaSponsorship: VisaSponsorship | null;
  /** Free text: "Up to 50%", "Minimal", "25–50%". */
  travel: string | null;
  clearanceRequired: boolean | null;
  housing: Housing | null;
  applicationExtras: ApplicationExtra[];
}

// ---------------------------------------------------------------------------
// Work model
// ---------------------------------------------------------------------------

/** Sentences that explicitly say the role is fully remote. */
const REMOTE_YES =
  /\b(?:fully|100%|completely|entirely)\s+remote\b|\bremote[\s-]+(?:only|first|position|role|job|opportunity|work)\b|\bwork(?:ing)?\s+(?:from\s+home|remotely)\b|\bthis\s+(?:is\s+a\s+|position\s+is\s+)?remote\b|\bposition\s+is\s+remote\b|\blocation:\s*remote\b/i;

/** Sentences that say hybrid. */
const HYBRID_RE =
  /\bhybrid\b/i;

const HYBRID_DAYS_RE =
  /\b(\d)\s*(?:[-–]?\s*(\d))?\s*days?\s+(?:per\s+week\s+)?(?:in[\s-]+(?:the\s+)?office|on[\s-]?site|in[\s-]?person)\b|\b(?:in[\s-]+(?:the\s+)?office|on[\s-]?site|in[\s-]?person)\s+(\d)\s*(?:[-–]?\s*(\d))?\s*days?\s+(?:per\s+week|a\s+week|weekly)\b/i;

const HYBRID_NAMED_DAYS_RE =
  /\b(?:in[\s-]+(?:the\s+)?office|on[\s-]?site|in[\s-]?person)\s+(?:on\s+)?((?:Monday|Tuesday|Wednesday|Thursday|Friday)(?:\s*(?:,|and|&)\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday))*)\b/i;

/** Explicit on-site / in-office / in-person with no "remote" or "hybrid" nearby. */
const ONSITE_RE =
  /\b(?:on[\s-]?site|in[\s-]+(?:the\s+)?office|in[\s-]?person)\s+(?:only|position|role|job|work)\b|\bthis\s+(?:is\s+)?an?\s+(?:on[\s-]?site|in[\s-]+office|in[\s-]?person)\b|\bposition\s+is\s+(?:on[\s-]?site|in[\s-]+office|in[\s-]?person)\b|\blocation\s*type:\s*on[\s-]?site\b|\bnon[\s-]?remote\b/i;

/** False positives: "remote sensing", "remote monitoring", "remote patient". */
const REMOTE_FALSE =
  /\bnon[\s-]?remote\b|\bremote\s+(?:sensing|monitoring|patient|surgery|access|control|desktop|server|site|area|location|village|region|community)\b/gi;

export function workModelFrom(text: string): { model: WorkModel | null; detail: string | null } {
  if (!text) return { model: null, detail: null };

  const hasHybrid = HYBRID_RE.test(text) || HYBRID_DAYS_RE.test(text) || HYBRID_NAMED_DAYS_RE.test(text);
  const forRemote = text.replace(REMOTE_FALSE, "");
  const hasRemote = REMOTE_YES.test(forRemote);
  const hasOnsite = ONSITE_RE.test(text);

  // Hybrid wins when mentioned (it implies partial on-site + partial remote)
  if (hasHybrid) {
    let detail: string | null = null;
    const days = text.match(HYBRID_DAYS_RE);
    if (days) {
      const lo = days[1] ?? days[3];
      const hi = days[2] ?? days[4];
      detail = hi ? `${lo}–${hi} days in office` : `${lo} day${lo === "1" ? "" : "s"} in office`;
    } else {
      const named = text.match(HYBRID_NAMED_DAYS_RE);
      if (named) detail = named[1]!.replace(/\s*,\s*/g, ", ").replace(/\s+and\s+/g, " & ");
    }
    return { model: "hybrid", detail };
  }

  if (hasRemote) return { model: "remote", detail: null };

  // Only say on-site if the posting is explicit about it (don't infer from city alone)
  if (hasOnsite) return { model: "onsite", detail: null };

  return { model: null, detail: null };
}

// ---------------------------------------------------------------------------
// Visa / sponsorship
// ---------------------------------------------------------------------------

const NO_VISA =
  /\b(?:(?:will|does|is)\s+not|cannot|can['’]?t|unable\s+to|do\s+not)\s+(?:\w+\s+){0,3}(?:sponsor\w*|(?:provide|offer)\s+(?:\w+\s+){0,2}(?:visa|sponsorship|work\s+authorization))\b|\bwithout\s+(?:the\s+)?(?:need\s+for|requiring)\s+(?:company\s+)?(?:visa\s+)?sponsorship\b|\bmust\s+(?:be|have|already\s+be)\s+(?:\w+\s+){0,2}(?:authorized|eligible)\s+to\s+work\s+(?:in\s+the\s+(?:U\.?S\.?|United\s+States)|for\s+any\s+(?:U\.?S\.?|US)\s+employer)\s+(?:without|with\s+no)\s+(?:\w+\s+){0,2}sponsorship\b|\bno\s+(?:\w+\s+){0,2}(?:visa\s+)?sponsorship\b|\bnot\s+(?:able\s+to|in\s+a\s+position\s+to)\s+sponsor\b|\bsponsorship\s+(?:is\s+)?(?:not|un)available\b/i;

const YES_VISA =
  /\b(?:(?:will|can|able\s+to)\s+(?:provide\s+|offer\s+)?sponsor\w*|sponsorship\s+(?:is\s+)?(?:available|offered|provided)|offers?\s+(?:visa\s+)?sponsorship|(?:visa\s+)?sponsorship\s+(?:will\s+be\s+)?(?:available|offered|provided))\b/i;

/** False positive: "this role does not provide relocation sponsorship" (not about visas). */
const VISA_FALSE = /\b(?:relocation|event|program|naming|title|research|grant)\s+(?:and\s+housing\s+)?sponsorship\b/gi;

export function visaSponsorshipFrom(text: string): VisaSponsorship | null {
  if (!text) return null;
  const cleaned = text.replace(VISA_FALSE, "");

  // "No" patterns take precedence: any negative statement about sponsorship means no
  if (NO_VISA.test(cleaned)) return "no";
  if (YES_VISA.test(cleaned)) return "yes";
  return null;
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

const TRAVEL_PCT_RE =
  /\b(?:up\s+to\s+)?(\d{1,3})\s*(?:[-–]\s*(\d{1,3})\s*)?%\s*(?:of\s+(?:the\s+)?time\s+)?travel\b|\btravel\s*(?:requirement|required|expected)?:?\s*(?:up\s+to\s+)?(\d{1,3})\s*(?:[-–]\s*(\d{1,3})\s*)?%/i;
const TRAVEL_QUAL_RE =
  /\b(?:((?:minimal|occasional|limited|some|light|infrequent|rare)\s+travel)|((?:frequent|significant|extensive|regular|heavy|substantial|considerable)\s+travel)|(no\s+travel\s+(?:required|necessary|expected))|(?:travel\s+(?:is\s+)?(?:not\s+)?required|may\s+require\s+travel))\b/i;

export function travelFrom(text: string): string | null {
  if (!text) return null;

  const pct = text.match(TRAVEL_PCT_RE);
  if (pct) {
    const lo = pct[1] ?? pct[3];
    const hi = pct[2] ?? pct[4];
    if (lo) {
      const n = Number(hi ?? lo);
      if (n <= 100) {
        if (hi) return `${lo}–${hi}% travel`;
        if (text.toLowerCase().includes("up to")) return `Up to ${lo}% travel`;
        return `${lo}% travel`;
      }
    }
  }

  const qual = text.match(TRAVEL_QUAL_RE);
  if (qual) {
    if (qual[1]) return capitalize(qual[1]);
    if (qual[2]) return capitalize(qual[2]);
    if (qual[3]) return "No travel required";
  }

  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Security clearance
// ---------------------------------------------------------------------------

const CLEARANCE_RE =
  /\b(?:(?:must|required\s+to)\s+(?:have|obtain|hold|possess|maintain)\s+(?:a\s+|an\s+)?(?:active\s+)?(?:U\.?S\.?\s+)?(?:government\s+)?(?:security\s+)?clearance|(?:security\s+)?clearance\s+(?:is\s+)?required|(?:top\s+secret|ts\/sci|secret)\s+(?:security\s+)?clearance\s+(?:is\s+)?required|requires?\s+(?:a\s+|an\s+)?(?:active\s+)?(?:U\.?S\.?\s+)?(?:security\s+)?clearance|active\s+(?:top\s+secret|ts\/sci|secret)\s+clearance)\b/i;

export function clearanceFrom(text: string): boolean | null {
  if (!text) return null;
  return CLEARANCE_RE.test(text) ? true : null; // only flag when required; absence doesn't mean false
}

// ---------------------------------------------------------------------------
// Housing (internships)
// ---------------------------------------------------------------------------

const HOUSING_PROVIDED_RE =
  /\b(?:housing\s+(?:is\s+)?(?:provided|included|arranged|available|offered)|(?:provides?|offers?|includes?)\s+(?:\w+\s+){0,2}housing|(?:furnished|corporate)\s+(?:housing|apartment)|company[\s-](?:provided\s+)?housing)\b/i;

const HOUSING_STIPEND_RE =
  /\b(?:housing\s+(?:stipend|allowance|subsidy|assistance|support|reimbursement)|(?:stipend|allowance)\s+for\s+housing|relocation\s+(?:and\s+)?housing\s+(?:stipend|allowance|assistance))\b/i;

const HOUSING_NO_RE =
  /\b(?:housing\s+(?:is\s+)?(?:not\s+(?:provided|included|offered)|unavailable)|(?:does\s+not|will\s+not|cannot)\s+(?:\w+\s+){0,2}(?:provide|offer)\s+housing|no\s+housing\s+(?:provided|included|offered|assistance|stipend))\b/i;

export function housingFrom(text: string): Housing | null {
  if (!text) return null;
  // Check negative first
  if (HOUSING_NO_RE.test(text)) return "not_provided";
  if (HOUSING_STIPEND_RE.test(text)) return "stipend";
  if (HOUSING_PROVIDED_RE.test(text)) return "provided";
  return null;
}

// ---------------------------------------------------------------------------
// Application extras
// ---------------------------------------------------------------------------

const EXTRA_PATTERNS: [ApplicationExtra, RegExp][] = [
  [
    "cover_letter",
    /\b(?:cover\s+letter|letter\s+of\s+(?:interest|intent|motivation))\s+(?:is\s+)?(?:required|mandatory|must|needed|expected)\b|\b(?:submit|include|attach|provide|upload|require[sd]?)\b[^.\n]{0,80}\b(?:cover\s+letter|letter\s+of\s+(?:interest|intent))\b/i,
  ],
  [
    "transcript",
    /\b(?:(?:unofficial\s+|official\s+)?transcripts?\s+(?:is\s+|are\s+)?(?:required|mandatory|must|needed)|(?:submit|include|attach|provide|upload|require[sd]?)\b[^.\n]{0,80}\btranscripts?)\b/i,
  ],
  [
    "references",
    /\b(?:(?:provide|submit|include|require[sd]?)\b[^.\n]{0,80}\b(?:\d\s+)?(?:professional\s+)?references?|(?:\d\s+)?references?\s+(?:are\s+)?required)\b/i,
  ],
  [
    "writing_sample",
    /\b(?:writing\s+sample\s+(?:is\s+)?(?:required|needed)|(?:submit|include|attach|provide|require[sd]?)\b[^.\n]{0,80}\bwriting\s+sample)\b/i,
  ],
  [
    "coding_assessment",
    /\b(?:(?:coding|technical|programming)\s+(?:challenge|assessment|test|exercise|screen)|take[\s-]home\s+(?:assignment|project|challenge))\b/i,
  ],
  [
    "case_study",
    /\b(?:case\s+(?:study|interview|presentation)|(?:business|consulting)\s+case)\b/i,
  ],
  [
    "portfolio",
    /\b(?:portfolio\s+(?:is\s+)?(?:required|needed)|(?:submit|include|provide|share)\b[^.\n]{0,80}\bportfolio)\b/i,
  ],
  [
    "video",
    /\b(?:video\s+(?:interview|submission|essay|response|introduction)|(?:submit|record)\s+(?:a\s+)?(?:short\s+)?video)\b/i,
  ],
];

export function applicationExtrasFrom(text: string): ApplicationExtra[] {
  if (!text) return [];
  const found: ApplicationExtra[] = [];
  for (const [extra, re] of EXTRA_PATTERNS) {
    if (re.test(text)) found.push(extra);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function extractGlance(title: string, description: string | undefined): Glance {
  const text = description ? `${title}\n${description}` : title;
  const { model, detail } = workModelFrom(text);
  return {
    workModel: model,
    workModelDetail: detail,
    visaSponsorship: visaSponsorshipFrom(text),
    travel: travelFrom(text),
    clearanceRequired: clearanceFrom(text),
    housing: housingFrom(text),
    applicationExtras: applicationExtrasFrom(text),
  };
}
