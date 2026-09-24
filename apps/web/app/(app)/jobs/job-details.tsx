"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Description } from "@/components/job-description";
import { loadDescription } from "./actions";

export interface JobGlanceProps {
  workModel?: "remote" | "hybrid" | "onsite" | null;
  workModelDetail?: string | null;
  visa?: "yes" | "no" | null;
  travel?: string | null;
  housing?: "provided" | "stipend" | "not_provided" | null;
  clearance?: boolean | null;
  extras?: string[] | null;
}

const EXTRA_NAMES: Record<string, string> = {
  cover_letter: "Cover letter",
  transcript: "Transcript",
  references: "References",
  writing_sample: "Writing sample",
  coding_assessment: "Coding test",
  case_study: "Case study",
  portfolio: "Portfolio",
  video: "Video response",
};

/**
 * "Details" dropdown on a job card: requirements right away, the full description
 * fetched the first time it's opened (keeps the job list fast).
 */
export function JobDetails({
  id,
  requirements,
  pageHref,
  applyUrl,
  glance,
}: {
  id: number;
  requirements: string[];
  pageHref: string;
  applyUrl: string;
  glance?: JobGlanceProps;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState<string | null | undefined>(undefined);
  const [pending, start] = useTransition();
  const panelId = `job-${id}-details`;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && desc === undefined) {
      start(async () => setDesc(await loadDescription(id)));
    }
  }

  const hasGlance =
    glance &&
    (glance.workModel ||
      glance.visa ||
      glance.travel ||
      glance.housing ||
      glance.clearance ||
      (glance.extras && glance.extras.length > 0));

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex h-8 items-center gap-1.5 font-mono text-xs font-medium text-link hover:underline"
      >
        <span aria-hidden className={`inline-block transition-transform duration-100 ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
        {open ? "Hide details" : requirements.length ? `Details · ${requirements.length} requirement${requirements.length === 1 ? "" : "s"}` : "Details"}
      </button>

      {open && (
        <div id={panelId} className="mt-2 flex flex-col gap-5 border-l-2 border-brand pl-4 sm:pl-5">
          {hasGlance && (
            <section className="flex flex-col gap-2">
              <h3 className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">At a glance</h3>
              <div className="flex flex-wrap gap-1.5">
                {glance.workModel === "remote" && <span className="border border-brand-soft bg-brand-softer px-2 py-0.5 font-mono text-xs text-link">Remote</span>}
                {glance.workModel === "hybrid" && (
                  <span className="border border-brand-soft bg-brand-softer px-2 py-0.5 font-mono text-xs text-link">
                    {glance.workModelDetail ? `Hybrid · ${glance.workModelDetail}` : "Hybrid"}
                  </span>
                )}
                {glance.workModel === "onsite" && <span className="border border-line bg-muted px-2 py-0.5 font-mono text-xs text-body">On-site</span>}
                {glance.visa === "no" && <span className="border border-danger/30 bg-danger-soft px-2 py-0.5 font-mono text-xs text-danger">No visa sponsorship</span>}
                {glance.visa === "yes" && <span className="border border-success/30 bg-success-soft px-2 py-0.5 font-mono text-xs text-success">Visa sponsorship offered</span>}
                {glance.travel && <span className="border border-line bg-muted px-2 py-0.5 font-mono text-xs text-body">{glance.travel}</span>}
                {glance.housing === "provided" && <span className="border border-success/30 bg-success-soft px-2 py-0.5 font-mono text-xs text-success">Housing provided</span>}
                {glance.housing === "stipend" && <span className="border border-success/30 bg-success-soft px-2 py-0.5 font-mono text-xs text-success">Housing stipend</span>}
                {glance.housing === "not_provided" && <span className="border border-line bg-muted px-2 py-0.5 font-mono text-xs text-body">No housing</span>}
                {glance.clearance && <span className="border border-danger/30 bg-danger-soft px-2 py-0.5 font-mono text-xs text-danger">Clearance required</span>}
                {glance.extras && glance.extras.length > 0 && (
                  <span className="border border-line bg-surface px-2 py-0.5 font-mono text-xs text-body">
                    To apply: {glance.extras.map((e) => EXTRA_NAMES[e] ?? e).join(" · ")}
                  </span>
                )}
              </div>
            </section>
          )}

          {requirements.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">Requirements at a glance</h3>
              <ul className="flex max-w-3xl list-disc flex-col gap-1 pl-5 font-mono text-xs leading-5 text-body marker:text-subtle">
                {requirements.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">Full description</h3>
            {pending || desc === undefined ? (
              <p className="font-mono text-xs text-subtle" role="status">
                Loading…
              </p>
            ) : desc ? (
              <div className="max-h-[32rem] overflow-y-auto pr-2">
                <Description text={desc} />
              </div>
            ) : (
              <p className="font-mono text-xs text-subtle">
                Not loaded yet (big Workday boards fill in over a few hours). It&apos;s on the{" "}
                <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  company&apos;s page ↗
                </a>
                .
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-4 pb-1">
            <Link href={pageHref} className="font-mono text-xs text-link hover:underline">
              Open as a full page →
            </Link>
            <button type="button" onClick={toggle} className="font-mono text-xs text-subtle hover:text-heading">
              Hide details ▴
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
