import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Company, FetchFn } from "@job-radar/shared";

/** Companies used by `npm run poll:dry` — they map onto the files in /fixtures. */
export const FIXTURE_COMPANIES: Company[] = [
  { id: "example-gh", name: "Example Bio (Greenhouse)", ats: "greenhouse", atsKey: "examplebio", segment: "biotech", active: true },
  { id: "example-lever", name: "Example Lever Bio", ats: "lever", atsKey: "examplelever", segment: "biotech", active: true },
  { id: "example-ashby", name: "Example Consulting (Ashby)", ats: "ashby", atsKey: "exampleashby", segment: "consulting", active: true },
  { id: "example-wd", name: "Example Pharma (Workday)", ats: "workday", atsKey: "examplepharma|wd1|Careers", segment: "pharma", active: true },
];

/**
 * Adds a few "just posted" jobs to the fixtures so repeated dry runs show what
 * a new posting looks like in the report. IDs are unique per call.
 */
export function simulateNewPostings(now: Date): (file: string, data: any) => any {
  const stamp = now.getTime();
  const iso = now.toISOString();
  return (file, data) => {
    if (file === "greenhouse.json") {
      data.jobs.push(
        {
          id: stamp,
          title: "Research Associate I, Molecular Biology",
          absolute_url: `https://job-boards.greenhouse.io/examplebio/jobs/${stamp}`,
          location: { name: "Cambridge, MA" },
          first_published: iso,
          updated_at: iso,
          content: "&lt;p&gt;BS in Biology or related field.&lt;/p&gt;",
        },
        {
          id: stamp + 1,
          title: "Director, Translational Medicine",
          absolute_url: `https://job-boards.greenhouse.io/examplebio/jobs/${stamp + 1}`,
          location: { name: "Boston, MA" },
          first_published: iso,
          updated_at: iso,
          content: "",
        },
      );
    }
    if (file === "ashby.json") {
      data.jobs.push({
        id: `sim-${stamp}`,
        title: "Business Analyst",
        location: "New York, NY",
        publishedAt: iso,
        isListed: true,
        jobUrl: `https://jobs.ashbyhq.com/exampleashby/sim-${stamp}`,
      });
    }
    return data;
  };
}

/**
 * A fake fetch that serves /fixtures instead of the network, so the whole
 * pipeline can be exercised offline. `variant` lets tests simulate a later poll.
 */
export function fixturesFetch(fixturesDir: string, mutate?: (file: string, data: any) => any): FetchFn {
  const load = (file: string) => {
    const data = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
    return mutate ? mutate(file, data) : data;
  };
  return async (url, init) => {
    const host = new URL(url).hostname;
    let data: unknown;
    if (host === "boards-api.greenhouse.io") data = load("greenhouse.json");
    else if (host === "api.lever.co") data = load("lever.json");
    else if (host === "api.ashbyhq.com") data = load("ashby.json");
    else if (host.endsWith(".myworkdayjobs.com") && (init?.method ?? "GET") === "GET") data = load("workday-detail.json");
    else if (host.endsWith(".myworkdayjobs.com")) {
      const offset = JSON.parse(init?.body ?? "{}").offset ?? 0;
      const page = offset / 20;
      data = page <= 1 ? load(`workday-page${page}.json`) : { total: 0, jobPostings: [] };
    } else {
      return { status: 404, json: async () => ({}) };
    }
    return { status: 200, json: async () => data };
  };
}
