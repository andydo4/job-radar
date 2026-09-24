// Readers for big companies that run their own careers sites (no Greenhouse / Lever / Ashby / Workday):
//
//   amazon     amazon.jobs public search JSON (100 per page, includes the description)
//   google     google.com/about/careers search pages (the job list is embedded as JSON in the HTML)
//   apple      jobs.apple.com search pages (embedded JSON); students / internships only
//   eightfold  Eightfold "PCSX" career sites (Microsoft, Netflix...): 10 per page, rate-limited
//
// All four are read at most hourly (like careers-site feeds) and only for US jobs.
// Verified live from a browser on 2026-09-24.

import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { HttpError, requestJson, requestText, type HttpContext } from "../http.ts";
import { htmlToText } from "../text.ts";
import { isRemoteText, uniq } from "./util.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

// ---------------------------------------------------------------------------
// Amazon: https://www.amazon.jobs/en/search.json?category[]=software-development&normalized_country_code[]=USA
// atsKey = job categories, ";"-separated ("software-development").
// ---------------------------------------------------------------------------

const AMAZON_PAGE = 100;
const AMAZON_MAX = 4000;

export function amazonUrl(categories: string, offset: number): string {
  const cats = categories
    .split(/[;,]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `&category%5B%5D=${encodeURIComponent(c)}`)
    .join("");
  return `https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=USA${cats}&result_limit=${AMAZON_PAGE}&offset=${offset}&sort=recent`;
}

export function parseAmazon(company: Company, data: unknown): { jobs: NormalizedJob[]; hits: number } {
  const d = data as { hits?: number; jobs?: Json[] };
  if (!Array.isArray(d?.jobs)) throw new Error("Amazon: expected { jobs: [] }");
  const jobs = d.jobs.map((j): NormalizedJob => {
    const loc = str(j.normalized_location) ?? str(j.location) ?? "";
    const desc = [str(j.description), str(j.basic_qualifications) && `Basic qualifications:<br/>${j.basic_qualifications}`, str(j.preferred_qualifications) && `Preferred qualifications:<br/>${j.preferred_qualifications}`]
      .filter(Boolean)
      .join("<br/><br/>");
    const posted = str(j.posted_date) ? new Date(`${j.posted_date} 12:00 UTC`) : null;
    return {
      companyId: company.id,
      externalId: String(j.id_icims ?? j.id),
      title: String(j.title ?? "").trim(),
      url: `https://www.amazon.jobs${str(j.job_path) ?? `/en/jobs/${j.id_icims}`}`,
      locations: loc ? [loc] : [],
      remote: isRemoteText(loc),
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : null,
      department: str(j.job_category) ?? str((j.team as Json | undefined)?.label),
      descriptionText: desc ? htmlToText(desc) : undefined,
      country: "US",
    };
  });
  return { jobs, hits: typeof d.hits === "number" ? d.hits : jobs.length };
}

/**
 * Amazon posts ~1,800 US software jobs; plain "Software Development Engineer" means SDE II (3+ years).
 * Keep only early-career ones: "... I", "Early Career", "New Grad", "University", internships.
 */
export function amazonEarlyCareer(title: string): boolean {
  if (/\b(II|III|IV|2|3|senior|sr\.?|principal|staff|lead|manager)\b/i.test(title)) return false;
  return /\b(I|1)\b|early career|new grad|university|graduate|intern(ship)?s?\b|entry[- ]level|apprentice/i.test(title);
}

export async function fetchAmazon(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const jobs: NormalizedJob[] = [];
  let hits = Infinity;
  let requests = 0;
  let reachedEnd = false;
  for (let offset = 0; offset < AMAZON_MAX; offset += AMAZON_PAGE) {
    if (requests) await sleep(400);
    const page = parseAmazon(company, await requestJson(ctx, amazonUrl(company.atsKey, offset)));
    requests++;
    hits = page.hits;
    jobs.push(...page.jobs);
    if (page.jobs.length < AMAZON_PAGE || offset + AMAZON_PAGE >= hits) {
      reachedEnd = true;
      break;
    }
  }
  return { jobs: dedupe(jobs).filter((j) => amazonEarlyCareer(j.title)), complete: reachedEnd, requests };
}

