export const DEGREES = ["PhD", "MS", "Postbac", "Other"] as const;
export const GRE_OPTIONS = ["Unknown", "Required", "Optional", "Not accepted"] as const;
export const STATUSES = ["Researching", "Applying", "Submitted", "Decision"] as const;

export type Degree = (typeof DEGREES)[number];
export type Gre = (typeof GRE_OPTIONS)[number];
export type Status = (typeof STATUSES)[number];

export interface Program {
  id: string;
  school: string;
  program: string;
  degree: Degree;
  field: string | null;
  opens_on: string | null;
  deadline: string | null;
  fee: number | null;
  gre: Gre;
  url: string | null;
  status: Status;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ProgramInput = Omit<Program, "id" | "created_at" | "updated_at">;

export type FieldErrors = Partial<Record<keyof ProgramInput, string>>;

export interface FormState {
  errors?: FieldErrors;
  message?: string;
  /** Echo back what was typed so a failed submit doesn't wipe the form. */
  values?: Record<string, string>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function isRealDate(ymd: string): boolean {
  if (!DATE_RE.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

/** Validate the add/edit form. Mirrors the database checks so errors show next to the field. */
export function parseProgramForm(fd: FormData):
  | { ok: true; data: ProgramInput }
  | { ok: false; errors: FieldErrors; values: Record<string, string> } {
  const values: Record<string, string> = {};
  for (const k of ["school", "program", "degree", "field", "opens_on", "deadline", "fee", "gre", "url", "status", "notes"]) {
    values[k] = str(fd, k);
  }
  const errors: FieldErrors = {};

  if (!values.school) errors.school = "School is required.";
  else if (values.school.length > 200) errors.school = "Keep it under 200 characters.";
  if (!values.program) errors.program = "Program is required.";
  else if (values.program.length > 200) errors.program = "Keep it under 200 characters.";
  if (!(DEGREES as readonly string[]).includes(values.degree!)) errors.degree = "Pick a degree.";
  if (!(GRE_OPTIONS as readonly string[]).includes(values.gre!)) errors.gre = "Pick a GRE option.";
  if (!(STATUSES as readonly string[]).includes(values.status!)) errors.status = "Pick a status.";
  if (values.field && values.field.length > 200) errors.field = "Keep it under 200 characters.";
  if (values.deadline && !isRealDate(values.deadline)) errors.deadline = "Use a real date.";
  if (values.opens_on && !isRealDate(values.opens_on)) errors.opens_on = "Use a real date.";
  if (values.opens_on && values.deadline && !errors.deadline && !errors.opens_on && values.opens_on > values.deadline) {
    errors.opens_on = "Opens after the deadline?";
  }
  let fee: number | null = null;
  if (values.fee) {
    const n = Number(values.fee.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 999_999) errors.fee = "Enter an amount like 105.";
    else fee = Math.round(n * 100) / 100;
  }
  if (values.url) {
    if (!/^https?:\/\//i.test(values.url)) values.url = `https://${values.url}`;
    try {
      new URL(values.url);
    } catch {
      errors.url = "That doesn't look like a link.";
    }
  }
  if (values.notes && values.notes.length > 5000) errors.notes = "Notes are limited to 5,000 characters.";

  if (Object.keys(errors).length) return { ok: false, errors, values };
  return {
    ok: true,
    data: {
      school: values.school!,
      program: values.program!,
      degree: values.degree as Degree,
      field: values.field || null,
      opens_on: values.opens_on || null,
      deadline: values.deadline || null,
      fee,
      gre: values.gre as Gre,
      url: values.url || null,
      status: values.status as Status,
      notes: values.notes || null,
    },
  };
}

export function isStatus(s: unknown): s is Status {
  return typeof s === "string" && (STATUSES as readonly string[]).includes(s);
}
