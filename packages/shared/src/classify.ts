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

/**
 * Consulting practices that aren't life-science consulting (generalist firms like Charles River Associates,
 * Guidehouse and Huron post these too). Unless the title/department also mentions health or life sciences,
 * these are "other" (not shown), e.g. "Cyber and Forensic Technology Consulting Analyst".
 */
const NON_LIFESCI_PRACTICE =
  /\b(cyber\w*|forensic\w*|technology consult\w*|tech(nology)? (risk|advisory|strategy)|information security|infosec|data privacy|it (consult\w*|advisory|strategy)|digital transformation|cloud|software|erp|sap\b|salesforce|antitrust|competition economics|litigation|disputes?|investigations?|e-?discovery|financial (economics|services|advisory)|valuation|restructuring|transaction services|m&a advisory|tax|audit|accounting|actuar\w*|insurance|energy|utilities|oil|power|mining|real estate|construction|infrastructure|public sector|government|defen[cs]e|federal|labor (and|&) employment|transfer pricing|intellectual property|ip (valuation|litigation)|marketing science|retail|consumer products)\b/i;
const LIFE_SCI = /\b(life sciences?|health\s?care|health|pharma\w*|biotech\w*|bio(pharma|logics|science)\w*|medical|medtech|clinical|patient|therapeutic\w*|drug|oncology|payer|provider|hospital)\b/i;

/** "consulting" only when it's life-science / health consulting (or the practice isn't named). */
function consultingOrOther(title: string, department?: string): RoleFamily {
  const text = `${title} ${department ?? ""}`;
  return NON_LIFESCI_PRACTICE.test(text) && !LIFE_SCI.test(text) ? "other" : "consulting";
}

/**
 * Software roles at tech companies (Phase 3): software / new-grad engineers, forward deployed,
 * product and design engineers, UX / product designers.
 */
export const SOFTWARE_ROLE =
  /\b(software (engineer|developer|development engineer)\w*|swe\b|sde\b|developer\b|engineer(ing)?,? (new grad|early career|university grad|college grad)|forward[- ]deployed|deployment (strategist|engineer)|solutions? engineer|product engineer|design engineer|ux engineer|ui engineer|creative technologist|product designer|ux designer|full[- ]?stack|front[- ]?end|back[- ]?end|mobile engineer|ios engineer|android engineer|web engineer|platform engineer|infrastructure engineer|systems engineer|reliability engineer|sre\b|data engineer|machine learning engineer|ml engineer|ai engineer|applied ai engineer|research engineer|member of (the )?technical staff|mts\b|production engineer|security engineer|quant(itative)? developer|engineer\s*(i|1)\b)/i;

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
  // Tech companies: only software-type roles count (everything else there is noise for both users).
  if (segment === "tech") return SOFTWARE_ROLE.test(title) ? "software" : "other";
  // At consulting / VC firms, the business-facing roles *are* the job family.
  if (segment === "consulting") return consultingOrOther(title, department);
  if (segment === "vc") return "vc";
  if (/\b(consult\w*|strategy (analyst|associate)|management consult\w*)\b/i.test(title)) return consultingOrOther(title, department);
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
    /\b(entry[- ]level|new grad\w*|new college grad\w*|university grad\w*|college grad\w*|early career|campus|graduate program|rotation(al)? (program|associate)|associate|analyst|junior|jr\.?|assistant|technician|trainee|apprentice|fellow|fellowship)\b/i.test(t)
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
  /\b(canada|toronto|montreal|vancouver|ontario|quebec|united kingdom|\buk\b|england|london|oxford|scotland|ireland|dublin|germany|berlin|munich|france|paris|switzerland|basel|zurich|geneva|netherlands|amsterdam|leiden|belgium|brussels|denmark|copenhagen|sweden|stockholm|norway|finland|spain|madrid|barcelona|italy|milan|poland|warsaw|austria|vienna|israel|tel aviv|india|bangalore|bengaluru|hyderabad|mumbai|pune|china|shanghai|beijing|suzhou|hong kong|japan|tokyo|korea|seoul|singapore|taiwan|australia|sydney|melbourne|new zealand|mexico|méxico|chihuahua|guadalajara|monterrey|tijuana|brazil|brasil|são paulo|sao paulo|argentina|buenos aires|colombia|bogot[aá]|chile|santiago|peru|lima|costa rica|south africa|egypt|saudi|dubai|uae|turkey|istanbul|greece|portugal|lisbon|czech|prague|hungary|budapest|romania|bucharest|emea|apac|latam|europe)\b/i;

