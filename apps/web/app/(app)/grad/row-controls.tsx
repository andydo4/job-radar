"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { STATUSES, type Status } from "@/lib/programs";
import { deleteProgram, setStatus } from "./actions";

/** Status dropdown that saves as soon as you change it. */
export function StatusSelect({ id, status, label }: { id: string; status: Status; label: string }) {
  const [value, setValue] = useState<Status>(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Status for ${label}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Status;
          const prev = value;
          setValue(next);
          setError(null);
          start(async () => {
            const res = await setStatus(id, next);
            if (!res.ok) {
              setValue(prev);
              setError(res.message ?? "Couldn't save");
            }
          });
        }}
        className="h-10 border border-line-strong bg-surface px-2 font-mono text-sm text-heading disabled:opacity-60"
      >
        {STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Two-step delete: first click arms it, second click deletes. No browser pop-ups. */
export function DeleteButton({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonClass("outline")}>
        Delete program
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(() => deleteProgram(id))} className={buttonClass("danger")}>
        {pending ? "Deleting…" : "Yes, delete it"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className={buttonClass("ghost")}>
        Keep it
      </button>
    </div>
  );
}
