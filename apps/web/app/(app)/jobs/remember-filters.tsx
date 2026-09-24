"use client";

import { useEffect } from "react";
import { rememberJobsQuery } from "@/lib/remember";

/**
 * Saves the filters you're looking at, so opening Jobs again (nav tab, home-screen app,
 * a new visit) brings them back. Runs only when the page is actually shown, not on link prefetches.
 */
export function RememberFilters({ query }: { query: string }) {
  useEffect(() => rememberJobsQuery(query), [query]);
  return null;
}
