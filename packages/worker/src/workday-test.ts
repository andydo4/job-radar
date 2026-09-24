/**
 * Phase 0 risk check: can we read Workday boards from where this runs
 * (GitHub Actions or your PC), and how do they behave?
 *
 *   npm run workday-test
 *   npm run workday-test -- --url=https://gilead.wd1.myworkdayjobs.com/gileadcareers
 *
 * For each Workday company it checks:
 *  1. Page 0 works (status, latency, total jobs)        -> are we blocked?
 *  2. limit=100 returns zero jobs                        -> confirms the 20-per-page cap
 *  3. Are pages ordered newest-first?                    -> decides if partial sweeps are safe
 *  4. Does the single-job endpoint return a description? -> needed for degree parsing
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HttpError,
  WORKDAY_PAGE_SIZE,
  parseWorkdayKey,
  requestJson,
  workdayHost,
  workdayKeyFromUrl,
  workdayListUrl,
  type HttpContext,
  type WorkdayKey,
} from "@job-radar/shared";
import { loadCompanies } from "./companies.ts";
import { ROOT, isMain } from "./paths.ts";

interface WdPosting {
  title: string;
  externalPath: string;
  postedOn?: string;
}

export function postedDaysAgo(text: string | undefined): number | null {
  if (!text) return null;
  if (/today/i.test(text)) return 0;
  if (/yesterday/i.test(text)) return 1;
  const m = text.match(/(\d+)\+?\s*days?\s*ago/i);
  return m ? Number(m[1]) : null;
}

/** Share of adjacent pairs where the next posting is the same age or older. 1.0 = perfectly newest-first. */
export function newestFirstScore(days: (number | null)[]): number | null {
  const d = days.filter((x): x is number => x !== null);
  if (d.length < 5) return null;
  let ok = 0;
  for (let i = 1; i < d.length; i++) if (d[i]! >= d[i - 1]!) ok++;
  return ok / (d.length - 1);
}

async function page(ctx: HttpContext, k: WorkdayKey, offset: number, limit = WORKDAY_PAGE_SIZE) {
  const t0 = Date.now();
  const data = (await requestJson(ctx, workdayListUrl(k), {
    method: "POST",
    body: { appliedFacets: {}, limit, offset, searchText: "" },
  })) as { total?: number; jobPostings?: WdPosting[] };
  return { ms: Date.now() - t0, total: data.total ?? null, postings: data.jobPostings ?? [] };
}

async function testOne(ctx: HttpContext, label: string, k: WorkdayKey): Promise<string[]> {
  const lines = [`### ${label} (\`${k.tenant}|${k.wd}|${k.site}\`)`, ""];
  try {
    const p0 = await page(ctx, k, 0);
    lines.push(`- ✅ **Reachable**: page 0 returned ${p0.postings.length} jobs in ${p0.ms} ms. Board total: **${p0.total ?? "?"}**.`);
    if (p0.total) {
      const pages = Math.ceil(p0.total / WORKDAY_PAGE_SIZE);
      lines.push(`- Full sweep = **${pages} requests** (${WORKDAY_PAGE_SIZE}/page).${p0.total > 2000 ? " ⚠️ Over 2,000 jobs: full sweeps may hit Workday's pagination ceiling." : ""}`);
    }

    // Probe the page-size cap. Depending on the tenant, Workday answers limit=100 with
    // 200 + zero jobs, or with HTTP 400. Either way it just confirms the 20-per-page cap,
    // so this must never abort the rest of the test.
    try {
      const big = await page(ctx, k, 0, 100);
      lines.push(
        big.postings.length === 0
          ? "- ✅ limit=100 returns 0 jobs (confirms the 20-per-page cap; the adapter already uses 20)."
          : `- ℹ️ limit=100 returned ${big.postings.length} jobs (this tenant allows bigger pages).`,
      );
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 400)) throw err;
      lines.push("- ✅ limit=100 is rejected with HTTP 400 (confirms the 20-per-page cap; the adapter already uses 20).");
    }

    const p1 = await page(ctx, k, WORKDAY_PAGE_SIZE);
    const p2 = await page(ctx, k, WORKDAY_PAGE_SIZE * 2);
    const all = [...p0.postings, ...p1.postings, ...p2.postings];
    const days = all.map((p) => postedDaysAgo(p.postedOn));
    const score = newestFirstScore(days);
    const fresh = days.filter((d) => d !== null && d <= 1).length;
    lines.push(
      score === null
        ? "- ❓ Couldn't read posting ages to check sort order."
        : score >= 0.9
          ? `- ✅ **Newest first** (order score ${score.toFixed(2)}). Partial sweeps of the first 3 pages will catch new jobs. ${fresh} of the first ${all.length} were posted today/yesterday.`
          : `- ⚠️ **Not newest first** (order score ${score.toFixed(2)}). Partial sweeps could miss new jobs, so this company needs full sweeps (or a sort/facet parameter).`,
    );
    lines.push(`- First 5: ${p0.postings.slice(0, 5).map((p) => `${p.title} (${p.postedOn ?? "?"})`).join("; ")}`);

    const first = p0.postings[0];
    if (first) {
      const detail = (await requestJson(ctx, `${workdayHost(k)}/wday/cxs/${k.tenant}/${k.site}${first.externalPath}`)) as {
        jobPostingInfo?: { jobDescription?: string; startDate?: string };
      };
      const len = detail.jobPostingInfo?.jobDescription?.length ?? 0;
      lines.push(
        len > 0
          ? `- ✅ Job detail endpoint works (description ${len} chars${detail.jobPostingInfo?.startDate ? `, startDate ${detail.jobPostingInfo.startDate}` : ""}).`
          : "- ⚠️ Job detail endpoint returned no description.",
      );
    }
  } catch (err) {
    const blocked = err instanceof HttpError && [401, 403, 429].includes(err.status);
    lines.push(`- ❌ **${blocked ? "Blocked or rate-limited" : "Failed"}**: ${err instanceof Error ? err.message : String(err)}`);
  }
  lines.push("");
  return lines;
}

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
  const targets: { label: string; key: WorkdayKey }[] = [];
  if (urlArg) {
    const key = workdayKeyFromUrl(urlArg);
    if (!key) throw new Error(`Not a myworkdayjobs.com URL: ${urlArg}`);
    targets.push({ label: urlArg, key: parseWorkdayKey(key) });
  } else {
    for (const c of loadCompanies(join(ROOT, "seed/companies.csv"))) {
      if (c.ats === "workday") targets.push({ label: c.name, key: parseWorkdayKey(c.atsKey) });
    }
  }
  if (!targets.length) throw new Error("No Workday companies found in seed/companies.csv");

  const ctx: HttpContext = {
    fetch: globalThis.fetch as never,
    userAgent: `job-radar/0.1 (personal job alerts; +https://github.com/${process.env.GITHUB_REPOSITORY ?? "job-radar"})`,
  };
  const where = process.env.GITHUB_ACTIONS ? "GitHub Actions" : "this computer";
  const lines = [`## Workday test (from ${where})`, ""];
  for (const t of targets) {
    lines.push(...(await testOne(ctx, t.label, t.key)));
    await new Promise((r) => setTimeout(r, 1000));
  }
  const md = lines.join("\n");
  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(join(ROOT, "out/workday-test.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
