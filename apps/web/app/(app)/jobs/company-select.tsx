"use client";

import { useRouter } from "next/navigation";

/** Company dropdown. Changing it navigates to the same list with ?company= set (other filters kept). */
export function CompanySelect({
  companies,
  value,
  baseQuery,
}: {
  companies: { id: string; name: string; count: number }[];
  value?: string;
  /** Current query string without the company parameter. */
  baseQuery: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Company"
      value={value ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(baseQuery);
        if (e.target.value) p.set("company", e.target.value);
        const s = p.toString();
        router.push(s ? `/jobs?${s}` : "/jobs", { scroll: false });
      }}
      className="h-9 max-w-full min-w-56 sm:max-w-80 border border-line bg-surface px-2 font-mono text-xs text-heading"
    >
      <option value="">All companies ({companies.reduce((n, c) => n + c.count, 0)} roles)</option>
      {value && !companies.some((c) => c.id === value) && <option value={value}>{value} (hidden by you)</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.count})
        </option>
      ))}
    </select>
  );
}
