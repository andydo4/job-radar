"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { AFTER_GRAD_OPTIONS, DEGREE_OPTIONS, TIER_OPTIONS, type Profile, type ProfileFormState } from "@/lib/profile";

type Action = (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

const FAMILY_HELP: [string, string, string][] = [
  ["software", "Software", "SWE, data & ML engineering, forward deployed, product & design engineer, at any company"],
  ["research", "Research", "Research associate, scientist, lab roles"],
  ["process", "Process & manufacturing", "Process development, bioprocess, manufacturing"],
  ["quality", "Quality", "QC analyst, QA, validation"],
  ["clinical", "Clinical", "Clinical research, trials, medical affairs"],
  ["regulatory", "Regulatory", "Regulatory affairs, submissions"],
  ["compbio", "Comp bio & data", "Bioinformatics, computational biology, data"],
  ["engineering", "Engineering", "Automation, instrumentation, hardware"],
  ["commercial", "Commercial", "Sales, marketing, business development"],
  ["consulting", "Life-science consulting", "Analyst / associate at consulting firms"],
  ["vc", "Biotech venture", "Analyst / associate at VC funds"],
];

/** The form's values as one comparable string (order-independent). */
function snapshot(form: HTMLFormElement): string {
  return [...new FormData(form).entries()]
    .filter(([k]) => k !== "from")
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join("&");
}

const LEAVE_MESSAGE = "You have unsaved changes to your profile. Leave without saving?";

const inputClass =
  "h-11 w-full border border-line-strong bg-surface px-3 font-mono text-sm text-heading placeholder:text-subtle aria-invalid:border-danger sm:h-10";

// A checkbox or radio that looks like a selectable card.
const optionClass =
  "flex cursor-pointer items-start gap-3 border border-line bg-surface px-3 py-2.5 font-mono text-sm text-body transition-colors duration-100 hover:border-line-strong has-checked:border-brand has-checked:bg-brand-softer has-focus-visible:outline-2 has-focus-visible:outline-brand";

function Legend({ children }: { children: React.ReactNode }) {
  return <legend className="px-1 font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">{children}</legend>;
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={id} className="font-mono text-xs text-danger">
      {msg}
    </p>
  ) : null;
}

