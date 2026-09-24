import { NextResponse, type NextRequest } from "next/server";
import { liveCheck, type Ats } from "@/lib/live-check";
import { createClient } from "@/lib/supabase/server";

// Always check at click time; never cache.
export const dynamic = "force-dynamic";

/**
 * Apply goes through here: ask the company's job board whether the posting is still up.
 * Open (or can't tell within 4 seconds) -> straight to the company's page.
 * Closed -> close it in Primer and show the job page with a note instead of a dead link.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[id]">) {
  const { id } = await ctx.params;
  const origin = request.nextUrl.origin;
  if (!/^\d+$/.test(id)) return NextResponse.redirect(`${origin}/jobs`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data } = await supabase
    .from("jobs")
    .select("id, url, external_id, closed_at, company:companies(ats, ats_key)")
    .eq("id", Number(id))
    .maybeSingle();
  const job = data as unknown as { id: number; url: string; external_id: string; closed_at: string | null; company: { ats: Ats; ats_key: string } | null } | null;
  if (!job) return NextResponse.redirect(`${origin}/jobs`);
  if (job.closed_at) return NextResponse.redirect(`${origin}/jobs/${job.id}?closed=1`);

  const status = job.company ? await liveCheck({ ats: job.company.ats, atsKey: job.company.ats_key, externalId: job.external_id, url: job.url }) : "unknown";
  if (status === "closed") {
    await supabase.rpc("mark_job_closed", { p_job_id: job.id });
    return NextResponse.redirect(`${origin}/jobs/${job.id}?closed=1`);
  }
  // Only ever send people to http(s) links from the database.
  if (!/^https?:\/\//i.test(job.url)) return NextResponse.redirect(`${origin}/jobs/${job.id}`);
  return NextResponse.redirect(job.url);
}
