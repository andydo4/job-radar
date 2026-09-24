import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText } from "./util.ts";
import { htmlToText } from "../text.ts";

/**
 * Workday's careers pages call an undocumented JSON endpoint:
 *   POST https://{tenant}.{wdN}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *   body {"appliedFacets":{},"limit":20,"offset":0,"searchText":""}
 *
 * Gotchas:
 * - limit is capped at 20. Asking for more returns 200 OK with ZERO jobs.
 * - `total` is only reliable on the first page (offset 0).
 * - Very large boards stop paginating somewhere around 2,000–10,000 results.
 * - `postedOn` is text ("Posted Today", "Posted 30+ Days Ago"), not a date.
 * - The list has no description. Fetch /job/{externalPath} for new jobs only.
 */
export const WORKDAY_PAGE_SIZE = 20;

export interface WorkdayKey {
  tenant: string;
  wd: string; // "wd1", "wd5", ...
  site: string;
  /** Optional 4th part: a search phrase to read only matching jobs on huge boards ("new college grad" at Nvidia). */
  search?: string;
}

export function parseWorkdayKey(atsKey: string): WorkdayKey {
  const [tenant, wd, site, search] = atsKey.split("|");
  if (!tenant || !wd || !site) {
    throw new Error(`Workday atsKey must be "tenant|wdN|site" (optionally "|search words"), got "${atsKey}"`);
  }
  return { tenant, wd, site, ...(search?.trim() ? { search: search.trim() } : {}) };
}

/** "https://pfizer.wd1.myworkdayjobs.com/en-US/PfizerCareers/job/..." -> "pfizer|wd1|PfizerCareers" */
export function workdayKeyFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/([^.]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (!m) return null;
  return `${m[1]}|${m[2]}|${m[3]}`;
}

export function workdayHost(k: WorkdayKey): string {
  return `https://${k.tenant}.${k.wd}.myworkdayjobs.com`;
}

export function workdayListUrl(k: WorkdayKey): string {
  return `${workdayHost(k)}/wday/cxs/${k.tenant}/${k.site}/jobs`;
}

interface WdPosting {
  title: string;
  externalPath: string; // "/job/Andover-MA/Associate-Scientist_4924655-2"
  locationsText?: string; // "Andover, MA" or "3 Locations"
  postedOn?: string;
  remoteType?: string;
  bulletFields?: string[]; // usually [reqId]
}

interface WdPage {
  total?: number;
  jobPostings?: WdPosting[];
}

export function parseWorkdayPage(company: Company, k: WorkdayKey, data: unknown): {
  jobs: NormalizedJob[];
  total: number | null;
} {
  const page = data as WdPage;
  if (!page || !Array.isArray(page.jobPostings)) throw new Error("Workday: response has no jobPostings[]");
  const jobs = page.jobPostings.map((p): NormalizedJob => {
    const loc = p.locationsText?.trim() ?? "";
    return {
      companyId: company.id,
      externalId: p.externalPath,
      title: p.title.trim(),
      url: `${workdayHost(k)}/en-US/${k.site}${p.externalPath}`,
      // "3 Locations" tells us nothing; keep it out of the location list.
      locations: loc && !/^\d+\s+locations?$/i.test(loc) ? [loc] : [],
      remote: isRemoteText(loc) || /remote/i.test(p.remoteType ?? ""),
      postedAt: null,
      postedText: p.postedOn,
    };
  });
  return { jobs, total: typeof page.total === "number" ? page.total : null };
}

export interface WorkdayOptions {
  /** Max pages of 20 to read. Omit (or Infinity) for a full sweep. */
  maxPages?: number;
  /** Hard safety cap for full sweeps. */
  maxTotalPages?: number;
  /** Pause between page requests, ms. */
  pageDelayMs?: number;
  /** Ask Workday for US jobs only when the board offers a country filter (default true). */
  usOnly?: boolean;
}

interface WdFacetNode {
  facetParameter?: string;
  descriptor?: string;
  id?: string;
  values?: WdFacetNode[];
}

const US_NAMES = /^(united states( of america)?|usa|us)$/i;

/**
 * Find the board's own "Country = United States" filter in the facets Workday sends back
 * (the parameter name differs per company: locationCountry, Location_Country, ...).
 */
export function findUsFacet(data: unknown): { param: string; id: string } | null {
  const facets = (data as { facets?: WdFacetNode[] } | null)?.facets;
  if (!Array.isArray(facets)) return null;
  const found: { param: string; id: string }[] = [];
  const walk = (nodes: WdFacetNode[], param: string | undefined) => {
    for (const n of nodes) {
      const p = n.facetParameter ?? param;
      if (p && n.id && n.descriptor && US_NAMES.test(n.descriptor.trim())) found.push({ param: p, id: n.id });
      if (Array.isArray(n.values)) walk(n.values, n.facetParameter ?? param);
    }
  };
  walk(facets, undefined);
  // Only trust an actual country filter. A "locations" list that happens to contain a site called
  // "United States" can match just a handful of jobs and would silently hide the rest.
  return found.find((f) => /country/i.test(f.param)) ?? null;
}

