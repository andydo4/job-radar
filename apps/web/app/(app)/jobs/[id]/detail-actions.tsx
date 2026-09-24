"use client";

import { useState, useTransition } from "react";
import type { JobStatus } from "@/lib/me";
import { setJobStatus } from "../actions";

const small = "inline-flex h-11 items-center gap-1.5 border px-3 font-mono text-sm whitespace-nowrap transition-colors duration-100 disabled:opacity-60";
const idle = "border-line-strong bg-surface text-heading hover:bg-muted";

/** Apply / Save / Applied / Hide on a job's own page. */
export function DetailActions({ ids, initialStatus, applyHref, closed }: { ids: number[]; initialStatus: JobStatus | null; applyHref: string; closed: boolean }) {
  const [status, setStatus] = useState<JobStatus | null>(initialStatus);
  const [askApplied, setAskApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mark(next: JobStatus | null) {
    const prev = status;
    setStatus(next);
    setAskApplied(false);
    setError(null);
    start(async () => {
      const res = await setJobStatus(ids, next);
      if (!res.ok) {
        setStatus(prev);
        setError(res.message ?? "Couldn't save. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {!closed && (
          <a
            href={applyHref}
            target="_blank"
            rel="noopener"
            onClick={() => status !== "applied" && setAskApplied(true)}
            className="inline-flex h-11 items-center bg-brand px-5 font-mono text-sm font-medium text-white hover:bg-brand-strong"
          >
            Apply on company site ↗
          </a>
        )}
        <button type="button" aria-pressed={status === "saved"} disabled={pending} onClick={() => mark(status === "saved" ? null : "saved")} className={`${small} ${status === "saved" ? "border-brand bg-brand-softer font-medium text-link" : idle}`}>
          <span aria-hidden>{status === "saved" ? "★" : "☆"}</span>
          {status === "saved" ? "Saved" : "Save"}
        </button>
        <button type="button" aria-pressed={status === "applied"} disabled={pending} onClick={() => mark(status === "applied" ? null : "applied")} className={`${small} ${status === "applied" ? "border-success/40 bg-success-soft font-medium text-success" : idle}`}>
          <span aria-hidden>{status === "applied" ? "✓" : "○"}</span>
          Applied
        </button>
        <button type="button" disabled={pending} onClick={() => mark(status === "hidden" ? null : "hidden")} className={`${small} ${idle}`}>
          {status === "hidden" ? "Unhide" : "Hide"}
        </button>
      </div>
      {askApplied && (
        <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-body" role="status">
          Did you apply?
          <button type="button" onClick={() => mark("applied")} className="font-medium text-link hover:underline">
            Yes, mark applied
          </button>
          <button type="button" onClick={() => setAskApplied(false)} className="text-subtle hover:text-heading">
            Not yet
          </button>
        </p>
      )}
      {status === "hidden" && <p className="font-mono text-xs text-subtle">Hidden from your lists.</p>}
      {error && (
        <p role="alert" className="font-mono text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
