import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestText, type HttpContext } from "../http.ts";
import { decodeEntities, htmlToText } from "../text.ts";
import { isRemoteText } from "./util.ts";
import type { Salary } from "../details.ts";

/**
 * Companies that run their own careers site (AbbVie, Bayer, Boehringer Ingelheim, ...).
 * We don't scrape their search pages (robots.txt usually forbids that). Instead we read the
 * public job feed every such site publishes for search engines:
 *
 * - an RSS feed (SAP SuccessFactors "Career Site Builder", e.g. jobs.bayer.com/sitemap.xml):
 *   every job with title, location and full description in one download;
 * - or a sitemap listing every job page (e.g. careers.abbvie.com/en/vacanciessitemap.xml):
 *   the list has only links, so each NEW job's page is opened once and read from the
 *   schema.org JobPosting data it embeds for Google Jobs (JSON-LD or microdata).
 *
 * companies.csv ats_key = the feed URL.
 */

const JOB_PAGE = /\/jobs?\//i;
const MAX_CHILD_SITEMAPS = 10;

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return undefined;
  return m[1]!.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) => a.toUpperCase() + b);

/** "Trebes, Aude, FR" -> "FR"; "North Chicago, IL" -> undefined (a US state, handled by the classifier). */
function countryFromLocation(loc: string): string | undefined {
  const last = loc.split(",").pop()?.trim() ?? "";
  return /^[A-Z]{2}$/.test(last) && loc.split(",").length >= 3 ? last : undefined;
}

// ---------------------------------------------------------------------------
// Feed / sitemap
// ---------------------------------------------------------------------------

export function parseRssFeed(company: Company, xml: string): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1]!;
    const link = decodeEntities(tag(item, "link") ?? "");
    const id = tag(item, "g:id") ?? tag(item, "guid") ?? link;
    if (!link || !id) continue;
    const location = decodeEntities(tag(item, "g:location") ?? "").trim();
    let title = decodeEntities(tag(item, "title") ?? "").trim();
    // SuccessFactors appends " (City, Region, CC)" to titles.
    if (location && title.endsWith(`(${location})`)) title = title.slice(0, -location.length - 2).trim();
    title = title.replace(/\s+-\s*$/, "");
    const description = tag(item, "description");
    jobs.push({
      companyId: company.id,
      externalId: id,
      title,
      url: link,
      locations: location ? [location] : [],
      remote: isRemoteText(location),
      postedAt: null,
      department: decodeEntities(tag(item, "g:job_function") ?? "") || undefined,
      descriptionText: description ? htmlToText(description) : undefined,
      country: countryFromLocation(location),
    });
  }
  return jobs;
}

/**
 * A job page link -> a first guess at title and location, until the page itself is read.
 * AbbVie style: /en/job/{title}-in-{city}-{st}-jid-{n}
 */
export function guessFromJobUrl(url: string): { title: string; locations: string[] } {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    path = url;
  }
  const parts = path.split("/").filter(Boolean);
  const jobIdx = parts.findIndex((p) => /^jobs?$/i.test(p));
  let slug = (parts.slice(jobIdx + 1).find((p) => /[a-z]{3}/i.test(p) && !/^\d+$/.test(p)) ?? parts.at(-1) ?? "").replace(/-jid-\d+$/i, "");
  let locations: string[] = [];
  const at = slug.lastIndexOf("-in-");
  if (at > 0) {
    const loc = slug.slice(at + 4).split("-");
    const state = loc.at(-1) ?? "";
    if (/^[a-z]{2}$/i.test(state) && loc.length >= 2) locations = [`${titleCase(loc.slice(0, -1).join(" "))}, ${state.toUpperCase()}`];
    else locations = [titleCase(loc.join(" "))];
    slug = slug.slice(0, at);
  }
  return { title: titleCase(slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()), locations };
}

export function parseSitemapUrls(xml: string): { pages: string[]; children: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!));
  if (/<sitemapindex/i.test(xml)) return { pages: [], children: locs };
  return { pages: locs.filter((u) => JOB_PAGE.test(new URL(u, "https://x").pathname)), children: [] };
}

export async function fetchCareerSite(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const xml = await requestText(ctx, company.atsKey);
  let requests = 1;
  if (/<item>/i.test(xml)) return { jobs: parseRssFeed(company, xml), complete: true, requests };

  let { pages, children } = parseSitemapUrls(xml);
  for (const child of children.slice(0, MAX_CHILD_SITEMAPS)) {
    const sub = parseSitemapUrls(await requestText(ctx, child));
    requests++;
    pages = pages.concat(sub.pages);
  }
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  for (const url of pages) {
    if (seen.has(url)) continue;
    seen.add(url);
    const g = guessFromJobUrl(url);
    jobs.push({
      companyId: company.id,
      externalId: url,
      title: g.title,
      url,
      locations: g.locations,
      remote: g.locations.some(isRemoteText),
      postedAt: null,
    });
  }
  if (jobs.length === 0) throw new Error("Careers site: the feed had no job links (did the site change?)");
  return { jobs, complete: children.length <= MAX_CHILD_SITEMAPS, requests };
}