/** "Grenzach-Wyhlen, Baden-Württemberg, DE": a trailing 2-letter code after 2+ parts is a country, not a state. */
function foreignCountryCode(loc: string): boolean {
  const parts = loc.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1] ?? "";
  return parts.length >= 3 && /^[A-Z]{2}$/.test(last) && last !== "US";
}

/** Returns the US state code for one location string, or null if none found. */
export function stateOf(loc: string): string | null {
  if (foreignCountryCode(loc)) return null;
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

export function isUSCountry(country: string): boolean {
  return /^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i.test(country.trim());
}

function isUSMarker(loc: string): boolean {
  return /\b(united states|usa|u\.s\.a?\.?|us)\b/i.test(loc);
}

export function classifyLocation(
  locations: string[],
  remote: boolean,
  country?: string,
): { isUS: boolean | null; metroTier: MetroTier } {
  // The ATS's own country field is the most reliable signal when location text is vague.
  const countryIsUS = country ? isUSCountry(country) : null;
  const fromCountry = (): { isUS: boolean | null; metroTier: MetroTier } =>
    countryIsUS === true
      ? { isUS: true, metroTier: remote ? 2 : 3 }
      : countryIsUS === false
        ? { isUS: false, metroTier: null }
        : remote
          ? { isUS: null, metroTier: 2 }
          : { isUS: null, metroTier: 3 };

  if (locations.length === 0) return fromCountry();
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
  if (countryIsUS !== null) return fromCountry();
  if (allNonUS) return { isUS: false, metroTier: null };
  // Unknown (e.g. just "Remote", or "Hybrid"): keep it, sorted after known US metros.
  return { isUS: null, metroTier: remote ? 2 : 3 };
}

// ---------------------------------------------------------------------------
// Location -> places (state + city) for the map
// ---------------------------------------------------------------------------

export const REMOTE_STATE = "REMOTE";

/** Cities often written without a state. */
const CITY_STATE: [RegExp, string, string][] = [
  [/\bboston\b/i, "MA", "Boston"],
  [/\bcambridge\b/i, "MA", "Cambridge"],
  [/\b(new york city|nyc|manhattan|new york)\b/i, "NY", "New York"],
  [/\bbrooklyn\b/i, "NY", "Brooklyn"],
  [/\b(south )?san francisco\b/i, "CA", ""],
  [/\b(bay area|silicon valley)\b/i, "CA", "Bay Area"],
  [/\bpalo alto\b/i, "CA", "Palo Alto"],
  [/\bmountain view\b/i, "CA", "Mountain View"],
  [/\bsan jose\b/i, "CA", "San Jose"],
  [/\bsan diego\b/i, "CA", "San Diego"],
  [/\blos angeles\b/i, "CA", "Los Angeles"],
  [/\bseattle\b/i, "WA", "Seattle"],
  [/\bchicago\b/i, "IL", "Chicago"],
  [/\baustin\b/i, "TX", "Austin"],
  [/\bdenver\b/i, "CO", "Denver"],
  [/\batlanta\b/i, "GA", "Atlanta"],
  [/\bwashington,? d\.?c\.?\b/i, "DC", "Washington"],
];

const US_WORD = /^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i;
const ABBR = new Set(Object.keys(STATES));
const NAME_TO_CODE = new Map(Object.entries(STATES).map(([c, n]) => [n, c]));

function codeOf(part: string): string | null {
  const t = part.trim();
  if (/^[A-Z]{2}$/.test(t) && ABBR.has(t)) return t;
  return NAME_TO_CODE.get(t.toLowerCase()) ?? null;
}

function cleanCity(c: string): string {
  return c
    .replace(/\b(greater|metro(politan)?( area)?|area|hybrid|on-?site|remote|office|hq)\b/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,]+|[\s\-–—,]+$/g, "")
    .trim();
}

