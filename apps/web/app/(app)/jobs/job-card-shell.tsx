"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { JobStatus } from "@/lib/me";
import { setJobStatus } from "./actions";

const small =
  "inline-flex h-9 items-center gap-1.5 border px-2.5 font-mono text-xs whitespace-nowrap transition-colors duration-100 disabled:opacity-60";
const idle = "border-line bg-surface text-body hover:border-line-strong hover:bg-muted";
const on = "border-brand bg-brand-softer font-medium text-link";

/**
 * One job in the list: the server-rendered content plus Apply / Save / Applied / Hide,
 * which update instantly and save in the background.
 */
export function JobCardShell({
  ids,
  initialStatus,
  applyHref,
  closed,
  verified,
  hiddenView,
  children,
  footer,
}: {
  ids: number[];
  initialStatus: JobStatus | null;
  applyHref: string;
  closed: boolean;
  verified: string;
  hiddenView: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const [status, setStatus] = useState<JobStatus | null>(initialStatus);
  const [askApplied, setAskApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mark(next: JobStatus | null) {
    const prev = status;
    setStatus(next);
    setError(null);
    setAskApplied(false);
    start(async () => {
      const res = await setJobStatus(ids, next);
      if (!res.ok) {
        setStatus(prev);
        setError(res.message ?? "Couldn't save. Try again.");
      }
    });
  }

  // Hidden from the normal lists: collapse to a one-line undo.
  if (status === "hidden" && !hiddenView) {
    return (
      <li className="flex items-center justify-between gap-4 border-b border-line bg-muted px-4 py-3 font-mono text-xs text-subtle last:border-b-0 sm:px-6">
        <span>Hidden. It won&apos;t show up in your lists again.</span>
        <button type="button" onClick={() => mark(null)} className="font-medium text-link hover:underline" disabled={pending}>
          Undo
        </button>
      </li>
    );
  }

  return (
    <li className={`border-b border-line px-4 py-4 last:border-b-0 sm:px-6 ${closed ? "bg-muted/60" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {closed ? (
              <span className="inline-flex h-10 items-center border border-line px-4 font-mono text-sm text-subtle">Closed</span>
            ) : (
              <a
                href={applyHref}
                target="_blank"
                rel="noopener"
                onClick={() => status !== "applied" && setAskApplied(true)}
                className="inline-flex h-10 items-center bg-brand px-4 font-mono text-sm font-medium text-white hover:bg-brand-strong"
              >
                Apply ↗
              </a>
            )}
            <button
              type="button"
              aria-pressed={status === "saved"}
              onClick={() => mark(status === "saved" ? null : "saved")}
              className={`${small} ${status === "saved" ? on : idle}`}
              disabled={pending}
            >
              <span aria-hidden>{status === "saved" ? "★" : "☆"}</span>
              {status === "saved" ? "Saved" : "Save"}
            </button>
            <button
              type="button"
              aria-pressed={status === "applied"}
              onClick={() => mark(status === "applied" ? null : "applied")}
              className={`${small} ${status === "applied" ? "border-success/40 bg-success-soft font-medium text-success" : idle}`}
              disabled={pending}
            >
              <span aria-hidden>{status === "applied" ? "✓" : "○"}</span>
              Applied
            </button>
            <button
              type="button"
              onClick={() => mark(status === "hidden" ? null : "hidden")}
              className={`${small} ${idle}`}
              disabled={pending}
              title={status === "hidden" ? "Show this job in your lists again" : "Never show this job again"}
            >
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
          {error && (
            <p role="alert" className="font-mono text-xs text-danger">
              {error}
            </p>
          )}
          <span className="font-mono text-[11px] text-subtle">{verified}</span>
        </div>
      </div>
      {footer}
    </li>
  );
}