// ---------------------------------------------------------------------------
// One job page: schema.org JobPosting (JSON-LD first, microdata second)
// ---------------------------------------------------------------------------

export interface CareerJobPage {
  title?: string;
  descriptionText?: string;
  locations: string[];
  country?: string;
  postedAt?: string;
  employmentTypeText?: string;
  salary?: Salary | null;
}

type Json = Record<string, unknown>;

function findJobPosting(node: unknown): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const o = node as Json;
  const type = o["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return o;
  return findJobPosting(o["@graph"]);
}

function isoDate(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** The whole element starting at `start` (an opening tag), balancing nested tags of the same name. */
export function balancedElement(html: string, start: number): string {
  const open = html.slice(start).match(/^<([a-z0-9]+)/i);
  if (!open) return "";
  const name = open[1]!;
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start, start + 60_000);
}

function metaItemprop(html: string, prop: string): string | undefined {
  const m =
    html.match(new RegExp(`<meta[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) ??
    html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*itemprop=["']${prop}["']`, "i"));
  return m ? decodeEntities(m[1]!).trim() : undefined;
}

function salaryFromLd(v: unknown): Salary | null {
  const s = v as { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } } | undefined;
  const val = s?.value;
  if (!val) return null;
  const min = Number(val.minValue ?? val.value);
  const max = Number(val.maxValue ?? val.value);
  const unit = (val.unitText ?? "").toUpperCase();
  const period = unit.startsWith("HOUR") ? "hour" : unit.startsWith("YEAR") ? "year" : null;
  if (!period || !Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return null;
  return { min, max, currency: s?.currency ?? "USD", period };
}

export function parseCareerJobPage(html: string): CareerJobPage {
  // 1. JSON-LD
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const jp = findJobPosting(data);
    if (!jp) continue;
    const places = ([] as unknown[]).concat(jp.jobLocation ?? []);
    const locations: string[] = [];
    let country: string | undefined;
    for (const p of places) {
      const a = (p as { address?: Json })?.address ?? {};
      const locality = typeof a.addressLocality === "string" ? a.addressLocality.trim() : "";
      const region = typeof a.addressRegion === "string" ? a.addressRegion.trim() : "";
      const c = a.addressCountry;
      country ??= typeof c === "string" ? c : typeof (c as Json)?.name === "string" ? ((c as Json).name as string) : undefined;
      const loc = locality && region && !locality.includes(region) ? `${locality}, ${region}` : locality || region;
      if (loc && !locations.includes(loc)) locations.push(loc);
    }
    if (jp.jobLocationType === "TELECOMMUTE") locations.push("Remote");
    const employment = ([] as unknown[]).concat(jp.employmentType ?? []).filter((x) => typeof x === "string").join(", ");
    return {
      title: typeof jp.title === "string" ? decodeEntities(jp.title).trim() : undefined,
      descriptionText: typeof jp.description === "string" ? htmlToText(jp.description) : undefined,
      locations,
      country: country && country.length > 2 ? country : country && /^[A-Z]{2}$/.test(country) ? country : undefined,
      postedAt: isoDate(jp.datePosted),
      employmentTypeText: employment || undefined,
      salary: salaryFromLd(jp.baseSalary),
    };
  }

  // 2. Microdata (SuccessFactors Career Site Builder)
  const titleEl = html.search(/<[a-z]+[^>]*itemprop=["']title["']/i);
  const og = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1];
  const title = titleEl >= 0 ? htmlToText(balancedElement(html, titleEl)) : og ? decodeEntities(og) : undefined;
  let descStart = html.search(/<[a-z]+[^>]*class=["'][^"']*\bjobdescription\b[^"']*["']/i);
  if (descStart < 0) descStart = html.search(/<[a-z]+[^>]*itemprop=["']description["']/i);
  const locality = metaItemprop(html, "addressLocality");
  const region = metaItemprop(html, "addressRegion");
  const loc = locality && region && /^[A-Z]{2}$/.test(region) && !locality.includes(region) ? `${locality}, ${region}` : locality;
  return {
    title: title?.trim() || undefined,
    descriptionText: descStart >= 0 ? htmlToText(balancedElement(html, descStart)) : undefined,
    locations: loc ? [loc] : [],
    postedAt: isoDate(metaItemprop(html, "datePosted")),
    employmentTypeText: metaItemprop(html, "employmentType"),
  };
}

/** Open a careers-site job page once and fill in the real title, location, description, pay. */
export async function enrichCareerJob(ctx: HttpContext, _company: Company, job: NormalizedJob): Promise<NormalizedJob> {
  const d = parseCareerJobPage(await requestText(ctx, job.url));
  return {
    ...job,
    title: d.title || job.title,
    descriptionText: d.descriptionText ?? job.descriptionText,
    locations: d.locations.length ? d.locations : job.locations,
    country: d.country ?? job.country,
    remote: job.remote || d.locations.some(isRemoteText),
    postedAt: job.postedAt ?? d.postedAt ?? null,
    detailHints: {
      ...job.detailHints,
      salary: d.salary ?? job.detailHints?.salary,
      employmentTypeText: d.employmentTypeText ?? job.detailHints?.employmentTypeText,
    },
  };
}
