/** "careersite": a company's own careers site read from its public job feed / sitemap (see adapters/careersite.ts). */
export type Ats = "greenhouse" | "lever" | "ashby" | "workday" | "careersite";

export type Segment =
  | "pharma"
  | "biotech"
  | "tools"
  | "cro"
  | "consulting"
  | "vc"
  | "academic"
  | "tech";

export interface Company {
  /** Stable id, e.g. "ginkgo-bioworks". */
  id: string;
  name: string;
  ats: Ats;
  /**
   * Board key for the ATS.
   * - greenhouse / lever / ashby: the board slug (e.g. "ginkgobioworks")
   * - workday: "tenant|wdN|site" (e.g. "pfizer|wd1|PfizerCareers")
   * - careersite: the job feed URL (an RSS feed or a sitemap listing every job page)
   */
  atsKey: string;
  segment: Segment;
  active: boolean;
}

/** One job as every adapter returns it, regardless of ATS. */
export interface NormalizedJob {
  companyId: string;
  /** Unique within the company's ATS board. */
  externalId: string;
  title: string;
  url: string;
  locations: string[];
  remote: boolean;
  /** ISO timestamp if the ATS gives one; Workday only gives text like "Posted Today". */
  postedAt: string | null;
  postedText?: string;
  department?: string;
  /** Plain-text description, when the list endpoint includes it. */
  descriptionText?: string;
  /**
   * Country from the ATS when it gives one (Lever `country`, Ashby address,
   * Workday job detail). ISO code ("US") or a name ("United States of America").
   */
  country?: string;
  /** Structured pay / job type / requirement lists, when the ATS provides them (see details.ts). */
  detailHints?: import("./details.ts").DetailHints;
}

export interface FetchResult {
  jobs: NormalizedJob[];
  /**
   * True when this was a full sweep of the board. Only full sweeps are allowed
   * to mark missing jobs as closed (partial Workday sweeps never close jobs).
   */
  complete: boolean;
  /** Number of HTTP requests made (for politeness / volume tracking). */
  requests: number;
}

export type RoleFamily =
  | "research"
  | "process"
  | "quality"
  | "clinical"
  | "regulatory"
  | "compbio"
  | "engineering"
  | "commercial"
  | "consulting"
  | "vc"
  | "other";

export type Seniority = "intern" | "entry" | "mid" | "senior" | "unspecified";

export type Degree = "bs" | "ms" | "phd";

/** 1 = Boston/NYC, 2 = rest of East Coast + West Coast + US remote, 3 = rest of US. null = outside US. */
export type MetroTier = 1 | 2 | 3 | null;

export interface Classification {
  roleFamily: RoleFamily;
  seniority: Seniority;
  degreeMin: Degree | null;
  metroTier: MetroTier;
  /** true = US, false = clearly outside US, null = can't tell (e.g. Workday "3 Locations"). */
  isUS: boolean | null;
  dedupeKey: string;
}

export type ClassifiedJob = NormalizedJob & Classification;
