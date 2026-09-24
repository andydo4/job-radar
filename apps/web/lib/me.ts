import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROFILE, PROFILE_COLUMNS, type Profile } from "./profile";

export type JobStatus = "saved" | "applied" | "hidden";

/** The signed-in person's profile (defaults if the row or columns are missing). */
export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}. Has supabase/migrations/0004_personal.sql been run?`);
  return { ...DEFAULT_PROFILE, ...((data as Partial<Profile> | null) ?? {}) };
}

/**
 * Record this visit and get the moment "new since your last visit" counts from.
 * Visits less than 30 minutes apart are one session, so clicking around doesn't reset it.
 */
export async function noteVisit(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("note_visit");
  if (error || typeof data !== "string") return new Date(Date.now() - 48 * 3_600_000).toISOString();
  return data;
}

/** Every saved / applied / hidden mark, job id -> status. Small (two people). */
export async function getJobActions(supabase: SupabaseClient): Promise<Map<number, JobStatus>> {
  const { data } = await supabase.from("job_actions").select("job_id, status").limit(10000);
  return new Map(((data ?? []) as { job_id: number; status: JobStatus }[]).map((r) => [Number(r.job_id), r.status]));
}

export type CompanyPref = "star" | "hide";

/** Your starred / hidden companies, company id -> pref. */
export async function getCompanyPrefs(supabase: SupabaseClient): Promise<Map<string, CompanyPref>> {
  const { data } = await supabase.from("company_prefs").select("company_id, pref").limit(5000);
  return new Map(((data ?? []) as { company_id: string; pref: CompanyPref }[]).map((r) => [r.company_id, r.pref]));
}
