import type { Company, FetchResult } from "../types.ts";
import type { HttpContext } from "../http.ts";
import { fetchGreenhouse } from "./greenhouse.ts";
import { fetchLever } from "./lever.ts";
import { fetchAshby } from "./ashby.ts";
import { fetchWorkday, enrichWorkdayJob, type WorkdayOptions } from "./workday.ts";
import { fetchCareerSite, enrichCareerJob } from "./careersite.ts";
import type { NormalizedJob } from "../types.ts";

export interface FetchOptions {
  workday?: WorkdayOptions;
}

export function fetchCompanyJobs(
  ctx: HttpContext,
  company: Company,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  switch (company.ats) {
    case "greenhouse":
      return fetchGreenhouse(ctx, company);
    case "lever":
      return fetchLever(ctx, company);
    case "ashby":
      return fetchAshby(ctx, company);
    case "workday":
      return fetchWorkday(ctx, company, opts.workday);
    case "careersite":
      return fetchCareerSite(ctx, company);
    default: {
      const never: never = company.ats;
      throw new Error(`Unsupported ATS: ${String(never)}`);
    }
  }
}

/** Boards whose list has no description: each job needs one extra page read (new jobs + backfill). */
export function needsJobPage(ats: string, job: Pick<NormalizedJob, "descriptionText">): boolean {
  return (ats === "workday" || ats === "careersite") && !job.descriptionText;
}

/** Read a job's own page for the details the board's list left out. */
export function enrichJob(ctx: HttpContext, company: Company, job: NormalizedJob): Promise<NormalizedJob> {
  return company.ats === "careersite" ? enrichCareerJob(ctx, company, job) : enrichWorkdayJob(ctx, company, job);
}

export * from "./greenhouse.ts";
export * from "./lever.ts";
export * from "./ashby.ts";
export * from "./workday.ts";
export * from "./careersite.ts";
