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
  const withRoles = companies.filter((c) => c.count > 0);
  const withoutRoles = companies.filter((c) => c.count === 0);
  const totalRoles = companies.reduce((n, c) => n + c.count, 0);

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
      <option value="">All companies ({totalRoles} roles)</option>
      {value && !companies.some((c) => c.id === value) && <option value={value}>{value} (hidden by you)</option>}
      {withRoles.length > 0 && withoutRoles.length > 0 ? (
        <>
          <optgroup label="Companies with matching roles">
            {withRoles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </optgroup>
          <optgroup label="Other watched companies (0 roles)">
            {withoutRoles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (0)
              </option>
            ))}
          </optgroup>
        </>
      ) : (
        companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.count})
          </option>
        ))
      )}
    </select>
  );
}
