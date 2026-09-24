import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { Description } from "@/components/job-description";
import {
  EMPLOYMENT_LABEL,
  FAMILY_LABEL,
  experienceLabel,
  getJob,
  salaryLabel,
  timeAgo,
} from "@/lib/jobs";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job" };

const LEVEL_LABEL: Record<string, string> = { intern: "Intern", entry: "Entry level", unspecified: "Not stated", mid: "Mid level", senior: "Senior" };

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:py-0 sm:first:pl-0 sm:last:border-r-0">
      <dt className="font-mono text-[11px] font-medium tracking-[0.04em] text-subtle uppercase">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-heading">{value}</dd>
    </div>
  );
}

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  const { back } = await props.searchParams;
  // Return to the exact filtered list you came from (only ever a /jobs URL).
  const backHref = typeof back === "string" && /^\/jobs(\?|$)/.test(back) ? back : "/jobs";
  if (!/^\d+$/.test(id)) notFound();
  const { supabase } = await requireUser();
  const found = await getJob(supabase, Number(id));
  if (!found) notFound();
  const { job: j, siblings } = found;

  const pay = salaryLabel(j);
  const locations = [...new Set([...(j.locations.length ? j.locations : j.remote ? ["Remote"] : []), ...siblings.flatMap((s) => s.locations)])];
  const reqs = j.requirements ?? [];

  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link href={backHref} className="w-fit font-mono text-xs text-link hover:underline">
          ← Back to jobs
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium text-subtle">{j.company?.name ?? j.company_id}</p>
            <h1 className="mt-1 font-mono text-2xl leading-8 font-bold text-heading sm:text-[28px] sm:leading-9">{j.title}</h1>
            <p className="mt-2 font-mono text-xs text-subtle">
              Found {timeAgo(j.first_seen_at)} · verified {timeAgo(j.last_seen_at)}
              {j.closed_at && <span className="text-danger"> · closed {timeAgo(j.closed_at)}</span>}
            </p>
          </div>
          {!j.closed_at && (
            <a
              href={j.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-fit shrink-0 items-center bg-brand px-5 font-mono text-sm font-medium text-white hover:bg-brand-strong"
            >
              Apply on company site ↗
            </a>
          )}
        </div>
      </div>

      <dl className="grid border border-line bg-surface px-5 py-2 sm:grid-cols-4 sm:py-5">
        <Fact label="Pay" value={pay ?? <span className="font-normal text-subtle">Not listed</span>} />
        <Fact
          label="Experience"
          value={experienceLabel(j.experience_min_years) ?? <span className="font-normal text-subtle">Not stated</span>}
        />
        <Fact label="Degree" value={j.degree_min ? `${j.degree_min.toUpperCase()} or higher` : <span className="font-normal text-subtle">Not stated</span>} />
        <Fact
          label="Type"
          value={j.employment_type ? EMPLOYMENT_LABEL[j.employment_type] ?? j.employment_type : <span className="font-normal text-subtle">Not stated</span>}
        />
      </dl>

      <div className="flex flex-wrap gap-1.5">
        <Badge>{FAMILY_LABEL[j.role_family] ?? j.role_family}</Badge>
        <Badge>{LEVEL_LABEL[j.seniority] ?? j.seniority}</Badge>
        {j.department && j.department.toLowerCase() !== (FAMILY_LABEL[j.role_family] ?? "").toLowerCase() && <Badge>{j.department}</Badge>}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">
          {locations.length > 1 ? `Locations (${locations.length})` : "Location"}
        </h2>
        <p className="font-mono text-sm leading-6 text-body">{locations.length ? locations.join(" · ") : "Not listed"}</p>
      </section>

      {reqs.length > 0 && (
        <section className="flex flex-col gap-3 border border-line bg-card p-5 sm:p-6">
          <h2 className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">Requirements at a glance</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 font-mono text-sm leading-6 text-body marker:text-subtle">
            {reqs.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-xs font-medium tracking-[0.04em] text-subtle uppercase">Full description</h2>
        {j.description_text ? (
          <Description text={j.description_text} />
        ) : (
          <p className="font-mono text-sm text-subtle">
            Not loaded yet. For big Workday boards the description is fetched in the background, a batch every 10
            minutes. Meanwhile, it&apos;s on the{" "}
            <a href={j.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
              company&apos;s page ↗
            </a>
            .
          </p>
        )}
      </section>

      <p className="font-mono text-xs leading-5 text-subtle">
        Pay, experience and requirements were read from the posting automatically. The company&apos;s page is the source of
        truth.
      </p>
    </article>
  );
}
