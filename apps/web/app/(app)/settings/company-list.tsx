"use client";

import { useMemo, useState } from "react";
import type { CompanyPref } from "@/lib/me";
import { CompanyPrefButtons } from "@/components/company-pref-button";

const SEGMENT: Record<string, string> = { pharma: "Pharma", biotech: "Biotech", tools: "Tools", cro: "CRO", consulting: "Consulting", vc: "Venture", academic: "Academic", tech: "Tech" };

/** Every watched company with Star / Hide, searchable. */
export function CompanyList({ companies, prefs }: { companies: { id: string; name: string; segment: string; open: number }[]; prefs: Record<string, CompanyPref> }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? companies.filter((c) => c.name.toLowerCase().includes(s) || (SEGMENT[c.segment] ?? "").toLowerCase().includes(s)) : companies;
  }, [q, companies]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies"
        aria-label="Search companies"
        className="h-10 w-full border border-line-strong bg-surface px-3 font-mono text-sm text-heading placeholder:text-subtle sm:max-w-xs"
      />
      <ul className="flex flex-col border border-line">
        {shown.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-sm font-medium text-heading">{c.name}</span>
              <span className="font-mono text-xs text-subtle">
                {SEGMENT[c.segment] ?? c.segment} · {c.open} open role{c.open === 1 ? "" : "s"}
              </span>
            </span>
            <CompanyPrefButtons companyId={c.id} name={c.name} initial={prefs[c.id] ?? null} compact />
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-3 font-mono text-sm text-subtle">No companies match.</li>}
      </ul>
    </div>
  );
}
