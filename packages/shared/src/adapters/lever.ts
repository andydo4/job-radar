import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText, uniq } from "./util.ts";
import { listItemsFromHtml, type DetailHints } from "../details.ts";

// GET https://api.lever.co/v0/postings/{slug}?mode=json  -> flat array
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number; // epoch ms
  workplaceType?: string; // "remote" | "hybrid" | "on-site" | "unspecified"
  country?: string;
  descriptionPlain?: string;
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number } | null;
  lists?: { text?: string; content?: string }[];
  categories?: {
    location?: string;
    allLocations?: string[];
    team?: string;
    department?: string;
    commitment?: string;
  };
}

export function leverUrl(slug: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
}

function leverHints(p: LeverPosting): DetailHints {
  const r = p.salaryRange;
  const period = r?.interval?.includes("hour") ? "hour" : r?.interval?.includes("year") ? "year" : null;
  const reqLists = (p.lists ?? [])
    .filter((l) => /requirement|qualification|looking for|you have|you bring|about you|need/i.test(l.text ?? ""))
    .map((l) => listItemsFromHtml(l.content ?? ""))
    .filter((l) => l.length);
  return {
    salary:
      r && period && typeof r.min === "number" && typeof r.max === "number"
        ? { min: r.min, max: r.max, currency: r.currency ?? "USD", period }
        : null,
    employmentTypeText: p.categories?.commitment,
    requirementLists: reqLists,
  };
}

export function parseLever(company: Company, data: unknown): NormalizedJob[] {
  if (!Array.isArray(data)) throw new Error("Lever: expected an array of postings");
  return (data as LeverPosting[]).map((p) => {
    const cats = p.categories ?? {};
    const locations = uniq([...(cats.allLocations ?? []), cats.location ?? ""]);
    return {
      companyId: company.id,
      externalId: p.id,
      title: p.text.trim(),
      url: p.hostedUrl,
      locations,
      remote: p.workplaceType === "remote" || locations.some(isRemoteText),
      postedAt: typeof p.createdAt === "number" ? new Date(p.createdAt).toISOString() : null,
      department: cats.department ?? cats.team ?? undefined,
      descriptionText: p.descriptionPlain ?? undefined,
      country: p.country || undefined,
      detailHints: leverHints(p),
    };
  });
}

export async function fetchLever(ctx: HttpContext, company: Company): Promise<FetchResult> {
  const data = await requestJson(ctx, leverUrl(company.atsKey));
  return { jobs: parseLever(company, data), complete: true, requests: 1 };
}

export function leverJobUrl(slug: string, id: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`;
}
