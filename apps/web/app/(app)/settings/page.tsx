import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { InstallCard } from "@/components/install-card";
import { PageHeader } from "@/components/ui";
import { getCompanyPrefs, getProfile } from "@/lib/me";
import { getCompanies } from "@/lib/jobs";
import { CompanyList } from "./company-list";
import { requireUser } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [profile, companies, prefs] = await Promise.all([getProfile(supabase, user.id), getCompanies(supabase), getCompanyPrefs(supabase)]);
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Your profile"
        description={`Signed in as ${user.email}. This shapes your For you list and the qualify badges on each job.`}
      />
      <ProfileForm action={saveProfile} profile={profile} from="settings" submitLabel="Save" />
      <section id="companies" aria-labelledby="companies-title" className="flex scroll-mt-6 flex-col gap-4 border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="companies-title" className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">
            Companies
          </h2>
          <p className="font-mono text-sm leading-6 text-body">
            <strong className="text-heading">Star</strong> the ones you care about most: they get a ★ and their own filter.{" "}
            <strong className="text-heading">Hide</strong> the ones you never want to see. Only you see these choices.
          </p>
        </div>
        <CompanyList companies={companies} prefs={Object.fromEntries(prefs)} />
      </section>
      <InstallCard />
    </div>
  );
}
