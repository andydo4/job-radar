import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareByDeadline, daysUntil, todayET } from "./deadlines";
import type { Program } from "./programs";

const COLUMNS = "id, school, program, degree, field, opens_on, deadline, fee, gre, url, status, notes, created_at, updated_at";

/** The signed-in user's programs, soonest deadline first. RLS limits this to their own rows. */
export async function getPrograms(supabase: SupabaseClient): Promise<Program[]> {
  const { data, error } = await supabase.from("grad_programs").select(COLUMNS);
  if (error) throw new Error(`Couldn't load programs: ${error.message}`);
  const programs = (data ?? []) as Program[];
  return programs.sort(compareByDeadline<Program>(todayET()));
}

export async function getProgram(supabase: SupabaseClient, id: string): Promise<Program | null> {
  const { data, error } = await supabase.from("grad_programs").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Couldn't load program: ${error.message}`);
  return (data as Program | null) ?? null;
}

/** Next few deadlines still worth a reminder (not past, not already submitted). */
export function upcomingDeadlines(programs: Program[], limit = 3, today = todayET()) {
  return programs
    .filter((p) => p.deadline && daysUntil(p.deadline, today) >= 0 && (p.status === "Researching" || p.status === "Applying"))
    .slice(0, limit)
    .map((p) => ({ ...p, days: daysUntil(p.deadline!, today) }));
}
