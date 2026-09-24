"use client";

import { useState, useTransition } from "react";
import type { CompanyPref } from "@/lib/me";
import { setCompanyPref } from "@/app/(app)/settings/actions";

const base = "inline-flex h-9 items-center gap-1.5 border px-2.5 font-mono text-xs whitespace-nowrap transition-colors duration-100 disabled:opacity-60";
const idle = "border-line bg-surface text-body hover:border-line-strong hover:bg-muted";

/** ☆ Star / Hide buttons for one company. */
export function CompanyPrefButtons({ companyId, name, initial, compact = false }: { companyId: string; name: string; initial: CompanyPref | null; compact?: boolean }) {
  const [pref, setPref] = useState<CompanyPref | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set(next: CompanyPref | null) {
    const prev = pref;
    setPref(next);
    setError(null);
    start(async () => {
      const res = await setCompanyPref(companyId, next);
      if (!res.ok) {
        setPref(prev);
        setError(res.message ?? "Couldn't save.");
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={pref === "star"}
        disabled={pending}
        onClick={() => set(pref === "star" ? null : "star")}
        title={pref === "star" ? `Unstar ${name}` : `Star ${name}: it gets a ★ and shows under Starred companies`}
        className={`${base} ${pref === "star" ? "border-brand bg-brand-softer font-medium text-link" : idle}`}
      >
        <span aria-hidden>{pref === "star" ? "★" : "☆"}</span>
        {pref === "star" ? "Starred" : compact ? "Star" : `Star ${name}`}
      </button>
      <button
        type="button"
        aria-pressed={pref === "hide"}
        disabled={pending}
        onClick={() => set(pref === "hide" ? null : "hide")}
        title={pref === "hide" ? `Show ${name}'s jobs again` : `Never show ${name}'s jobs`}
        className={`${base} ${pref === "hide" ? "border-danger/40 bg-danger-soft font-medium text-danger" : idle}`}
      >
        {pref === "hide" ? "Hidden · show again" : compact ? "Hide" : `Hide ${name}`}
      </button>
      {error && (
        <span role="alert" className="font-mono text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
