"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The filter bar. Desktop: quick toggles and Sort always visible, everything else in a panel that
 * opens below. Phones: one row (Filters, Sort, List/Map); Filters opens a bottom sheet with every
 * filter, quick toggles included, wrapped into rows instead of scrolling sideways.
 * The open/closed state survives tapping filters (same page, new search params).
 */
export function FiltersShell({
  quick,
  sort,
  panel,
  activeCount,
  chips,
  mode,
  resultLabel,
}: {
  quick: ReactNode;
  sort: ReactNode;
  panel: ReactNode;
  activeCount: number;
  chips: ReactNode;
  /** List / Map switch (shown in this row on phones). */
  mode?: ReactNode;
  /** "Show 812 roles" on the sheet's button. */
  resultLabel: string;
}) {
  const [open, setOpen] = useState(false);

  // Phones: keep the page behind the sheet from scrolling.
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 639px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="hidden flex-wrap gap-2 sm:flex">{quick}</div>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="more-filters"
            className={`inline-flex h-9 shrink-0 items-center gap-2 border px-3 font-mono text-xs font-medium transition-colors duration-100 sm:order-2 ${
              open || activeCount ? "border-brand text-link" : "border-line-strong text-heading hover:bg-muted"
            } bg-surface`}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4.5 8h7M7 12h2" strokeLinecap="square" />
            </svg>
            Filters
            {activeCount > 0 && <span className="grid min-w-5 place-items-center bg-brand px-1 text-[11px] text-white">{activeCount}</span>}
          </button>
          <div className="min-w-0 sm:order-1">{sort}</div>
          {mode && <div className="ml-auto sm:hidden">{mode}</div>}
        </div>
      </div>

      {open && (
        <>
          {/* Phones: dim the page; tap it to close. */}
          <button type="button" aria-label="Close filters" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 sm:hidden" />
          <div
            id="more-filters"
            role="dialog"
            aria-label="Filters"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col border-t border-line-strong bg-surface sm:static sm:z-auto sm:max-h-none sm:border sm:border-line sm:bg-card"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:hidden">
              <span className="font-mono text-sm font-semibold text-heading">Filters</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 place-items-center font-mono text-subtle">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain p-4 sm:gap-4 sm:overflow-visible sm:p-5">
              <div className="flex flex-col gap-1.5 sm:hidden">
                <span className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">Quick</span>
                <div className="flex flex-wrap gap-2">{quick}</div>
              </div>
              {panel}
              <div className="hidden justify-end sm:flex">
                <button type="button" onClick={() => setOpen(false)} className="font-mono text-xs text-subtle hover:text-heading">
                  Done ▴
                </button>
              </div>
            </div>
            <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden">
              <button type="button" onClick={() => setOpen(false)} className="h-11 w-full bg-brand font-mono text-sm font-medium text-white">
                {resultLabel}
              </button>
            </div>
          </div>
        </>
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
    <label className="inline-flex h-9 max-w-full items-center gap-2 border border-line-strong bg-surface pl-3 font-mono text-xs text-subtle">
      <span className="hidden min-[400px]:inline sm:inline">Sort</span>
      <select
        value={current.href}
        onChange={(e) => router.push(e.target.value, { scroll: false })}
        aria-label="Sort"
        className="h-full min-w-0 bg-surface pr-2 font-medium text-heading"
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
