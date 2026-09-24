"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui";
import { DEGREES, GRE_OPTIONS, STATUSES, type FormState, type Program } from "@/lib/programs";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

const inputClass =
  "h-11 w-full border border-line-strong bg-surface px-3 font-mono text-sm text-heading placeholder:text-subtle aria-invalid:border-danger sm:h-10";

function Field({
  label,
  name,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={name} className="font-mono text-sm font-medium text-heading">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="font-mono text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="font-mono text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function ProgramForm({ action, program, submitLabel }: { action: Action; program?: Program; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  // After a failed submit, show what was typed; otherwise the saved values (edit) or blanks (new).
  const v = (key: keyof Program): string => {
    if (state.values && key in state.values) return state.values[key] ?? "";
    const raw = program?.[key];
    return raw === null || raw === undefined ? "" : String(raw);
  };
  const err = (name: string) => (e as Record<string, string | undefined>)[name];
  const aria = (name: string) =>
    err(name) ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};

  return (
    // key forces inputs to pick up new defaultValues after a failed submit
    <form key={JSON.stringify(state.values ?? {})} action={formAction} className="flex flex-col gap-8" noValidate>
      {state.message && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-4 py-3 font-mono text-sm text-danger">
          {state.message}
        </p>
      )}

      <fieldset className="grid gap-5 border border-line bg-surface p-5 sm:grid-cols-2 sm:p-6">
        <legend className="px-1 font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">Program</legend>
        <Field label="School" name="school" error={err("school")}>
          <input id="school" name="school" defaultValue={v("school")} className={inputClass} placeholder="e.g. MIT" required {...aria("school")} />
        </Field>
        <Field label="Program" name="program" error={err("program")}>
          <input
            id="program"
            name="program"
            defaultValue={v("program")}
            className={inputClass}
            placeholder="e.g. Biological Engineering"
            required
            {...aria("program")}
          />
        </Field>
        <Field label="Degree" name="degree" error={err("degree")}>
          <select id="degree" name="degree" defaultValue={v("degree") || "PhD"} className={inputClass} {...aria("degree")}>
            {DEGREES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Field / focus" name="field" error={err("field")} hint="Optional">
          <input id="field" name="field" defaultValue={v("field")} className={inputClass} placeholder="e.g. Immunology" {...aria("field")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5 border border-line bg-surface p-5 sm:grid-cols-2 sm:p-6">
        <legend className="px-1 font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">Application</legend>
        <Field label="Deadline" name="deadline" error={err("deadline")} hint="Drives the countdown and the banner">
          <input id="deadline" name="deadline" type="date" defaultValue={v("deadline")} className={inputClass} {...aria("deadline")} />
        </Field>
        <Field label="Application opens" name="opens_on" error={err("opens_on")} hint="Optional">
          <input id="opens_on" name="opens_on" type="date" defaultValue={v("opens_on")} className={inputClass} {...aria("opens_on")} />
        </Field>
        <Field label="Status" name="status" error={err("status")}>
          <select id="status" name="status" defaultValue={v("status") || "Researching"} className={inputClass} {...aria("status")}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="GRE" name="gre" error={err("gre")}>
          <select id="gre" name="gre" defaultValue={v("gre") || "Unknown"} className={inputClass} {...aria("gre")}>
            {GRE_OPTIONS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Application fee ($)" name="fee" error={err("fee")} hint="Optional">
          <input id="fee" name="fee" inputMode="decimal" defaultValue={v("fee")} className={inputClass} placeholder="e.g. 105" {...aria("fee")} />
        </Field>
        <Field label="Program link" name="url" error={err("url")} hint="Optional">
          <input
            id="url"
            name="url"
            type="url"
            defaultValue={v("url")}
            className={inputClass}
            placeholder="https://…"
            {...aria("url")}
          />
        </Field>
        <Field label="Notes" name="notes" error={err("notes")} className="sm:col-span-2" hint="Recommenders, essays, fee waiver…">
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={v("notes")}
            className="min-h-28 w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm leading-6 text-heading placeholder:text-subtle aria-invalid:border-danger"
            {...aria("notes")}
          />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/grad" className={buttonClass("secondary")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
