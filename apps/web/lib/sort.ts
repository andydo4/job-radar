// Sorting helpers for the job list (no server imports, so they're unit-tested in test/sort.test.ts).

interface Listing {
  posted_at: string | null;
  first_seen_at: string;
  is_backlog: boolean;
}

/** When a role was posted, for sorting (ms): its most recent listing; backlog with no posted date = oldest. */
export function postedTime(g: { listings: Listing[] }): number {
  let best = 0;
  for (const l of g.listings) {
    const found = new Date(l.first_seen_at).getTime();
    const t = l.posted_at ? Math.min(new Date(l.posted_at).getTime(), found) : l.is_backlog ? 0 : found;
    if (t > best) best = t;
  }
  return best;
}