// ---------------------------------------------------------------------------
// Google: https://www.google.com/about/careers/applications/jobs/results?location=United%20States&target_level=EARLY
// The page embeds AF_initDataCallback({key: 'ds:1', data: [[jobs...], null, total, pageSize]}).
// atsKey = target levels, ";"-separated ("EARLY;INTERN_AND_APPRENTICE").
// ---------------------------------------------------------------------------

const GOOGLE_BASE = "https://www.google.com/about/careers/applications/jobs/results";

export function googleUrl(level: string, page: number): string {
  return `${GOOGLE_BASE}?location=United%20States&target_level=${encodeURIComponent(level)}${page > 1 ? `&page=${page}` : ""}`;
}

/** Row layout (2026-09): 0 id, 1 title, 3 responsibilities, 4 qualifications, 9 locations, 10 description, 12 created [s, ns]. */
export function parseGoogle(company: Company, html: string): { jobs: NormalizedJob[]; total: number } {
  const m = html.match(/AF_initDataCallback\(\{key: 'ds:1'[\s\S]*?data:([\s\S]*?), sideChannel/);
  if (!m) throw new Error("Google: job data not found in page");
  const data = JSON.parse(m[1]!) as unknown[];
  const rows = (Array.isArray(data[0]) ? data[0] : []) as unknown[][];
  const html2 = (v: unknown) => (Array.isArray(v) && typeof v[1] === "string" ? v[1] : "");
  const jobs = rows.map((r): NormalizedJob => {
    const id = String(r[0]);
    const locations = Array.isArray(r[9]) ? (r[9] as unknown[][]).map((l) => String(l?.[0] ?? "")).filter(Boolean) : [];
    const created = Array.isArray(r[12]) && typeof r[12][0] === "number" ? new Date((r[12][0] as number) * 1000).toISOString() : null;
    const desc = [html2(r[10]), html2(r[3]) && `<h3>Responsibilities</h3>${html2(r[3])}`, html2(r[4])].filter(Boolean).join("");
    return {
      companyId: company.id,
      externalId: id,
      title: String(r[1] ?? "").trim(),
      url: `${GOOGLE_BASE}/${id}`,
      locations: uniq(locations),
      remote: locations.some(isRemoteText),
      postedAt: created,
      descriptionText: desc ? htmlToText(desc) : undefined,
      country: "US",
    };
  });
  return { jobs, total: typeof data[2] === "number" ? data[2] : jobs.length };
}

export async function fetchGoogle(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const jobs: NormalizedJob[] = [];
  let requests = 0;
  let complete = true;
  for (const level of company.atsKey.split(/[;,]/).map((l) => l.trim()).filter(Boolean)) {
    let seen = 0;
    for (let page = 1; page <= 25; page++) {
      if (requests) await sleep(500);
      const res = parseGoogle(company, await requestText(ctx, googleUrl(level, page)));
      requests++;
      jobs.push(...res.jobs);
      seen += res.jobs.length;
      if (!res.jobs.length || seen >= res.total) break;
      if (page === 25) complete = false;
    }
  }
  return { jobs: dedupe(jobs), complete, requests };
}

// ---------------------------------------------------------------------------
// Apple: https://jobs.apple.com/en-us/search?location=united-states-USA&team=internships-STDNT-INTRN
// The page embeds window.__staticRouterHydrationData = JSON.parse("...") with loaderData.search.
// Apple lists one row per location, so rows are merged by positionId.
// atsKey = Apple team keys, ";"-separated ("internships-STDNT-INTRN").
// ---------------------------------------------------------------------------

export function appleUrl(team: string, page: number): string {
  return `https://jobs.apple.com/en-us/search?location=united-states-USA&team=${encodeURIComponent(team)}${page > 1 ? `&page=${page}` : ""}`;
}

function appleLocation(l: Json): string {
  const city = str(l.city) ?? str(l.name) ?? "";
  const state = str(l.stateProvince) ?? str(l.state);
  return [city, state, "United States"].filter(Boolean).join(", ");
}

export function parseApple(company: Company, html: string): { jobs: NormalizedJob[]; total: number } {
  const m = html.match(/window\.__staticRouterHydrationData\s*=\s*JSON\.parse\("([\s\S]*?)"\);/);
  if (!m) throw new Error("Apple: job data not found in page");
  const search = (JSON.parse(JSON.parse(`"${m[1]}"`)) as { loaderData?: { search?: Json } }).loaderData?.search ?? {};
  const rows = (Array.isArray(search.searchResults) ? search.searchResults : []) as Json[];
  const byId = new Map<string, NormalizedJob>();
  for (const r of rows) {
    const id = String(r.positionId ?? r.id ?? "");
    if (!id) continue;
    const locs = Array.isArray(r.locations) ? (r.locations as Json[]).map(appleLocation).filter(Boolean) : [];
    const prev = byId.get(id);
    if (prev) {
      prev.locations = uniq([...prev.locations, ...locs]);
      continue;
    }
    const posted = str(r.postDateInGMT) ? new Date(String(r.postDateInGMT)) : null;
    byId.set(id, {
      companyId: company.id,
      externalId: id,
      title: String(r.postingTitle ?? "").trim(),
      url: `https://jobs.apple.com/en-us/details/${id}/${str(r.transformedPostingTitle) ?? ""}`,
      locations: locs,
      remote: locs.some(isRemoteText) || r.homeOffice === true,
      postedAt: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : null,
      department: str((r.team as Json | undefined)?.teamName),
      descriptionText: str(r.jobSummary),
      country: "US",
    });
  }
  return { jobs: [...byId.values()], total: typeof search.totalRecords === "number" ? search.totalRecords : rows.length };
}

export async function fetchApple(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const jobs: NormalizedJob[] = [];
  let requests = 0;
  for (const team of company.atsKey.split(/[;,]/).map((t) => t.trim()).filter(Boolean)) {
    let rowsSeen = 0;
    for (let page = 1; page <= 20; page++) {
      if (requests) await sleep(500);
      const html = await requestText(ctx, appleUrl(team, page));
      requests++;
      const res = parseApple(company, html);
      jobs.push(...res.jobs);
      rowsSeen += 20;
      if (!res.jobs.length || rowsSeen >= res.total) break;
    }
  }
  // Merge the same position found under two teams / pages.
  const merged = new Map<string, NormalizedJob>();
  for (const j of jobs) {
    const prev = merged.get(j.externalId);
    if (prev) prev.locations = uniq([...prev.locations, ...j.locations]);
    else merged.set(j.externalId, { ...j });
  }
  return { jobs: [...merged.values()], complete: true, requests };
}

// ---------------------------------------------------------------------------
// Eightfold career sites (Microsoft: apply.careers.microsoft.com, Netflix: explore.jobs.netflix.net).
// atsKey = "host|domain|query" e.g. "apply.careers.microsoft.com|microsoft.com|software engineer".
// Two API flavors: /api/pcsx/search (Microsoft) and /api/apply/v2/jobs (Netflix). 10 jobs per page and a
// strict rate limit, so pages are read slowly and a 429 just ends the read early (then nothing is closed).
// ---------------------------------------------------------------------------

export interface EightfoldKey {
  host: string;
  domain: string;
  query: string;
}

export function parseEightfoldKey(key: string): EightfoldKey | null {
  const [host, domain, query = ""] = key.split("|");
  return host && domain ? { host, domain, query } : null;
}

export function eightfoldUrl(k: EightfoldKey, flavor: "pcsx" | "v2", start: number): string {
  const q = `domain=${encodeURIComponent(k.domain)}&query=${encodeURIComponent(k.query)}&location=United%20States&start=${start}&num=10&sort_by=timestamp`;
  return flavor === "pcsx" ? `https://${k.host}/api/pcsx/search?${q}` : `https://${k.host}/api/apply/v2/jobs?${q}`;
}

export function parseEightfold(company: Company, k: EightfoldKey, data: unknown): { jobs: NormalizedJob[]; count: number } {
  const d = data as Json;
  const inner = (d.data as Json | undefined) ?? d; // pcsx wraps in { data }, v2 doesn't
  const positions = (Array.isArray(inner.positions) ? inner.positions : []) as Json[];
  const jobs = positions.map((p): NormalizedJob => {
    const locs = (Array.isArray(p.standardizedLocations) && p.standardizedLocations.length ? p.standardizedLocations : Array.isArray(p.locations) ? p.locations : [])
      .map((l) => String(l).replace(/,(?=\S)/g, ", "))
      .filter(Boolean);
    const ts = typeof p.postedTs === "number" ? p.postedTs : typeof p.t_create === "number" ? p.t_create : null;
    const path = str(p.positionUrl) ?? `/careers/job/${p.id}`;
    return {
      companyId: company.id,
      externalId: String(p.id),
      title: String(p.name ?? p.posting_name ?? "").trim(),
      url: str(p.canonicalPositionUrl) ?? `https://${k.host}${path.startsWith("/") ? "" : "/"}${path}`,
      locations: uniq(locs as string[]),
      remote: p.work_location_option === "remote" || p.workLocationOption === "remote" || (locs as string[]).some(isRemoteText),
      postedAt: ts ? new Date(ts * 1000).toISOString() : null,
      department: str(p.department),
      descriptionText: str(p.job_description) ? htmlToText(String(p.job_description)) : undefined,
      country: "US",
    };
  });
  return { jobs, count: typeof inner.count === "number" ? inner.count : jobs.length };
}

const EIGHTFOLD_MAX_PAGES = 40;

export async function fetchEightfold(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const k = parseEightfoldKey(company.atsKey);
  if (!k) throw new Error(`Eightfold key must be host|domain|query, got "${company.atsKey}"`);
  const jobs: NormalizedJob[] = [];
  let requests = 0;
  let flavor: "pcsx" | "v2" = "pcsx";
  let count = Infinity;
  let complete = false;
  for (let page = 0; page < EIGHTFOLD_MAX_PAGES; page++) {
    if (requests) await sleep(1_500);
    let data: unknown;
    try {
      data = await requestJson(ctx, eightfoldUrl(k, flavor, page * 10));
    } catch (e) {
      requests++;
      if (page === 0 && flavor === "pcsx" && e instanceof HttpError && (e.status === 403 || e.status === 404)) {
        flavor = "v2"; // this site only has the older API
        page--;
        continue;
      }
      if (page > 0 && e instanceof HttpError && e.status === 429) break; // rate-limited: keep what we have
      throw e;
    }
    requests++;
    const res = parseEightfold(company, k, data);
    count = res.count;
    jobs.push(...res.jobs);
    if (res.jobs.length < 10 || jobs.length >= count) {
      complete = true;
      break;
    }
  }
  return { jobs: dedupe(jobs), complete, requests };
}

// ---------------------------------------------------------------------------

function dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  for (const j of jobs) if (!seen.has(j.externalId)) seen.set(j.externalId, j);
  return [...seen.values()];
}

/** The public page for each of these boards (for the website's "Careers site" link). */
export function bigTechCareersUrl(ats: string, key: string): string | null {
  if (ats === "amazon") return "https://www.amazon.jobs/en/";
  if (ats === "google") return "https://www.google.com/about/careers/applications/jobs/results";
  if (ats === "apple") return "https://jobs.apple.com/en-us/search";
  if (ats === "eightfold") {
    const k = parseEightfoldKey(key);
    return k ? `https://${k.host}/careers` : null;
  }
  return null;
}
