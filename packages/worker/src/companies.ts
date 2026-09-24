import { readFileSync } from "node:fs";
import type { Ats, Company, Segment } from "@job-radar/shared";

const ATS: Ats[] = ["greenhouse", "lever", "ashby", "workday"];
const SEGMENTS: Segment[] = ["pharma", "biotech", "tools", "cro", "consulting", "vc", "academic", "tech"];

/** Tiny CSV parser: handles quoted fields with commas and "" escapes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== "") && !r[0]?.trim().startsWith("#"));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function loadCompanies(path: string): Company[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const ids = new Set<string>();
  return rows.map((r, i) => {
    const line = i + 2;
    const ats = r.ats as Ats;
    const segment = r.segment as Segment;
    if (!r.id) throw new Error(`${path}:${line}: missing id`);
    if (ids.has(r.id)) throw new Error(`${path}:${line}: duplicate id "${r.id}"`);
    ids.add(r.id);
    if (!ATS.includes(ats)) throw new Error(`${path}:${line}: unknown ats "${r.ats}"`);
    if (!SEGMENTS.includes(segment)) throw new Error(`${path}:${line}: unknown segment "${r.segment}"`);
    if (!r.ats_key) throw new Error(`${path}:${line}: missing ats_key`);
    return {
      id: r.id,
      name: r.name || r.id,
      ats,
      atsKey: r.ats_key,
      segment,
      active: !/^(false|no|0)$/i.test(r.active ?? "true"),
    };
  });
}
