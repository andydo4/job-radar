/**
 * Deadline math. Dates are plain "YYYY-MM-DD" strings (Postgres `date`), and
 * "today" is computed in US Eastern time so a deadline doesn't flip a day early
 * or late depending on the server's timezone.
 */

export type Urgency = "none" | "past" | "danger" | "warning" | "ok";

export const WARNING_DAYS = 14;
export const DANGER_DAYS = 3;

/** Today's date in America/New_York as YYYY-MM-DD. */
export function todayET(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Whole days from `today` until `deadline` (0 = due today, negative = past). */
export function daysUntil(deadline: string, today: string): number {
  return Math.round((toUtcMs(deadline) - toUtcMs(today)) / 86_400_000);
}

export function urgencyFor(days: number | null): Urgency {
  if (days === null) return "none";
  if (days < 0) return "past";
  if (days <= DANGER_DAYS) return "danger";
  if (days <= WARNING_DAYS) return "warning";
  return "ok";
}

export function countdownLabel(days: number | null): string {
  if (days === null) return "No deadline";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** "2026-12-01" -> "Dec 1, 2026" (formatted as a calendar date, no timezone shift). */
export function formatDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(toUtcMs(ymd)),
  );
}

/**
 * Order for the Grad Programs table: upcoming deadlines soonest first, then
 * programs without a deadline, then past deadlines (most recent first).
 */
export function compareByDeadline<T extends { deadline: string | null }>(today: string) {
  const rank = (p: T) => (p.deadline === null ? 1 : daysUntil(p.deadline, today) < 0 ? 2 : 0);
  return (a: T, b: T): number => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.deadline === null || b.deadline === null) return 0;
    return ra === 2 ? b.deadline.localeCompare(a.deadline) : a.deadline.localeCompare(b.deadline);
  };
}
