/**
 * The poller. One run = fetch every active company once, diff against what we've
 * seen, and write a report of new jobs.
 *
 *   npm run poll            live run. Uses Supabase when SUPABASE_URL + SUPABASE_SECRET_KEY are set
 *                           (GitHub Actions), otherwise state/state.json.
 *   npm run poll:dry        offline run against /fixtures (uses out/dry-state.json, never the database)
 *   npm run poll -- --only=pfizer,gilead
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEFAULT_FILTER,
  classifyJob,
  compareJobs,
  enrichWorkdayJob,
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
import { applyPlan, backfillDetails, dbFromEnv, planPersist, stateFromDb } from "./db.ts";


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
  /** Max Workday detail-page lookups per company per run (new jobs only). */
  maxWorkdayDetails?: number;
  dryRun?: boolean;
  userAgent?: string;
}

export function makeCtx(fetch: FetchFn, userAgent?: string): HttpContext {
  return {
    fetch,
    userAgent:
      userAgent ?? `job-radar/0.1 (personal job alerts; +https://github.com/${process.env.GITHUB_REPOSITORY ?? "job-radar"})`,
  };
}

export async function runPoll(opts: PollOptions): Promise<RunSummary> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const ctx = makeCtx(opts.fetch, opts.userAgent);
  const active = opts.companies.filter((c) => c.active);
  const allNew: ClassifiedJob[] = [];
  const fetched = new Map<string, ClassifiedJob[]>();
  const newKeys = new Set<string>();

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

      // Workday's list only has title + a vague location ("3 Locations"). For NEW jobs only,
      // read the detail page to get the country (US-only filter), all locations, and the description.
      let fresh = applied.newJobs;
      let detailRequests = 0;
      if (company.ats === "workday" && fresh.length) {
        const max = opts.maxWorkdayDetails ?? 25;
        const enriched = await mapLimit(fresh.slice(0, max), 2, async (j) => {
          detailRequests++;
          try {
            return await enrichWorkdayJob(ctx, company, j);
          } catch {
            return j; // keep the job; it just stays "location unknown"
          }
        });
        fresh = [...enriched, ...fresh.slice(max)];
      }
      const enrichedById = new Map(fresh.map((j) => [j.externalId, j]));
      const classified = res.jobs.map((raw) => {
        const j = enrichedById.get(raw.externalId) ?? raw;
        return { ...j, ...classifyJob(j, company) };
      });
      fetched.set(company.id, classified);
      for (const j of classified) {
        if (enrichedById.has(j.externalId)) {
          allNew.push(j);
          newKeys.add(`${company.id}::${j.externalId}`);
        }
      }
      return {
        company,
        ok: true,
        mode,
        fetched: res.jobs.length,
        requests: res.requests + detailRequests,
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
    fetched,
    newKeys,
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

  const allCompanies = dryRun ? FIXTURE_COMPANIES : loadCompanies(join(ROOT, "seed/companies.csv"));
  const companies = only ? allCompanies.filter((c) => only.includes(c.id)) : allCompanies;
  if (companies.length === 0) throw new Error("No companies to poll (check seed/companies.csv or --only).");

  // Phase 1: remember jobs in Supabase when the secret is available (GitHub Actions); otherwise a local file.
  const db = dryRun ? null : dbFromEnv();
  const state = db ? stateFromDb(await db.loadCompanies(), await db.loadOpenJobs()) : loadState(statePath);
  const before: State = structuredClone(state);
  console.log(db ? "Storage: Supabase" : `Storage: ${statePath}`);

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

  if (db) {
    const plan = planPersist(companies, before, state, summary.fetched, summary.newKeys, summary.finishedAt);
    const runUrl =
      process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
        ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null;
    await applyPlan(db, plan, only ? allCompanies.map((c) => c.id) : companies.map((c) => c.id), {
      started_at: summary.startedAt,
      finished_at: summary.finishedAt,
      companies_ok: summary.results.filter((r) => r.ok).length,
      companies_failed: summary.results.filter((r) => !r.ok).length,
      new_jobs: summary.allNew.length,
      new_matches: summary.matches.length,
      closed_jobs: summary.results.reduce((n, r) => n + r.closed, 0),
      requests: summary.results.reduce((n, r) => n + r.requests, 0),
      github_run_url: runUrl,
    });
    // Fill in pay / experience / requirements for older jobs, a batch per run.
    const bf = await backfillDetails(db, makeCtx(globalThis.fetch as unknown as FetchFn), companies, summary.fetched, {
      limit: Number(process.env.DETAILS_BACKFILL_LIMIT ?? 300),
      maxWorkdayFetches: Number(process.env.DETAILS_WORKDAY_FETCHES ?? 40),
    });
    console.log(`Details: ${bf.updated} jobs updated (${bf.fetchedDetails} Workday detail pages)${bf.remaining ? ", more next run" : ""}.`);
    console.log(
      `Saved to Supabase: ${plan.inserts.length} jobs inserted, ${[...plan.touches.values()].reduce((n, t) => n + t.ids.length, 0)} re-seen, ` +
        `${[...plan.closed.values()].reduce((n, c) => n + c.length, 0)} closed.`,
    );
  } else {
    saveState(statePath, state);
  }

  const names = new Map(companies.map((c) => [c.id, c.name]));
  const md = renderMarkdown(summary, names);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "report.md"), md);
  const { fetched: _f, newKeys: _k, ...json } = summary;
  writeFileSync(join(outDir, "new-jobs.json"), JSON.stringify({ ...json, results: summary.results.map((r) => ({ ...r, company: r.company.id })) }, null, 2));
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