export async function fetchWorkday(
  ctx: HttpContext,
  company: Company,
  opts: WorkdayOptions = {},
): Promise<FetchResult> {
  const k = parseWorkdayKey(company.atsKey);
  const url = workdayListUrl(k);
  const maxPages = Math.min(opts.maxPages ?? Infinity, opts.maxTotalPages ?? 150);
  const delay = opts.pageDelayMs ?? 300;

  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let requests = 0;
  let reachedEnd = false;

  // One small request to learn the board's US filter; then every page asks for US jobs only.
  // (Big pharma boards are mostly non-US, so this cuts the pages to read a lot.)
  let appliedFacets: Record<string, string[]> = {};
  if (opts.usOnly !== false) {
    const probe = await requestJson(ctx, url, { method: "POST", body: { appliedFacets: {}, limit: 1, offset: 0, searchText: k.search ?? "" } });
    requests++;
    const us = findUsFacet(probe);
    if (us) appliedFacets = { [us.param]: [us.id] };
  }

  for (let page = 0; page < maxPages; page++) {
    const data = await requestJson(ctx, url, {
      method: "POST",
      body: { appliedFacets, limit: WORKDAY_PAGE_SIZE, offset: page * WORKDAY_PAGE_SIZE, searchText: k.search ?? "" },
    });
    requests++;
    const parsed = parseWorkdayPage(company, k, data);
    if (page === 0) total = parsed.total;
    for (const j of parsed.jobs) {
      if (!seen.has(j.externalId)) {
        seen.add(j.externalId);
        jobs.push(j);
      }
    }
    const fetched = (page + 1) * WORKDAY_PAGE_SIZE;
    if (parsed.jobs.length < WORKDAY_PAGE_SIZE || (total !== null && fetched >= total)) {
      reachedEnd = true;
      break;
    }
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  // Only a sweep that reached the real end AND got (nearly) everything `total` promised may close jobs.
  // If Workday's pagination ceiling cut us off, jobs.length will be far below total -> not complete.
  // A little slack allows for postings that shift between pages while we paginate.
  const complete = reachedEnd && (total === null || jobs.length >= total - WORKDAY_PAGE_SIZE);
  return { jobs, complete, requests };
}

// ---------------------------------------------------------------------------
// Job detail: GET {host}/wday/cxs/{tenant}/{site}{externalPath}
// Used only for NEW jobs: gives the description (degree parsing), the country
// (US-only filter), and every location (the list only says "3 Locations").
// ---------------------------------------------------------------------------

interface WdDetail {
  jobPostingInfo?: {
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    country?: { descriptor?: string } | string;
    remoteType?: string;
    startDate?: string;
    timeType?: string;
  };
}

export function workdayDetailUrl(k: WorkdayKey, externalPath: string): string {
  return `${workdayHost(k)}/wday/cxs/${k.tenant}/${k.site}${externalPath}`;
}

export function parseWorkdayDetail(data: unknown): {
  descriptionText?: string;
  locations: string[];
  country?: string;
  remote: boolean;
  timeType?: string;
  /** The day the posting went up ("2026-09-24"). */
  postedDate?: string;
} {
  const info = (data as WdDetail)?.jobPostingInfo ?? {};
  const country = typeof info.country === "string" ? info.country : info.country?.descriptor;
  const locations = [info.location ?? "", ...(info.additionalLocations ?? [])]
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+\s+locations?$/i.test(s));
  return {
    descriptionText: info.jobDescription ? htmlToText(info.jobDescription) : undefined,
    locations: [...new Set(locations)],
    country: country || undefined,
    remote: /remote/i.test(info.remoteType ?? "") || locations.some(isRemoteText),
    timeType: info.timeType,
    postedDate: info.startDate && /^\d{4}-\d{2}-\d{2}$/.test(info.startDate) ? info.startDate : undefined,
  };
}

/** Fill in description / country / locations for a Workday job from its detail page. */
export async function enrichWorkdayJob(ctx: HttpContext, company: Company, job: NormalizedJob): Promise<NormalizedJob> {
  const k = parseWorkdayKey(company.atsKey);
  const d = parseWorkdayDetail(await requestJson(ctx, workdayDetailUrl(k, job.externalId)));
  return {
    ...job,
    descriptionText: d.descriptionText ?? job.descriptionText,
    locations: d.locations.length ? d.locations : job.locations,
    country: d.country ?? job.country,
    remote: job.remote || d.remote,
    postedAt: job.postedAt ?? (d.postedDate ? `${d.postedDate}T12:00:00.000Z` : null),
    detailHints: { ...job.detailHints, employmentTypeText: d.timeType ?? job.detailHints?.employmentTypeText },
  };
}
