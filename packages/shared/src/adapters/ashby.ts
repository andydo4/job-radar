import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText, uniq } from "./util.ts";

// GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl: string;
  department?: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string } };
}

export function ashbyUrl(board: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
}

export function parseAshby(company: Company, data: unknown): NormalizedJob[] {
  const jobs = (data as { jobs?: AshbyJob[] })?.jobs;
  if (!Array.isArray(jobs)) throw new Error("Ashby: response has no jobs[]");
  return jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locations = uniq([j.location ?? "", ...(j.secondaryLocations ?? []).map((s) => s.location ?? "")]);
      return {
        companyId: company.id,
        externalId: j.id,
        title: j.title.trim(),
        url: j.jobUrl,
        locations,
        remote: j.isRemote === true || j.workplaceType === "Remote" || locations.some(isRemoteText),
        postedAt: j.publishedAt ?? null,
        department: j.department ?? undefined,
        descriptionText: j.descriptionPlain ?? undefined,
        country: j.address?.postalAddress?.addressCountry || undefined,
      };
    });
}

export async function fetchAshby(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const data = await requestJson(ctx, ashbyUrl(company.atsKey));
  return { jobs: parseAshby(company, data), complete: true, requests: 1 };
}
