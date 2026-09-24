import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { InstallCard } from "@/components/install-card";
import { getProfile } from "@/lib/me";
import { requireUser } from "@/lib/supabase/server";
import { saveProfile } from "../(app)/settings/actions";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  if (profile.onboarded_at) redirect("/jobs");
  const first = ((user.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-8">
          <span className="flex items-center gap-3">
            <span className="grid size-8 place-items-center bg-brand font-mono text-sm font-bold text-white" aria-hidden>
              P
            </span>
            <span className="font-mono text-base font-semibold text-heading">Primer</span>
          </span>
          <form action="/auth/signout" method="post">
            <button className="h-10 px-2 font-mono text-xs text-subtle hover:text-heading">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">Step 1 of 1 · about a minute</p>
          <h1 className="font-serif text-[34px] leading-10 font-bold text-heading sm:text-[44px] sm:leading-[52px]">
            {first ? `Welcome, ${first}.` : "Welcome."}
          </h1>
          <p className="max-w-2xl font-mono text-sm leading-6 text-body">
            Tell Primer a little about you. It uses this to build your <strong className="text-heading">For you</strong> list and to
            mark each job <em>Likely qualify</em>, <em>Stretch</em> or <em>Needs PhD</em>. All jobs are still one tap away.
          </p>
        </div>
        <ProfileForm action={saveProfile} profile={profile} from="welcome" submitLabel="Show my jobs →" />
        <InstallCard />
      </main>
    </div>
  );
}
