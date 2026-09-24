import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { InstallCard } from "@/components/install-card";
import { PageHeader } from "@/components/ui";
import { getProfile } from "@/lib/me";
import { requireUser } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user.id);
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Your profile"
        description={`Signed in as ${user.email}. This shapes your For you list and the qualify badges on each job.`}
      />
      <ProfileForm action={saveProfile} profile={profile} from="settings" submitLabel="Save" />
      <InstallCard />
    </div>
  );
}
