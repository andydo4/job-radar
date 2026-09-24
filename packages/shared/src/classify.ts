import type {
  Classification,
  Company,
  Degree,
  MetroTier,
  NormalizedJob,
  RoleFamily,
  Segment,
  Seniority,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Role family
// ---------------------------------------------------------------------------

/** Support roles that are "other" no matter the company segment. */
const SUPPORT =
  /\b(recruit\w*|talent acquisition|human resources|hr\b|people (operations|partner)|payroll|accountant|accounting|accounts payable|controller|tax|treasury|legal counsel|paralegal|attorney|office manager|receptionist|executive assistant|administrative assistant|facilities|janitor|custodian|security officer|it support|help ?desk|desktop support)\b/i;

const FAMILY_RULES: [RoleFamily, RegExp][] = [
  ["compbio", /\b(bioinformatic\w*|computational (biolog\w*|chemist\w*|scien\w*)|machine learning scientist|data scien\w*|biostatistic\w*|statistical programmer|cheminformatic\w*)\b/i],
  ["regulatory", /\b(regulatory|pharmacovigilance|drug safety|medical writ\w*)\b/i],
  ["clinical", /\b(clinical|cra\b|cta\b|trial|medical science liaison|msl\b|patient safety)\b/i],
  ["quality", /\b(quality|qa\b|qc\b|validation|compliance|gmp auditor|metrology)\b/i],
  ["process", /\b(process (engineer|development|scien\w*)|manufacturing|msat|bioprocess|upstream|downstream|purification|fermentation|cell culture|formulation|tech(nical)? transfer|production (associate|technician|operator)|biomanufacturing|supply chain)\b/i],
  ["engineering", /\b(software|automation engineer|firmware|devops|frontend|front-end|backend|back-end|full[- ]?stack|robotics|hardware engineer|mechanical engineer|electrical engineer|instrumentation)\b/i],
  ["commercial", /\b(sales|marketing|account (manager|executive)|business development|commercial|market access|brand|field application)\b/i],
  ["research", /\b(scientist|research|lab(oratory)? (technician|associate)|technician|assay|biolog\w*|chemist\w*|immunolog\w*|molecular|protein|antibody|discovery|pharmacolog\w*|toxicolog\w*|genomic\w*|sequencing|postdoc\w*|in vivo|vivarium|translational)\b/i],
];

export function classifyRoleFamily(title: string, segment: Segment, department?: string): RoleFamily {
  if (SUPPORT.test(title)) return "other";
  // At consulting / VC firms, the business-facing roles *are* the job family.
  if (segment === "consulting") return "consulting";
  if (segment === "vc") return "vc";
  if (/\b(consult\w*|strategy (analyst|associate)|management consult\w*)\b/i.test(title)) return "consulting";
  if (/\b(venture|investment (analyst|associate)|entrepreneur[- ]in[- ]residence|\beir\b)\b/i.test(title)) return "vc";

  const haystack = `${title} ${department ?? ""}`;
  for (const [family, re] of FAMILY_RULES) {
    if (re.test(title)) return family;
  }
  // Fall back to the department name only if the title said nothing.
  for (const [family, re] of FAMILY_RULES) {
    if (re.test(haystack)) return family;
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Seniority
// ---------------------------------------------------------------------------

export function classifySeniority(title: string): Seniority {
  const t = title.replace(/[–—]/g, "-");
  if (/\b(intern|internship|co-?op|summer (student|associate)|student (worker|researcher))\b/i.test(t)) return "intern";
  if (
    /\b(senior|sr\.?|principal|staff|lead|manager|director|head of|vp|vice president|chief|partner|executive director|fellow(?! program))\b/i.test(t) &&
    // "Venture Fellow" / "Associate Fellow" at VC firms is an early-career program.
    !/\b(venture|associate|analyst|kauffman) fellow\b/i.test(t)
  ) {
    return "senior";
  }
  // "Research Associate I/II" is an entry-level req that can be filled at either level.
  if (/\b(I|1)\s*\/\s*(II|2)\b/.test(t)) return "entry";
  if (/(?<!phase\s)\b(II|III|IV|2|3|4)\b(?!\s*(?:shift|month|year|day))/i.test(t) || /\blevel (2|3|4)\b/i.test(t)) return "mid";
  if (
    /\b(I|1)\b(?!\s*\/)/.test(t) ||
    /\b(entry[- ]level|new grad\w*|early career|graduate program|rotation(al)? (program|associate)|associate|analyst|junior|jr\.?|assistant|technician|trainee|apprentice|fellow|fellowship)\b/i.test(t)
  ) {
    return "entry";
  }
  return "unspecified";
}

// ---------------------------------------------------------------------------
// Minimum degree mentioned in the description
// ---------------------------------------------------------------------------

export function classifyDegreeMin(description: string | undefined): Degree | null {
  if (!description) return null;
  const d = description;
  const bs = /\b(bachelor'?s?|b\.?s\.?c?\b|b\.?a\.?\b|undergraduate degree|4-year degree|four-year degree)/i.test(d);
  const ms = /\b(master'?s?|m\.?s\.?c?\b(?!\s*(office|excel|word|project|teams|powerpoint|access))|m\.?eng|mba)\b/i.test(d);
  const phd = /\b(ph\.?\s?d|doctorate|doctoral|pharm\.?\s?d)\b/i.test(d);
  if (bs) return "bs";
  if (ms) return "ms";
  if (phd) return "phd";
  return null;
}

// ---------------------------------------------------------------------------
// Location -> US + metro tier
// ---------------------------------------------------------------------------

const STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado",
  CT: "connecticut", DE: "delaware", DC: "district of columbia", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas",
  KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts",
  MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana",
  NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico",
  NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west virginia", WI: "wisconsin", WY: "wyoming", PR: "puerto rico",
};

const EAST_COAST = new Set(["ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC", "VA", "NC", "SC", "GA", "FL"]);
const WEST_COAST = new Set(["CA", "OR", "WA"]);

const TIER1_CITIES =
  /\b(boston|cambridge|somerville|waltham|lexington|watertown|woburn|bedford|burlington|framingham|new york|nyc|manhattan|brooklyn|jersey city|princeton|rahway|summit|new brunswick|kenilworth|lawrenceville|bridgewater|morristown|parsippany)\b/i;

const NON_US =
  /\b(canada|toronto|montreal|vancouver|ontario|quebec|united kingdom|\buk\b|england|london|oxford|scotland|ireland|dublin|germany|berlin|munich|france|paris|switzerland|basel|zurich|geneva|netherlands|amsterdam|leiden|belgium|brussels|denmark|copenhagen|sweden|stockholm|norway|finland|spain|madrid|barcelona|italy|milan|poland|warsaw|austria|vienna|israel|tel aviv|india|bangalore|bengaluru|hyderabad|mumbai|pune|china|shanghai|beijing|suzhou|hong kong|japan|tokyo|korea|seoul|singapore|taiwan|australia|sydney|melbourne|new zealand|mexico|brazil|argentina|colombia|south africa|emea|apac|latam|europe)\b/i;

/** Returns the US state code for one location string, or null if none found. */
export function stateOf(loc: string): string | null {
  // "Boston, MA", "Boston, MA, US", "US-MA-Boston", "Andover, Massachusetts"
  const abbr = loc.match(/(?:,\s*|\bUS-|\bUSA?\s*-\s*)([A-Z]{2})\b/);
  if (abbr && abbr[1] && abbr[1] in STATES) return abbr[1];
  const lower = loc.toLowerCase();
  // Longest names first so "west virginia" wins over "virginia".
  const byLength = Object.entries(STATES).sort((a, b) => b[1].length - a[1].length);
  for (const [code, name] of byLength) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      // "New York" could be the city or the state; both are NY.
      return code;
    }
  }
  return null;
}

function isUSMarker(loc: string): boolean {
  return /\b(united states|usa|u\.s\.a?\.?|us)\b/i.test(loc);
}

export function classifyLocation(locations: string[], remote: boolean): { isUS: boolean | null; metroTier: MetroTier } {
  if (locations.length === 0) {
    return remote ? { isUS: null, metroTier: 2 } : { isUS: null, metroTier: 3 };
  }
  let best: MetroTier = null;
  let anyUS = false;
  let allNonUS = true;

  for (const loc of locations) {
    const state = stateOf(loc);
    const us = state !== null || isUSMarker(loc) || (TIER1_CITIES.test(loc) && !NON_US.test(loc));
    const nonUS = !us && NON_US.test(loc);
    if (!nonUS) allNonUS = false;
    if (!us) continue;
    anyUS = true;

    let tier: MetroTier = 3;
    if (TIER1_CITIES.test(loc) && (state === null || ["MA", "NY", "NJ"].includes(state))) tier = 1;
    else if (state && (EAST_COAST.has(state) || WEST_COAST.has(state))) tier = 2;
    else if (/\bremote\b/i.test(loc)) tier = 2;
    best = best === null ? tier : (Math.min(best, tier) as MetroTier);
  }

  if (anyUS) return { isUS: true, metroTier: best };
  if (allNonUS) return { isUS: false, metroTier: null };
  // Unknown (e.g. just "Remote", or "Hybrid"): keep it, sorted after known US metros.
  return { isUS: null, metroTier: remote ? 2 : 3 };
}

// ---------------------------------------------------------------------------
// Dedupe key: one role posted in many cities -> one group
// ---------------------------------------------------------------------------

/** A trailing " - Andover, MA" / " | Remote" / ", Cambridge, MA" chunk that only names a place. */
const TRAILING_PLACE = new RegExp(
  String.raw`\s*[-–—|,]\s*[^-–—|]*?(?:,\s*(?:${Object.keys(STATES).join("|")})\b|\b[Rr]emote\b|\bREMOTE\b|\b[Hh]ybrid\b|\b[Oo]n-?[Ss]ite\b|\bUSA?\b)[^-–—|]*$`,
);

export function dedupeKey(companyId: string, title: string): string {
  let t = title.replace(/\(.*?\)|\[.*?\]/g, " "); // "(Boston)", "[Contract]"
  // Strip trailing place names, possibly several ("... - Boston, MA - Hybrid").
  for (let i = 0; i < 3 && TRAILING_PLACE.test(t); i++) t = t.replace(TRAILING_PLACE, "");
  const norm = t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${companyId}::${norm}`;
}

// ---------------------------------------------------------------------------

export function classifyJob(job: NormalizedJob, company: Company): Classification {
  const { isUS, metroTier } = classifyLocation(job.locations, job.remote);
  return {
    roleFamily: classifyRoleFamily(job.title, company.segment, job.department),
    seniority: classifySeniority(job.title),
    degreeMin: classifyDegreeMin(job.descriptionText),
    isUS,
    metroTier,
    dedupeKey: dedupeKey(company.id, job.title),
  };
}
