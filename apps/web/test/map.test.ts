import { describe, expect, it } from "vitest";
import { bandLabel, bandOf, bands, cityCounts, inPlace, parseCity, parseState, roleStates, stateCounts, NO_STATE } from "../lib/map";
import { validJobsQuery } from "../lib/remember";

const role = (co: string, listings: { states: string[]; places: string[] }[], isNew = false) => ({
  listings,
  isNew,
  lead: { company_id: co, company: { name: co.toUpperCase() } },
});

const roles = [
  role("moderna", [{ states: ["MA"], places: ["MA|Cambridge"] }], true),
  role("moderna", [{ states: ["MA"], places: ["MA|Norwood"] }]),
  // One role, two listings, two states: counts once in each state.
  role("pfizer", [{ states: ["MA"], places: ["MA|Cambridge"] }, { states: ["NY"], places: ["NY|New York"] }], true),
  role("genentech", [{ states: ["CA", "REMOTE"], places: ["CA|South San Francisco", "REMOTE|"] }]),
  role("lilly", [{ states: [], places: [] }]),
  role("takeda", [{ states: ["MA"], places: ["MA|"] }]),
];

describe("map counts", () => {
  it("counts roles per state, new ones, and top companies", () => {
    const c = stateCounts(roles);
    expect(c[0]).toEqual({ code: "MA", roles: 4, fresh: 2, top: ["MODERNA", "PFIZER", "TAKEDA"] });
    expect(c.find((x) => x.code === "NY")).toMatchObject({ roles: 1, fresh: 1 });
    expect(c.find((x) => x.code === "REMOTE")).toMatchObject({ roles: 1 });
    expect(c.find((x) => x.code === NO_STATE)).toMatchObject({ roles: 1, top: ["LILLY"] });
  });

  it("breaks a state down by city, no-city last", () => {
    expect(cityCounts(roles, "MA")).toEqual([
      { city: "Cambridge", roles: 2 },
      { city: "Norwood", roles: 1 },
      { city: "", roles: 1 },
    ]);
  });

  it("filters roles to a state and city", () => {
    expect(roles.filter((g) => inPlace(g, "MA")).length).toBe(4);
    expect(roles.filter((g) => inPlace(g, "MA", "Cambridge")).length).toBe(2);
    expect(roles.filter((g) => inPlace(g, "MA", "")).length).toBe(1);
    expect(roles.filter((g) => inPlace(g, NO_STATE)).length).toBe(1);
    expect(roleStates(roles[2]!).sort()).toEqual(["MA", "NY"]);
  });
});

describe("color bands", () => {
  it("few distinct counts: one band each, darkest on top", () => {
    const lows = bands([0, 2, 2, 7]);
    expect(lows).toEqual([2, 7]);
    expect(bandOf(0, lows)).toBe(0);
    expect(bandOf(2, lows)).toBe(4);
    expect(bandOf(7, lows)).toBe(5);
    expect(bandLabel(lows, 0)).toBe("2–6");
    expect(bandLabel(lows, 1)).toBe("7+");
  });

  it("skewed counts spread over 5 bands (MA and CA don't flatten the rest)", () => {
    const counts = [300, 180, 60, 40, 22, 15, 12, 9, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1];
    const lows = bands(counts);
    expect(lows.length).toBe(5);
    expect(lows[0]).toBe(1);
    expect([...lows].sort((a, b) => a - b)).toEqual(lows);
    expect(bandOf(300, lows)).toBe(5);
    expect(bandOf(1, lows)).toBe(1);
    expect(new Set(counts.map((n) => bandOf(n, lows))).size).toBe(5);
  });

  it("no roles anywhere: no bands", () => {
    expect(bands([0, 0])).toEqual([]);
    expect(bandOf(3, [])).toBe(0);
  });
});

describe("map URL params", () => {
  it("accepts real states, REMOTE, NONE and plain city names", () => {
    expect(parseState("MA")).toBe("MA");
    expect(parseState("REMOTE")).toBe("REMOTE");
    expect(parseState("ZZ")).toBeUndefined();
    expect(parseCity("South San Francisco")).toBe("South San Francisco");
    expect(parseCity("<script>")).toBeUndefined();
  });
  it("remembers a map query with a city", () => {
    expect(validJobsQuery("view=all&mode=map&state=CA&city=South+San+Francisco")).toBe(true);
  });
});