export interface Place {
  state: string; // 2-letter code or REMOTE
  city: string | null;
}

/** One location chunk ("Boston, MA", "US-MA-Cambridge", "USA - Massachusetts - Waltham", "Remote - US"). */
function placeOfChunk(chunk: string): Place | null {
  const loc = chunk.trim();
  if (!loc || foreignCountryCode(loc)) return null;

  // "US-MA-Boston" / "USA - MA - Boston" / "USA - Massachusetts - Boston"
  const dashed = loc.match(/^\s*(?:US|USA|United States)\s*-\s*([A-Za-z .]+?)\s*-\s*(.+)$/i);
  if (dashed) {
    const code = codeOf(dashed[1]!);
    if (code) return { state: code, city: cleanCity(dashed[2]!) || null };
  }

  // Comma form: "City, ST", "City, State, US", "City, ST 02139"
  const parts = loc.split(",").map((p) => p.trim().replace(/\s+\d{5}(-\d{4})?$/, "")).filter(Boolean);
  while (parts.length > 1 && US_WORD.test(parts[parts.length - 1]!)) parts.pop();
  if (parts.length >= 2) {
    const code = codeOf(parts[parts.length - 1]!);
    if (code) return { state: code, city: cleanCity(parts[parts.length - 2]!) || null };
  }

  const state = stateOf(loc);
  const city = CITY_STATE.find(([re]) => re.test(loc));
  if (state) {
    const cityName = city && city[1] === state ? city[2] || cleanCity(loc.match(city[0])![0]) : null;
    return { state, city: cityName || null };
  }
  if (/\bremote\b/i.test(loc)) return { state: REMOTE_STATE, city: null };
  if (city && !NON_US.test(loc)) {
    const name = city[2] || cleanCity(loc.match(city[0])![0]).replace(/\b\w/g, (m) => m.toUpperCase());
    return { state: city[1], city: name };
  }
  return null;
}

/** Every US place a job lists. A job in several states counts in each. */
export function placesOf(locations: string[], remote: boolean): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const loc of locations) {
    for (const chunk of loc.split(/;|\s\|\s|\s+or\s+|\n/i)) {
      const p = placeOfChunk(chunk);
      if (!p) continue;
      const k = `${p.state}|${p.city ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  if (remote && !out.some((p) => p.state === REMOTE_STATE) && out.length === 0) out.push({ state: REMOTE_STATE, city: null });
  return out;
}

/** "MA|Boston" strings (city may be empty), stored on jobs.places for the map's city breakdown. */
export function placeKeys(places: Place[]): string[] {
  return places.map((p) => `${p.state}|${p.city ?? ""}`);
}

export function statesOf(places: Place[]): string[] {
  return [...new Set(places.map((p) => p.state))].sort();
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
  const { isUS, metroTier } = classifyLocation(job.locations, job.remote, job.country);
  const places = isUS === false ? [] : placesOf(job.locations, job.remote);
  return {
    states: statesOf(places),
    places: placeKeys(places),
    roleFamily: classifyRoleFamily(job.title, company.segment, job.department),
    seniority: classifySeniority(job.title),
    degreeMin: classifyDegreeMin(job.descriptionText),
    isUS,
    metroTier,
    dedupeKey: dedupeKey(company.id, job.title),
  };
}
