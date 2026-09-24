import type { ClassifiedJob, RoleFamily, Seniority } from "./types.ts";

/**
 * A user's filter. In Phase 2 each person sets this during onboarding and it
 * lives in Supabase. Until then the poller uses DEFAULT_FILTER.
 */
export interface JobFilter {
  roleFamilies: RoleFamily[] | "all";
  seniorities: Seniority[];
  /** Include jobs whose location we couldn't determine (e.g. Workday "3 Locations"). */
  includeUnknownLocation: boolean;
  excludeKeywords: string[];
}

/** Friend's starting profile: every biotech family + consulting + VC, entry level, anywhere in the US or remote. */
export const DEFAULT_FILTER: JobFilter = {
  roleFamilies: [
    "research",
    "process",
    "quality",
    "clinical",
    "regulatory",
    "compbio",
    "engineering",
    "commercial",
    "consulting",
    "vc",
  ],
  seniorities: ["intern", "entry", "unspecified"],
  includeUnknownLocation: true,
  excludeKeywords: [],
};

export function matchesFilter(job: ClassifiedJob, f: JobFilter): boolean {
  if (job.isUS === false) return false;
  if (job.isUS === null && !f.includeUnknownLocation) return false;
  if (f.roleFamilies !== "all" && !f.roleFamilies.includes(job.roleFamily)) return false;
  if (!f.seniorities.includes(job.seniority)) return false;
  const title = job.title.toLowerCase();
  if (f.excludeKeywords.some((k) => title.includes(k.toLowerCase()))) return false;
  return true;
}

/** Sort: Boston/NYC first, then other tiers, then newest. */
export function compareJobs(a: ClassifiedJob, b: ClassifiedJob): number {
  const ta = a.metroTier ?? 9;
  const tb = b.metroTier ?? 9;
  if (ta !== tb) return ta - tb;
  return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
}
