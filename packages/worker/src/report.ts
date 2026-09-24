import { DEFAULT_FILTER, hiddenReason, type ClassifiedJob, type Company } from "@job-radar/shared";

export interface CompanyRunResult {
  company: Company;
  ok: boolean;
  error?: string;
  mode: "full" | "partial";
  fetched: number;
  requests: number;
  newCount: number;
  backlog: number;
  closed: number;
  baselined: boolean;
  suspiciousEmpty: boolean;
  ms: number;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  results: CompanyRunResult[];
  /** New jobs that pass the default filter, sorted (tier, then newest). */
  matches: ClassifiedJob[];
  /** All new jobs, including ones the filter hid. */
  allNew: ClassifiedJob[];
}

const TIER_LABEL: Record<string, string> = { "1": "Boston / NYC", "2": "East & West Coast / US remote", "3": "Rest of US", null: "Location unknown" };

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Group one role posted in several cities into one line. */
export function groupByRole(jobs: ClassifiedJob[]): ClassifiedJob[][] {
  const groups = new Map<string, ClassifiedJob[]>();
  for (const j of jobs) {
    const g = groups.get(j.dedupeKey);
    if (g) g.push(j);
    else groups.set(j.dedupeKey, [j]);
  }
  return [...groups.values()];
}

export function renderMarkdown(s: RunSummary, companyNames: Map<string, string>): string {
  const ok = s.results.filter((r) => r.ok);
  const failed = s.results.filter((r) => !r.ok);
  const requests = s.results.reduce((n, r) => n + r.requests, 0);
  const lines: string[] = [];

  lines.push(`## Job Radar run${s.dryRun ? " (dry run, fixtures)" : ""}`);
  lines.push("");
  lines.push(
    `${s.finishedAt} · ${ok.length}/${s.results.length} companies OK · ${requests} requests · ` +
      `**${s.matches.length} new matches** (${s.allNew.length} new jobs total)`,
  );
  lines.push("");

  if (s.matches.length) {
    lines.push("### New matches (default filter)");
    lines.push("");
    lines.push("| Company | Role | Family | Level | Location | Posted |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const group of groupByRole(s.matches)) {
      const j = group[0]!;
      const locs = [...new Set(group.flatMap((g) => (g.locations.length ? g.locations : [g.remote ? "Remote" : "?"])))];
      const locText = locs.length > 3 ? `${locs.slice(0, 3).join("; ")} +${locs.length - 3}` : locs.join("; ");
      const posted = j.postedAt ? j.postedAt.slice(0, 10) : j.postedText ?? "";
      const title = group.length > 1 ? `${j.title} (${group.length} listings)` : j.title;
      lines.push(
        `| ${esc(companyNames.get(j.companyId) ?? j.companyId)} | [${esc(title)}](${j.url}) | ${j.roleFamily} | ${j.seniority}${
          j.degreeMin ? ` · ${j.degreeMin.toUpperCase()}` : ""
        } | ${esc(locText)} · _${TIER_LABEL[String(j.metroTier)]}_ | ${esc(posted)} |`,
      );
    }
    lines.push("");
  }

  const hidden = s.allNew.length - s.matches.length;
  if (hidden > 0) {
    lines.push(`<details><summary>${hidden} other new jobs hidden by the filter</summary>`);
    lines.push("");
    for (const j of s.allNew.filter((x) => !s.matches.includes(x))) {
      const where = j.locations.join("; ") || (j.remote ? "Remote" : "?");
      lines.push(
        `- **${hiddenReason(j, DEFAULT_FILTER) ?? "hidden"}**: ${esc(companyNames.get(j.companyId) ?? j.companyId)}, [${esc(j.title)}](${j.url}) (${esc(where)}${j.country ? `, ${esc(j.country)}` : ""})`,
      );
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push("### Companies");
  lines.push("");
  lines.push("| Company | ATS | Status | Sweep | Jobs | New | Backlog | Closed | Requests | Time |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of s.results) {
    const status = !r.ok
      ? `❌ ${esc(r.error ?? "error").slice(0, 80)}`
      : r.suspiciousEmpty
        ? "⚠️ empty feed (not closing jobs)"
        : r.baselined
          ? "🆕 baselined"
          : "✅";
    lines.push(
      `| ${esc(r.company.name)} | ${r.company.ats} | ${status} | ${r.mode} | ${r.fetched} | ${r.newCount} | ${r.backlog} | ${r.closed} | ${r.requests} | ${(r.ms / 1000).toFixed(1)}s |`,
    );
  }
  if (failed.length) {
    lines.push("");
    lines.push(`**${failed.length} companies failed.** Check the errors above; 404 usually means the board slug is wrong.`);
  }
  lines.push("");
  return lines.join("\n");
}
