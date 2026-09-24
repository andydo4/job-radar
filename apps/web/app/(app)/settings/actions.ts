"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { parseProfileForm, type ProfileFormState } from "@/lib/profile";
import type { CompanyPref } from "@/lib/me";

/** Save the profile from Welcome or Settings, then go to the jobs list. */
export async function saveProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const parsed = parseProfileForm(formData);
  if (!parsed.ok) return { errors: parsed.errors, draft: parsed.draft, message: "A few things need a look." };

  const { supabase, user } = await requireUser();
  const row = { ...parsed.data, onboarded_at: new Date().toISOString() };
  const { data, error } = await supabase.from("profiles").update(row).eq("id", user.id).select("id");
  if (error) return { message: `Couldn't save: ${error.message}` };
  if (!data?.length) {
    // Profile row missing (shouldn't happen: the sign-up trigger makes it). Create it.
    const ins = await supabase.from("profiles").insert({ id: user.id, ...row });
    if (ins.error) return { message: `Couldn't save: ${ins.error.message}` };
  }
  revalidatePath("/", "layout");
  redirect(formData.get("from") === "settings" ? "/jobs?saved=profile" : "/jobs");
}

/** Star or hide a company for yourself (null clears it). RLS keeps it private to you. */
export async function setCompanyPref(companyId: string, pref: CompanyPref | null): Promise<{ ok: boolean; message?: string }> {
  if (!/^[a-z0-9-]{1,80}$/.test(companyId) || (pref !== null && pref !== "star" && pref !== "hide")) return { ok: false, message: "Invalid request." };
  const { supabase, user } = await requireUser();
  const { error } =
    pref === null
      ? await supabase.from("company_prefs").delete().eq("company_id", companyId)
      : await supabase
          .from("company_prefs")
          .upsert({ user_id: user.id, company_id: companyId, pref, updated_at: new Date().toISOString() }, { onConflict: "user_id,company_id" });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
