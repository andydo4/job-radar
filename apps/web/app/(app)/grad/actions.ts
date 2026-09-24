"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isStatus, parseProgramForm, type FormState } from "@/lib/programs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function done(): never {
  // The layout (deadline banner) and the list both depend on programs.
  revalidatePath("/", "layout");
  redirect("/grad");
}

export async function createProgram(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseProgramForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("grad_programs").insert(parsed.data);
  if (error) return { message: `Couldn't save: ${error.message}`, values: Object.fromEntries(formData) as Record<string, string> };
  done();
}

export async function updateProgram(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!UUID_RE.test(id)) return { message: "Unknown program." };
  const parsed = parseProgramForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, values: parsed.values };

  const { supabase } = await requireUser();
  // RLS makes sure this only ever touches the signed-in user's own row.
  const { error, count } = await supabase.from("grad_programs").update(parsed.data, { count: "exact" }).eq("id", id);
  if (error) return { message: `Couldn't save: ${error.message}`, values: Object.fromEntries(formData) as Record<string, string> };
  if (count === 0) return { message: "That program no longer exists." };
  done();
}

export async function deleteProgram(id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const { supabase } = await requireUser();
  await supabase.from("grad_programs").delete().eq("id", id);
  done();
}

/** Inline status change from the table (no page navigation). */
export async function setStatus(id: string, status: string): Promise<{ ok: boolean; message?: string }> {
  if (!UUID_RE.test(id) || !isStatus(status)) return { ok: false, message: "Invalid status." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("grad_programs").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
