import type { Company, FetchResult } from "../types.ts";
import type { HttpContext } from "../http.ts";
import { fetchGreenhouse } from "./greenhouse.ts";
import { fetchLever } from "./lever.ts";
import { fetchAshby } from "./ashby.ts";
import { fetchWorkday, type WorkdayOptions } from "./workday.ts";

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
    default: {
      const never: never = company.ats;
      throw new Error(`Unsupported ATS: ${String(never)}`);
    }
  }
}

export * from "./greenhouse.ts";
export * from "./lever.ts";
export * from "./ashby.ts";
export * from "./workday.ts";
