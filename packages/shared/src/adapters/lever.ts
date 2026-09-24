import type { Company, FetchResult, NormalizedJob } from "../types.ts";
import { requestJson, type HttpContext } from "../http.ts";
import { isRemoteText, uniq } from "./util.ts";

// GET https://api.lever.co/v0/postings/{slug}?mode=json  -> flat array
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number; // epoch ms
  workplaceType?: string; // "remote" | "hybrid" | "on-site" | "unspecified"
  country?: string;
  descriptionPlain?: string;
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
