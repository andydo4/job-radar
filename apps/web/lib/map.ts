// Pure helpers for the Jobs map: where each role is, counts per state and city, and the color bands.
// No server-only imports, so the map component and the tests can use it too.

export const REMOTE = "REMOTE";
/** Roles whose locations don't name a state ("3 Locations", "United States"). */
export const NO_STATE = "NONE";

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
  [REMOTE]: "Remote (US)",
  [NO_STATE]: "No state listed",
};

export const placeName = (code: string) => STATE_NAMES[code] ?? code;

/** A valid ?state= value. */
export function parseState(v: string | undefined): string | undefined {
  return v && (v in STATE_NAMES) ? v : undefined;
}

/** A valid ?city= value (letters, spaces, dots, hyphens, apostrophes). */
export function parseCity(v: string | undefined): string | undefined {
  return v && /^[\p{L} .'-]{1,60}$/u.test(v) ? v : undefined;
}

/** What the map needs from one listing. */
export interface MapListing {
  states?: string[] | null;
  places?: string[] | null;
}

/** What the map needs from one role (possibly several listings). */
export interface MapRole {
  listings: MapListing[];
  isNew: boolean;
  lead: { company_id: string; company?: { name: string } | null };
}

/** States a role is in (any of its listings). No state at all -> NO_STATE. */
export function roleStates(g: MapRole): string[] {
  const s = new Set<string>();
  for (const l of g.listings) for (const st of l.states ?? []) s.add(st);
  return s.size ? [...s] : [NO_STATE];
}

/** Cities a role lists in one state ("" when a listing names the state but no city). */
export function roleCities(g: MapRole, state: string): string[] {
  const s = new Set<string>();
  for (const l of g.listings) {
    for (const p of l.places ?? []) {
      const [st, city = ""] = p.split("|");
      if (st === state) s.add(city);
    }
    // A listing in the state with no place entry (shouldn't happen, but keep the counts honest).
    if (!(l.places ?? []).some((p) => p.startsWith(`${state}|`)) && (l.states ?? []).includes(state)) s.add("");
  }
  return [...s];
}

export function inPlace(g: MapRole, state: string, city?: string): boolean {
  if (!roleStates(g).includes(state)) return false;
  return city === undefined || roleCities(g, state).includes(city);
}

export interface StateCount {
  code: string;
  roles: number;
  fresh: number;
  /** Up to 3 company names with the most roles there. */
  top: string[];
}

/** Roles per state (a role in two states counts in both), plus REMOTE and NO_STATE. */
export function stateCounts(groups: MapRole[]): StateCount[] {
  const acc = new Map<string, { roles: number; fresh: number; cos: Map<string, number> }>();
  for (const g of groups) {
    const name = g.lead.company?.name ?? g.lead.company_id;
    for (const st of roleStates(g)) {
      const a = acc.get(st) ?? { roles: 0, fresh: 0, cos: new Map() };
      a.roles++;
      if (g.isNew) a.fresh++;
      a.cos.set(name, (a.cos.get(name) ?? 0) + 1);
      acc.set(st, a);
    }
  }
  return [...acc]
    .map(([code, a]) => ({
      code,
      roles: a.roles,
      fresh: a.fresh,
      top: [...a.cos].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 3).map(([n]) => n),
    }))
    .sort((a, b) => b.roles - a.roles || a.code.localeCompare(b.code));
}

/** Roles per city inside one state, biggest first; "" (no city given) last. */
export function cityCounts(groups: MapRole[], state: string): { city: string; roles: number }[] {
  const acc = new Map<string, number>();
  for (const g of groups) {
    if (!roleStates(g).includes(state)) continue;
    for (const c of roleCities(g, state)) acc.set(c, (acc.get(c) ?? 0) + 1);
  }
  return [...acc]
    .map(([city, roles]) => ({ city, roles }))
    .sort((a, b) => (a.city === "") !== (b.city === "") ? (a.city === "" ? 1 : -1) : b.roles - a.roles || a.city.localeCompare(b.city));
}

/** A friendly number just above n: 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, ... */
function nice(n: number): number {
  if (n <= 3) return Math.max(1, Math.ceil(n));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const mag = 10 ** Math.floor(Math.log10(n));
  for (const s of steps) if (s * mag >= n) return Math.round(s * mag);
  return 10 * mag;
}

/**
 * Up to 5 color bands for the map, as lower bounds: [1, 5, 15, 40, 100] means
 * 1-4, 5-14, 15-39, 40-99, 100+. Bands follow the spread of the counts (quantiles),
 * so a few big states (MA, CA) don't leave every other state looking empty.
 */
export function bands(counts: number[]): number[] {
  const vals = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (!vals.length) return [];
  const distinct = [...new Set(vals)];
  if (distinct.length <= 5) return distinct;
  const out = [1];
  for (const q of [0.2, 0.4, 0.6, 0.8]) {
    const v = nice(vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]! + 1);
    if (v > out[out.length - 1]! && v <= vals[vals.length - 1]!) out.push(v);
  }
  return out;
}

/** Which band (1-5) a count falls in; 0 = no roles. */
export function bandOf(n: number, lows: number[]): number {
  if (n <= 0 || !lows.length) return 0;
  let b = 0;
  for (let i = 0; i < lows.length; i++) if (n >= lows[i]!) b = i;
  // Spread fewer than 5 bands over the darker end so the top band is always the strongest color.
  return b + 1 + (5 - lows.length);
}

/** "1–4", "100+", "7" */
export function bandLabel(lows: number[], i: number): string {
  const lo = lows[i]!;
  const next = lows[i + 1];
  if (next === undefined) return i === 0 && lows.length === 1 ? String(lo) : `${lo}+`;
  return next - 1 === lo ? String(lo) : `${lo}–${next - 1}`;
}
