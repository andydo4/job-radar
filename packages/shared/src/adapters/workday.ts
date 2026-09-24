import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText } from "./util.ts";

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
}

export function parseWorkdayKey(atsKey: string): WorkdayKey {
  const [tenant, wd, site] = atsKey.split("|");
  if (!tenant || !wd || !site) {
    throw new Error(`Workday atsKey must be "tenant|wdN|site", got "${atsKey}"`);
  }
  return { tenant, wd, site };
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

  for (let page = 0; page < maxPages; page++) {
    const data = await requestJson(ctx, url, {
      method: "POST",
      body: { appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset: page * WORKDAY_PAGE_SIZE, searchText: "" },
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
