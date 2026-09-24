import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { htmlToText } from "../text.ts";
import { isRemoteText } from "./util.ts";

// GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | null;
  first_published?: string | null;
  updated_at?: string | null;
  content?: string | null;
  departments?: { name?: string }[];
  offices?: { name?: string; location?: string | null }[];
}

export function greenhouseUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
}

export function parseGreenhouse(company: Company, data: unknown): NormalizedJob[] {
  const jobs = (data as { jobs?: GhJob[] })?.jobs;
  if (!Array.isArray(jobs)) throw new Error("Greenhouse: response has no jobs[]");
  return jobs.map((j) => {
    const loc = j.location?.name?.trim();
    const locations = loc ? splitLocations(loc) : [];
    return {
      companyId: company.id,
      externalId: String(j.id),
      title: j.title.trim(),
      url: j.absolute_url,
      locations,
      remote: isRemoteText(loc ?? ""),
      postedAt: j.first_published ?? j.updated_at ?? null,
      department: j.departments?.[0]?.name ?? undefined,
      descriptionText: j.content ? htmlToText(j.content) : undefined,
    };
  });
}

/** "Boston, MA; South San Francisco, CA" or "Boston, MA or Remote" -> separate entries. */
function splitLocations(s: string): string[] {
  return s
    .split(/\s*(?:;|\||\bor\b|\/(?=\s*[A-Z]))\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function fetchGreenhouse(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const data = await requestJson(ctx, greenhouseUrl(company.atsKey));
  return { jobs: parseGreenhouse(company, data), complete: true, requests: 1 };
}

/** Single-job endpoint: 404 once the job is closed. Used for live checks. */
export function greenhouseJobUrl(token: string, id: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`;
}
