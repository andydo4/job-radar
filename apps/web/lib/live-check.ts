// Right before someone goes to Apply, ask the company's job board whether the posting
// is still up. Mirrors the endpoints in packages/shared/src/adapters (the website is a
// separate app, so the few URLs it needs are repeated here).

// amazon / google / apple / eightfold (big-tech sites) have no cheap single-job check: always "unknown".
export type Ats = "greenhouse" | "lever" | "ashby" | "workday" | "careersite" | "amazon" | "google" | "apple" | "eightfold";
export type LiveStatus = "open" | "closed" | "unknown";

export interface LiveCheckJob {
  ats: Ats;
  /** companies.ats_key: board slug, or "tenant|wdN|site" for Workday. */
  atsKey: string;
  externalId: string;
  /** The posting's own page (careers sites: the only thing to check). */
  url?: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function liveCheckUrl(j: LiveCheckJob): string | null {
  const e = encodeURIComponent;
  switch (j.ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${e(j.atsKey)}/jobs/${e(j.externalId)}`;
    case "lever":
      return `https://api.lever.co/v0/postings/${e(j.atsKey)}/${e(j.externalId)}`;
    case "ashby":
      // No single-job endpoint: fetch the board (without pay, to keep it small) and look for the id.
      return `https://api.ashbyhq.com/posting-api/job-board/${e(j.atsKey)}`;
    case "workday": {
      const [tenant, wd, site] = j.atsKey.split("|");
      if (!tenant || !wd || !site || !j.externalId.startsWith("/")) return null;
      return `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${j.externalId}`;
    }
    case "careersite":
      return j.url && /^https:\/\//.test(j.url) ? j.url : null;
    default:
      return null;
  }
}

/** Decide from the board's answer. Anything unexpected is "unknown" (we then just send you to the page). */
export function interpretLiveCheck(ats: Ats, externalId: string, status: number, body: unknown): LiveStatus {
  if (status === 404 || status === 410) return ats === "ashby" ? "unknown" : "closed"; // Ashby 404 = board gone, not the job
  if (ats === "careersite") return "unknown"; // a 200 page might still say "no longer available"; just send them there
  if (status !== 200) return "unknown";
  switch (ats) {
    case "greenhouse":
      return body && typeof body === "object" && "id" in body ? "open" : "unknown";
    case "lever":
      return body && typeof body === "object" && "id" in body ? "open" : "unknown";
    case "ashby": {
      const jobs = (body as { jobs?: { id?: string; isListed?: boolean }[] } | null)?.jobs;
      if (!Array.isArray(jobs)) return "unknown";
      const hit = jobs.find((x) => x.id === externalId);
      return hit && hit.isListed !== false ? "open" : "closed";
    }
    case "workday": {
      const info = (body as { jobPostingInfo?: { canApply?: boolean; title?: string } } | null)?.jobPostingInfo;
      if (!info) return "unknown";
      return info.canApply === false ? "closed" : "open";
    }
    default:
      return "unknown";
  }
}

export async function liveCheck(j: LiveCheckJob, fetchImpl: FetchLike = fetch, timeoutMs = 4000): Promise<LiveStatus> {
  const url = liveCheckUrl(j);
  if (!url) return "unknown";
  try {
    const res = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "Primer job checker (personal, 2 users)" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      redirect: "follow",
    });
    let body: unknown = null;
    if (res.status === 200 && j.ats !== "careersite") body = await res.json().catch(() => null);
    return interpretLiveCheck(j.ats, j.externalId, res.status, body);
  } catch {
    return "unknown"; // timeout, network error: don't block anyone from applying
  }
}
