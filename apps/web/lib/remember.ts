/** The Jobs page remembers your last filters (per device) in this cookie. */
export const JOBS_QUERY_COOKIE = "primer-jobs-query";

/** Only plain query strings made by the Jobs page itself. */
export function validJobsQuery(q: string | undefined): q is string {
  return typeof q === "string" && q.length > 0 && q.length <= 600 && /^[a-z0-9=&%._-]+$/i.test(q);
}

/** Browser only: remember the current filters for a year. */
export function rememberJobsQuery(q: string): void {
  if (validJobsQuery(q)) document.cookie = `${JOBS_QUERY_COOKIE}=${q}; path=/; max-age=31536000; samesite=lax`;
}
