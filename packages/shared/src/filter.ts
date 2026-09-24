import type { ClassifiedJob, RoleFamily, Seniority } from "./types.ts";

/**
 * A user's filter. In Phase 2 each person sets this during onboarding and it
 * lives in Supabase. Until then the poller uses DEFAULT_FILTER.
 */
export interface JobFilter {
  roleFamilies: RoleFamily[] | "all";
  seniorities: Seniority[];
  /** Include jobs whose location we couldn't determine (e.g. a bare "Remote" with no country). */
  includeUnknownLocation: boolean;
  excludeKeywords: string[];
}

/** Friend's starting profile: every biotech family + consulting + VC, entry level, US only (including US remote). */
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
  includeUnknownLocation: false,
  excludeKeywords: [],
};

/** Why a job doesn't match the filter, or null if it does. Shown in the report so nothing is hidden silently. */
export function hiddenReason(job: ClassifiedJob, f: JobFilter): string | null {
  if (job.isUS === false) return "outside US";
  if (job.isUS === null && !f.includeUnknownLocation) return "location unknown";
  if (f.roleFamilies !== "all" && !f.roleFamilies.includes(job.roleFamily)) return `${job.roleFamily} role`;
  if (!f.seniorities.includes(job.seniority)) return `${job.seniority} level`;
  const title = job.title.toLowerCase();
  const kw = f.excludeKeywords.find((k) => title.includes(k.toLowerCase()));
  if (kw) return `excluded keyword "${kw}"`;
  return null;
}

export function matchesFilter(job: ClassifiedJob, f: JobFilter): boolean {
  return hiddenReason(job, f) === null;
}

/** Sort: Boston/NYC first, then other tiers, then newest. */
export function compareJobs(a: ClassifiedJob, b: ClassifiedJob): number {
  const ta = a.metroTier ?? 9;
  const tb = b.metroTier ?? 9;
  if (ta !== tb) return ta - tb;
  return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
}
