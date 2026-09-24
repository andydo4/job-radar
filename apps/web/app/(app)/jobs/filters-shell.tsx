"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * The filter bar: quick toggles and Sort always visible, everything else behind "Filters".
 * The open/closed state survives clicking filters (same page, new search params).
 */
export function FiltersShell({ quick, sort, panel, activeCount, chips }: { quick: ReactNode; sort: ReactNode; panel: ReactNode; activeCount: number; chips: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">{quick}</div>
        <div className="flex shrink-0 items-center gap-2">
          {sort}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="more-filters"
            className={`inline-flex h-9 items-center gap-2 border px-3 font-mono text-xs font-medium transition-colors duration-100 ${
              open || activeCount ? "border-brand text-link" : "border-line-strong text-heading hover:bg-muted"
            } bg-surface`}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4.5 8h7M7 12h2" strokeLinecap="square" />
            </svg>
            Filters
            {activeCount > 0 && <span className="grid min-w-5 place-items-center bg-brand px-1 text-[11px] text-white">{activeCount}</span>}
          </button>
        </div>
      </div>
      {open && (
        <div id="more-filters" className="flex flex-col gap-4 border border-line bg-card p-4 sm:p-5">
          {panel}
          <div className="flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="font-mono text-xs text-subtle hover:text-heading">
              Done ▴
            </button>
          </div>
        </div>
      )}
      {chips}
    </div>
  );
}

/** Sort dropdown that navigates. */
export function SortSelect({ options }: { options: { label: string; href: string; active: boolean }[] }) {
  const router = useRouter();
  const current = options.find((o) => o.active) ?? options[0]!;
  return (
    <label className="inline-flex h-9 items-center gap-2 border border-line-strong bg-surface pl-3 font-mono text-xs text-subtle">
      Sort
      <select
        value={current.href}
        onChange={(e) => router.push(e.target.value, { scroll: false })}
        className="h-full bg-transparent pr-2 font-medium text-heading"
      >
        {options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
