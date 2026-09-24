import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Company, FetchResult, NormalizedJob } from "@job-radar/shared";

/**
 * Phase 0 state: a JSON file of every job ID we've seen, per company.
 * In GitHub Actions it's carried between runs with actions/cache.
 * Phase 1 replaces this with the Supabase `jobs` table (same logic).
 */
export interface SeenJob {
  title: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Consecutive FULL sweeps this job was missing from. 2 => closed. */
  misses: number;
}

export interface CompanyState {
  baselinedAt: string | null;
  lastPolledAt: string | null;
  lastFullSweepAt: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  jobs: Record<string, SeenJob>;
}

export interface State {
  version: 1;
  companies: Record<string, CompanyState>;
}

export const MISSES_TO_CLOSE = 2;
/** A job first seen now but posted more than this long ago is backlog, not "new". */
export const MAX_NEW_AGE_DAYS = 7;

export function emptyState(): State {
  return { version: 1, companies: {} };
}

export function loadState(path: string): State {
  if (!existsSync(path)) return emptyState();
  const s = JSON.parse(readFileSync(path, "utf8")) as State;
  if (s.version !== 1) throw new Error(`Unknown state version in ${path}`);
  return s;
}

export function saveState(path: string, state: State): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path); // atomic-ish: never leave a half-written state file
}

function companyState(state: State, id: string): CompanyState {
  return (state.companies[id] ??= {
    baselinedAt: null,
    lastPolledAt: null,
    lastFullSweepAt: null,
    consecutiveFailures: 0,
    lastError: null,
    jobs: {},
  });
}

/** Is this job recent enough to count as "new" (vs. backlog we just hadn't seen)? */
export function looksFresh(job: NormalizedJob, now: Date): boolean {
  if (job.postedAt) {
    const ageDays = (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays)) return ageDays <= MAX_NEW_AGE_DAYS;
  }
  if (job.postedText) {
    // Workday: "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 30+ Days Ago"
    const m = job.postedText.match(/(\d+)\+?\s*days?\s*ago/i);
    if (m) return Number(m[1]) <= MAX_NEW_AGE_DAYS;
  }
  return true; // no date info: trust first-seen
}

export interface ApplyResult {
  newJobs: NormalizedJob[];
  /** Jobs seen for the first time but too old to be "new" (reposts, backlog, Workday page shifts). */
  backlog: number;
  closed: { externalId: string; title: string }[];
  baselined: boolean;
  /** Full sweep returned 0 jobs for a company that had many: likely a broken feed / ATS switch. */
  suspiciousEmpty: boolean;
}

/**
 * Merge one company's fetch into state and work out what's new / closed.
 * Pure apart from mutating `state`, so it's easy to test.
 */
export function applyFetch(state: State, company: Company, result: FetchResult, now: Date): ApplyResult {
  const cs = companyState(state, company.id);
  const iso = now.toISOString();
  cs.lastPolledAt = iso;
  cs.consecutiveFailures = 0;
  cs.lastError = null;

  const out: ApplyResult = { newJobs: [], backlog: 0, closed: [], baselined: false, suspiciousEmpty: false };

  // First-run guard: the first poll of a company records its existing jobs silently.
  if (!cs.baselinedAt) {
    for (const j of result.jobs) {
      cs.jobs[j.externalId] = { title: j.title, firstSeenAt: iso, lastSeenAt: iso, misses: 0 };
    }
    cs.baselinedAt = iso;
    if (result.complete) cs.lastFullSweepAt = iso;
    out.baselined = true;
    return out;
  }

  const previousCount = Object.keys(cs.jobs).length;
  const seenNow = new Set<string>();
  for (const j of result.jobs) {
    seenNow.add(j.externalId);
    const existing = cs.jobs[j.externalId];
    if (existing) {
      existing.lastSeenAt = iso;
      existing.misses = 0;
      existing.title = j.title;
    } else {
      cs.jobs[j.externalId] = { title: j.title, firstSeenAt: iso, lastSeenAt: iso, misses: 0 };
      if (looksFresh(j, now)) out.newJobs.push(j);
      else out.backlog++;
    }
  }

  if (result.complete) {
    if (result.jobs.length === 0 && previousCount > 5) {
      // Don't close everything because one response came back empty.
      out.suspiciousEmpty = true;
      return out;
    }
    cs.lastFullSweepAt = iso;
    for (const [id, seen] of Object.entries(cs.jobs)) {
      if (seenNow.has(id)) continue;
      seen.misses++;
      if (seen.misses >= MISSES_TO_CLOSE) {
        out.closed.push({ externalId: id, title: seen.title });
        delete cs.jobs[id];
      }
    }
  }
  return out;
}

export function recordFailure(state: State, company: Company, err: unknown, now: Date): CompanyState {
  const cs = companyState(state, company.id);
  cs.lastPolledAt = now.toISOString();
  cs.consecutiveFailures++;
  cs.lastError = err instanceof Error ? err.message : String(err);
  return cs;
}

export function needsFullSweep(state: State, company: Company, now: Date, fullSweepHours: number): boolean {
  const cs = state.companies[company.id];
  if (!cs?.baselinedAt || !cs.lastFullSweepAt) return true;
  return now.getTime() - new Date(cs.lastFullSweepAt).getTime() >= fullSweepHours * 3_600_000;
}
