import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText, uniq } from "./util.ts";
import type { DetailHints } from "../details.ts";

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
  employmentType?: string;
  compensation?: {
    summaryComponents?: AshbyComp[];
    compensationTiers?: { components?: AshbyComp[] }[];
  } | null;
}

interface AshbyComp {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

function ashbyHints(j: AshbyJob): DetailHints {
  const comps = [
    ...(j.compensation?.summaryComponents ?? []),
    ...(j.compensation?.compensationTiers ?? []).flatMap((t) => t.components ?? []),
  ];
  const c = comps.find((x) => x.compensationType === "Salary" && typeof x.minValue === "number" && typeof x.maxValue === "number");
  const period = c?.interval?.includes("HOUR") ? "hour" : c?.interval?.includes("YEAR") ? "year" : null;
  return {
    salary: c && period ? { min: c.minValue!, max: c.maxValue!, currency: c.currencyCode ?? "USD", period } : null,
    employmentTypeText: j.employmentType,
  };
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
        detailHints: ashbyHints(j),
      };
    });
}

export async function fetchAshby(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const data = await requestJson(ctx, ashbyUrl(company.atsKey));
  return { jobs: parseAshby(company, data), complete: true, requests: 1 };
}