export function ProfileForm({
  action,
  profile: saved,
  from,
  submitLabel,
}: {
  action: Action;
  profile: Profile;
  from: "welcome" | "settings";
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  // After a failed save, show what was submitted (React resets the form after an action).
  const profile: Omit<Profile, "onboarded_at"> = state.draft ?? saved;
  const gradMonth = profile.grad_month ? profile.grad_month.slice(0, 7) : "";

  // Settings: notice unsaved changes, show a save bar, and ask before leaving the page.
  const guard = from === "settings";
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const submitting = useRef(false);
  const [dirty, setDirty] = useState(false);
  const check = useCallback(() => {
    const f = formRef.current;
    if (!f) return;
    baseline.current ??= snapshot(f); // first render = what's saved
    setDirty(snapshot(f) !== baseline.current);
  }, []);
  // After a failed save the form re-renders with what you typed: still unsaved.
  useEffect(() => {
    if (!guard) return;
    const f = formRef.current;
    if (!f) return;
    submitting.current = false;
    if (baseline.current === null) baseline.current = snapshot(f);
    else f.dispatchEvent(new Event("input", { bubbles: true }));
  }, [guard, state]);

  useEffect(() => {
    if (!guard || !dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (submitting.current) return;
      e.preventDefault();
      e.returnValue = ""; // older browsers need this to show the prompt
    };
    // Links inside the app (tabs, avatar menu, job links): ask first.
    const onClick = (e: MouseEvent) => {
      if (submitting.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return; // same page (#companies)
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        submitting.current = true; // you chose to leave: don't ask again
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [guard, dirty]);

  const discard = () => {
    formRef.current?.reset();
    setDirty(false);
  };

  return (
    <form
      ref={formRef}
      key={state.draft ? JSON.stringify(state.draft) : "saved"}
      action={formAction}
      onInput={guard ? check : undefined}
      onChange={guard ? check : undefined}
      onSubmit={() => (submitting.current = true)}
      className="flex flex-col gap-8"
      noValidate
    >
      <input type="hidden" name="from" value={from} />
      {state.message && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-4 py-3 font-mono text-sm text-danger">
          {state.message}
        </p>
      )}

      <fieldset className="flex flex-col gap-5 border border-line bg-surface p-5 sm:p-6">
        <Legend>You</Legend>
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="degree-label" aria-describedby={e.degree ? "degree-error" : undefined}>
          <p id="degree-label" className="font-mono text-sm font-medium text-heading">
            Highest degree <span className="font-normal text-subtle">(finished, or finishing soon)</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEGREE_OPTIONS.map(([id, label]) => (
              <label key={id} className={optionClass}>
                <input type="radio" name="degree" value={id} defaultChecked={profile.degree === id} className="mt-1 accent-brand" />
                {label}
              </label>
            ))}
          </div>
          <Err id="degree-error" msg={e.degree} />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="field" className="font-mono text-sm font-medium text-heading">
              Field of study
            </label>
            <input id="field" name="field" defaultValue={profile.field ?? ""} placeholder="e.g. Biochemistry" className={inputClass} aria-invalid={Boolean(e.field) || undefined} />
            {e.field ? <Err id="field-error" msg={e.field} /> : <p className="font-mono text-xs text-subtle">Optional</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grad_month" className="font-mono text-sm font-medium text-heading">
              Graduation
            </label>
            <input id="grad_month" name="grad_month" type="month" defaultValue={gradMonth} className={inputClass} aria-invalid={Boolean(e.grad_month) || undefined} />
            {e.grad_month ? <Err id="grad-error" msg={e.grad_month} /> : <p className="font-mono text-xs text-subtle">Past or upcoming. Used for internships.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="years_experience" className="font-mono text-sm font-medium text-heading">
              Work experience
            </label>
            <select id="years_experience" name="years_experience" defaultValue={profile.years_experience === null ? "" : String(Math.min(profile.years_experience, 5))} className={inputClass}>
              <option value="">Prefer not to say</option>
              <option value="0">None yet / under 1 year</option>
              <option value="1">1 year</option>
              <option value="2">2 years</option>
              <option value="3">3 years</option>
              <option value="4">4 years</option>
              <option value="5">5+ years</option>
            </select>
            <p className="font-mono text-xs text-subtle">Full-time, after school. Co-ops count.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="after-grad-label">
          <p id="after-grad-label" className="font-mono text-sm font-medium text-heading">
            After you graduate
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {AFTER_GRAD_OPTIONS.map(([id, label, help]) => (
              <label key={id} className={optionClass}>
                <input type="radio" name="after_grad" value={id} defaultChecked={profile.after_grad === id} className="mt-1 accent-brand" />
                <span className="flex flex-col">
                  <span className="font-medium text-heading">{label}</span>
                  <span className="text-xs text-subtle">{help}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="font-mono text-xs text-subtle">
            Internships that start after your graduation month, or that are for a different class year, are left out of For you
            unless you might be in grad school then.
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border border-line bg-surface p-5 sm:p-6" aria-describedby={e.families ? "families-error" : undefined}>
        <Legend>Kinds of jobs</Legend>
        <p className="font-mono text-sm text-body">Everything is on to start. Untick what you don&apos;t want in For you.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FAMILY_HELP.map(([id, label, help]) => (
            <label key={id} className={optionClass}>
              <input type="checkbox" name="families" value={id} defaultChecked={profile.families.includes(id)} className="mt-1 accent-brand" />
              <span className="flex flex-col">
                <span className="font-medium text-heading">{label}</span>
                <span className="text-xs text-subtle">{help}</span>
              </span>
            </label>
          ))}
        </div>
        <Err id="families-error" msg={e.families} />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className={optionClass}>
            <input type="checkbox" name="include_internships" defaultChecked={profile.include_internships} className="mt-1 accent-brand" />
            <span className="flex flex-col">
              <span className="font-medium text-heading">Include internships &amp; co-ops</span>
              <span className="text-xs text-subtle">Usually for current students</span>
            </span>
          </label>
          <label className={optionClass}>
            <input type="checkbox" name="hide_contract" defaultChecked={profile.hide_contract} className="mt-1 accent-brand" />
            <span className="flex flex-col">
              <span className="font-medium text-heading">Hide contract &amp; temp roles</span>
              <span className="text-xs text-subtle">Agency and fixed-term positions</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border border-line bg-surface p-5 sm:p-6" aria-describedby={e.metro_tiers ? "tiers-error" : undefined}>
        <Legend>Where</Legend>
        <p className="font-mono text-sm text-body">US only. Boston and NYC are always listed first.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {TIER_OPTIONS.map(([id, label]) => (
            <label key={id} className={optionClass}>
              <input type="checkbox" name="metro_tiers" value={id} defaultChecked={profile.metro_tiers.includes(id)} className="mt-1 accent-brand" />
              {label}
            </label>
          ))}
        </div>
        <Err id="tiers-error" msg={e.metro_tiers} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending || (guard && !dirty)} className={buttonClass("primary")}>
          {pending ? "Saving…" : guard ? (dirty ? "Save changes" : "Saved ✓") : submitLabel}
        </button>
        <p className="font-mono text-xs text-subtle">
          {guard && dirty ? "You have unsaved changes." : "Only you can see this. Change it any time in Settings."}
        </p>
      </div>

      {/* Settings: a bar pinned to the bottom of the screen while there are unsaved changes. */}
      {guard && dirty && <div aria-hidden className="h-16" />}
      {guard && dirty && (
        <div role="region" aria-label="Unsaved changes" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-brand bg-surface shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
            <p className="flex items-center gap-2 font-mono text-sm text-heading">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-lime ring-2 ring-heading/20" />
              Unsaved changes
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={discard} disabled={pending} className={buttonClass("secondary")}>
                Discard
              </button>
              <button type="submit" disabled={pending} className={buttonClass("primary")}>
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
