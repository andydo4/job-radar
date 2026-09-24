/**
 * Finds each company's ATS board automatically, so you don't have to look up
 * 150 companies by hand.
 *
 *   npm run discover                 probe everything in seed/candidates.csv
 *   npm run discover -- --write      also append the hits to seed/companies.csv
 *
 * For each candidate it tries a handful of slug guesses ("Moderna Therapeutics" ->
 * modernatherapeutics, moderna-therapeutics, moderna, modernatx...) against the
 * Greenhouse, Ashby and Lever APIs. A candidate with a careers_url skips guessing.
 * Workday can't be guessed: paste a *.myworkdayjobs.com link into careers_url.
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  HttpError,
  ashbyUrl,
  greenhouseUrl,
  leverUrl,
  mapLimit,
  requestJson,
  workdayKeyFromUrl,
  type Ats,
  type HttpContext,
} from "@job-radar/shared";
import { parseCsv } from "./companies.ts";
import { ROOT, isMain } from "./paths.ts";

const SUFFIXES = new Set([
  "inc", "corp", "corporation", "co", "llc", "ltd", "plc", "the", "company", "group", "holdings",
  "therapeutics", "therapeutic", "tx", "bio", "biosciences", "bioscience", "biotherapeutics",
  "pharmaceuticals", "pharmaceutical", "pharma", "biotechnology", "biotech", "sciences", "labs",
  "laboratories", "health", "partners", "associates", "medicines", "biologics", "genomics",
]);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug guesses in the order most likely to hit. */
export function slugVariants(name: string): string[] {
  const words = slugify(name).split("-").filter(Boolean);
  const core = words.filter((w) => !SUFFIXES.has(w));
  const out = [
    words.join(""),
    words.join("-"),
    core.join(""),
    core.join("-"),
    core[0] ?? "",
    `${core.join("")}tx`,
    `${core.join("")}bio`,
    `${core.join("")}inc`,
  ];
  return [...new Set(out.filter((s) => s.length >= 2))];
}

/** Recognize a pasted careers link. */
export function keyFromCareersUrl(url: string): { ats: Ats; key: string } | null {
  const wd = workdayKeyFromUrl(url);
  if (wd) return { ats: "workday", key: wd };
  let m = url.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
  if (m?.[1]) return { ats: "greenhouse", key: m[1] };
  m = url.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (m?.[1]) return { ats: "lever", key: m[1] };
  m = url.match(/jobs\.ashbyhq\.com\/([a-z0-9._-]+)/i);
  if (m?.[1]) return { ats: "ashby", key: m[1] };
  return null;
}

async function countJobs(ctx: HttpContext, ats: Exclude<Ats, "workday">, slug: string): Promise<number | null> {
  const url = ats === "greenhouse" ? greenhouseUrl(slug).replace("?content=true", "") : ats === "ashby" ? ashbyUrl(slug) : leverUrl(slug);
  try {
    const data = await requestJson(ctx, url);
    if (ats === "lever") return Array.isArray(data) ? data.length : null;
    const jobs = (data as { jobs?: unknown[] })?.jobs;
    return Array.isArray(jobs) ? jobs.length : null;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 400 || err.status === 403)) return null;
    throw err;
  }
}

export interface Hit {
  name: string;
  segment: string;
  ats: Ats;
  key: string;
  jobs: number | null;
}

export async function discoverOne(ctx: HttpContext, name: string, careersUrl?: string, extraSlugs: string[] = []): Promise<Hit | null> {
  const segment = "";
  if (careersUrl) {
    const k = keyFromCareersUrl(careersUrl);
    if (k) {
      const jobs = k.ats === "workday" ? null : await countJobs(ctx, k.ats, k.key);
      return { name, segment, ats: k.ats, key: k.key, jobs };
    }
  }
  let emptyBoard: Hit | null = null;
  for (const slug of [...extraSlugs, ...slugVariants(name)]) {
    for (const ats of ["greenhouse", "ashby", "lever"] as const) {
      const n = await countJobs(ctx, ats, slug);
      await new Promise((r) => setTimeout(r, 150)); // be polite
      if (n === null) continue;
      if (n > 0) return { name, segment, ats, key: slug, jobs: n };
      emptyBoard ??= { name, segment, ats, key: slug, jobs: 0 };
    }
  }
  return emptyBoard;
}

async function main() {
  const write = process.argv.includes("--write");
  const candidatesPath = join(ROOT, "seed/candidates.csv");
  const companiesPath = join(ROOT, "seed/companies.csv");
  const existing = new Set(existsSync(companiesPath) ? parseCsv(readFileSync(companiesPath, "utf8")).map((r) => r.id) : []);
  const candidates = parseCsv(readFileSync(candidatesPath, "utf8")).filter((c) => c.name && !existing.has(slugify(c.name)));

  const ctx: HttpContext = { fetch: globalThis.fetch as never, userAgent: "job-radar-discover/0.1 (personal project)" };
  console.log(`Probing ${candidates.length} candidates (skipping ${existing.size} already in companies.csv)...\n`);

  const results = await mapLimit(candidates, 3, async (c) => {
    try {
      const hit = await discoverOne(ctx, c.name!, c.careers_url || undefined, (c.slugs ?? "").split(";").map((s) => s.trim()).filter(Boolean));
      const label = hit ? `${hit.ats}:${hit.key}${hit.jobs === null ? "" : ` (${hit.jobs} jobs)`}` : "not found";
      console.log(`${hit ? (hit.jobs === 0 ? "?" : "✓") : "✗"} ${c.name} -> ${label}`);
      return { c, hit: hit ? { ...hit, segment: c.segment ?? "biotech" } : null };
    } catch (err) {
      console.log(`! ${c.name} -> error: ${err instanceof Error ? err.message : err}`);
      return { c, hit: null };
    }
  });

  const hits = results.filter((r) => r.hit).map((r) => r.hit!);
  const misses = results.filter((r) => !r.hit).map((r) => r.c.name);
  const rows = hits.map((h) => `${slugify(h.name)},${h.name.includes(",") ? `"${h.name}"` : h.name},${h.ats},${h.key},${h.segment},${h.jobs === 0 ? "false" : "true"}`);

  writeFileSync(join(ROOT, "seed/discovered.csv"), ["id,name,ats,ats_key,segment,active", ...rows].join("\n") + "\n");
  console.log(`\n${hits.length} found, ${misses.length} not found. Results written to seed/discovered.csv.`);
  if (misses.length) {
    console.log(`\nNot found (look these up by hand: open their careers page and copy a job link into careers_url):`);
    for (const m of misses) console.log(`  - ${m}`);
  }
  if (write && rows.length) {
    appendFileSync(companiesPath, rows.join("\n") + "\n");
    console.log(`\nAppended ${rows.length} rows to seed/companies.csv. Boards with 0 jobs were added as active=false.`);
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
