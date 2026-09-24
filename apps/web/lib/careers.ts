/** The company's public job board, from how Primer reads it. */
export function careersUrl(ats: string, key: string): string | null {
  if (ats === "greenhouse") return `https://job-boards.greenhouse.io/${key}`;
  if (ats === "lever") return `https://jobs.lever.co/${key}`;
  if (ats === "ashby") return `https://jobs.ashbyhq.com/${key}`;
  if (ats === "workday") {
    const [tenant, wd, site] = key.split("|");
    return tenant && wd && site ? `https://${tenant}.${wd}.myworkdayjobs.com/${site}` : null;
  }
  if (ats === "amazon") return "https://www.amazon.jobs/en/";
  if (ats === "google") return "https://www.google.com/about/careers/applications/jobs/results";
  if (ats === "apple") return "https://jobs.apple.com/en-us/search";
  if (ats === "eightfold") {
    const [host] = key.split("|");
    return host ? `https://${host}/careers` : null;
  }
  if (ats === "careersite") {
    try {
      return new URL(key).origin;
    } catch {
      return null;
    }
  }
  return null;
}
