/**
 * The poller. One run = fetch every active company once, diff against what we've
 * seen, and write a report of new jobs.
 *
 *   npm run poll            live run (uses state/state.json)
 *   npm run poll:dry        offline run against /fixtures (uses out/dry-state.json)
 *   npm run poll -- --only=pfizer,gilead
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_FILTER,
  classifyJob,
  compareJobs,
  fetchCompanyJobs,
  mapLimit,
  matchesFilter,
  type ClassifiedJob,
  type Company,
  type FetchFn,
  type HttpContext,
} from "@job-radar/shared";
import { loadCompanies } from "./companies.ts";
import { ROOT, isMain } from "./paths.ts";
import { FIXTURE_COMPANIES, fixturesFetch, simulateNewPostings } from "./fixtures-fetch.ts";
import { renderMarkdown, type CompanyRunResult, type RunSummary } from "./report.ts";
import { applyFetch, loadState, needsFullSweep, recordFailure, saveState, type State } from "./store.ts";


export interface PollOptions {
  companies: Company[];
  fetch: FetchFn;
  state: State;
  now?: () => Date;
  concurrency?: number;
  /** Workday: pages of 20 to read on a partial (between full sweeps). */
  workdayPartialPages?: number;
  /** Workday: hours between full sweeps (full sweeps are what close jobs). */
  fullSweepHours?: number;
  jitterMs?: number;
  dryRun?: boolean;
  userAgent?: string;
}

export async function runPoll(opts: PollOptions): Promise<RunSummary> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const ctx: HttpContext = {
    fetch: opts.fetch,
    userAgent:
      opts.userAgent ??
      `job-radar/0.1 (personal job alerts; +https://github.com/${process.env.GITHUB_REPOSITORY ?? "job-radar"})`,
  };
  const active = opts.companies.filter((c) => c.active);
  const allNew: ClassifiedJob[] = [];

  const results = await mapLimit(active, opts.concurrency ?? 6, async (company): Promise<CompanyRunResult> => {
    if (opts.jitterMs) await new Promise((r) => setTimeout(r, Math.random() * opts.jitterMs!));
    const t0 = Date.now();
    const full = company.ats !== "workday" || needsFullSweep(opts.state, company, now(), opts.fullSweepHours ?? 3);
    const mode = full ? "full" : "partial";
    try {
      const res = await fetchCompanyJobs(ctx, company, {
        workday: { maxPages: full ? undefined : (opts.workdayPartialPages ?? 3), pageDelayMs: opts.dryRun ? 0 : 300 },
      });
      const applied = applyFetch(opts.state, company, res, now());
      for (const j of applied.newJobs) allNew.push({ ...j, ...classifyJob(j, company) });
      return {
        company,
        ok: true,
        mode,
        fetched: res.jobs.length,
        requests: res.requests,
        newCount: applied.newJobs.length,
        backlog: applied.backlog,
        closed: applied.closed.length,
        baselined: applied.baselined,
        suspiciousEmpty: applied.suspiciousEmpty,
        ms: Date.now() - t0,
      };
    } catch (err) {
      recordFailure(opts.state, company, err, now());
      return {
        company,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        mode,
        fetched: 0,
        requests: 0,
        newCount: 0,
        backlog: 0,
        closed: 0,
        baselined: false,
        suspiciousEmpty: false,
        ms: Date.now() - t0,
      };
    }
  });

  allNew.sort(compareJobs);
  return {
    startedAt,
    finishedAt: now().toISOString(),
    dryRun: opts.dryRun ?? false,
    results,
    allNew,
    matches: allNew.filter((j) => matchesFilter(j, DEFAULT_FILTER)),
  };
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

async function main() {
  const dryRun = arg("dry-run") === "true";
  const statePath = resolve(ROOT, arg("state") ?? (dryRun ? "out/dry-state.json" : "state/state.json"));
  const outDir = resolve(ROOT, "out");
  const only = arg("only")?.split(",").map((s) => s.trim());

  let companies = dryRun ? FIXTURE_COMPANIES : loadCompanies(join(ROOT, "seed/companies.csv"));
  if (only) companies = companies.filter((c) => only.includes(c.id));
  if (companies.length === 0) throw new Error("No companies to poll (check seed/companies.csv or --only).");

  const state = loadState(statePath);
  const summary = await runPoll({
    companies,
    state,
    dryRun,
    fetch: dryRun
      ? // After the first (baseline) dry run, inject a few fresh postings so the report has something to show.
        fixturesFetch(join(ROOT, "fixtures"), Object.keys(state.companies).length ? simulateNewPostings(new Date()) : undefined)
      : (globalThis.fetch as unknown as FetchFn),
    jitterMs: dryRun ? 0 : 2_000,
    workdayPartialPages: Number(process.env.WORKDAY_PARTIAL_PAGES ?? 3),
    fullSweepHours: Number(process.env.FULL_SWEEP_HOURS ?? 3),
  });
  saveState(statePath, state);

  const names = new Map(companies.map((c) => [c.id, c.name]));
  const md = renderMarkdown(summary, names);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.md"), md);
  writeFileSync(join(outDir, "new-jobs.json"), JSON.stringify({ ...summary, results: summary.results.map((r) => ({ ...r, company: r.company.id })) }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(md);

  // Fail the run (so GitHub emails Andy) only if most companies failed: that means something systemic.
  const failed = summary.results.filter((r) => !r.ok).length;
  if (failed > summary.results.length / 2) {
    console.error(`${failed}/${summary.results.length} companies failed.`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
