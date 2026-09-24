"use server";

import { getDescription } from "@/lib/jobs";
import { requireUser } from "@/lib/supabase/server";

/** Full description for the inline "Details" dropdown, loaded only when someone opens it. */
export async function loadDescription(id: number): Promise<string | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { supabase } = await requireUser(); // RLS: only allowlisted users can read jobs
  return getDescription(supabase, id);
}
