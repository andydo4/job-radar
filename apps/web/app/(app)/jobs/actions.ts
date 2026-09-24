"use server";

import { getDescription } from "@/lib/jobs";
import type { JobStatus } from "@/lib/me";
import { requireUser } from "@/lib/supabase/server";

/** Full description for the inline "Details" dropdown, loaded only when someone opens it. */
export async function loadDescription(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { supabase } = await requireUser(); // RLS: only allowlisted users can read jobs
  return getDescription(supabase, id);
}

/**
 * Save / mark applied / hide a role, or clear the mark with null.
 * `ids` are all listings of the role (first = the one shown). The mark is stored once, on the
 * first, after clearing any others, so a role counts once in Saved / Applied / Hidden.
 * RLS keeps each person's marks private to them.
 */
export async function setJobStatus(ids: number[], status: JobStatus | null): Promise<{ ok: boolean; message?: string }> {
  const clean = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!clean.length || (status !== null && !["saved", "applied", "hidden"].includes(status))) return { ok: false, message: "Invalid request." };
  const { supabase, user } = await requireUser();
  const del = await supabase.from("job_actions").delete().in("job_id", clean);
  if (del.error) return { ok: false, message: del.error.message };
  if (status) {
    const { error } = await supabase.from("job_actions").insert({ user_id: user.id, job_id: clean[0], status });
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true };
}
