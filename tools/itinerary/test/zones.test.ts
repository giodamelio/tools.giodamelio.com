import { describe, expect, it } from "vitest";
import {
  searchRank,
  shortZoneName,
  zoneById,
  zoneGroups,
  zoneLabelFor,
  zoneTable,
} from "../src/lib/zones";

describe("zoneTable", () => {
  it("lists the zones the engine knows", () => {
    expect(zoneTable().length).toBeGreaterThan(300);
  });

  it("always carries UTC, which the enumeration leaves out", () => {
    expect(zoneById("UTC")).not.toBeNull();
  });

  it("gives a zone its country and offset", () => {
    const zone = zoneById("Asia/Kolkata");
    expect(zone?.city).toBe("Kolkata");
    expect(zone?.country).toBe("India");
    expect(zone?.offsetLabel).toBe("UTC+5:30");
  });

  /* Engines disagree about which spelling they enumerate — older ICU still
     says Asia/Calcutta — so both have to lead to the same zone, shown under
     the name tzdb uses today. */
  it("answers to a name it used to go by and to the current one", () => {
    expect(zoneById("Asia/Calcutta")?.canonical).toBe("Asia/Kolkata");
    expect(zoneById("Asia/Kolkata")?.canonical).toBe("Asia/Kolkata");
    expect(zoneById("Asia/Calcutta")).toBe(zoneById("Asia/Kolkata"));
  });

  it("searches on a major city the id never mentions", () => {
    expect(zoneById("Asia/Kolkata")?.search).toContain("mumbai");
  });

  it("files a two-part id under its region", () => {
    expect(zoneById("Europe/Paris")?.region).toBe("Europe");
  });

  it("keeps the middle of a three-part id", () => {
    expect(zoneById("America/Indiana/Knox")?.within).toBe("Indiana");
  });
});

describe("zoneLabelFor", () => {
  it("names the city and its offset", () => {
    expect(zoneLabelFor("Europe/London")).toMatch(/^London · UTC[+−]/);
  });

  it("falls back to whatever it was given", () => {
    expect(zoneLabelFor("Nowhere/Special")).toBe("Nowhere/Special");
  });
});

describe("searchRank", () => {
  it("puts a city that starts with the query first", () => {
    const paris = zoneById("Europe/Paris")!;
    const paramaribo = zoneById("America/Paramaribo")!;
    expect(searchRank(paris, "par")).toBe(0);
    expect(searchRank(paramaribo, "par")).toBe(0);
  });

  it("ranks a country match below a city match", () => {
    const kolkata = zoneById("Asia/Kolkata")!;
    expect(searchRank(kolkata, "kol")).toBeLessThan(searchRank(kolkata, "ind"));
  });

  it("ranks an id-only match last of the matches", () => {
    const knox = zoneById("America/Indiana/Knox")!;
    expect(searchRank(knox, "indiana")).toBe(4);
  });
});

describe("zoneGroups", () => {
  it("opens with your own zone", () => {
    const groups = zoneGroups([], "");
    expect(groups[0].label).toBe("Your timezone");
    expect(groups[0].zones).toHaveLength(1);
  });

  it("puts the trip's own zones next, west to east", () => {
    const groups = zoneGroups(["Asia/Tokyo", "America/Denver", "Europe/London"], "");
    const trip = groups.find((g) => g.label === "In this trip");
    expect(trip?.zones.map((z) => z.id)).toEqual([
      "America/Denver",
      "Europe/London",
      "Asia/Tokyo",
    ]);
  });

  it("lists a zone once, in the first group that claims it", () => {
    const groups = zoneGroups(["Europe/London"], "");
    const ids = groups.flatMap((g) => g.zones.map((z) => z.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("collapses to one unlabelled group when searching", () => {
    const groups = zoneGroups([], "tokyo");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].zones[0].id).toBe("Asia/Tokyo");
  });

  it("finds a zone by a city that is not in its name", () => {
    const groups = zoneGroups([], "mumbai");
    expect(groups[0].zones.map((z) => z.canonical)).toContain("Asia/Kolkata");
  });

  it("finds nothing for nonsense", () => {
    expect(zoneGroups([], "zzzzzz")[0].zones).toHaveLength(0);
  });
});

describe("shortZoneName", () => {
  it("takes the last segment and unbreaks it", () => {
    expect(shortZoneName("America/Los_Angeles")).toBe("Los Angeles");
    expect(shortZoneName("UTC")).toBe("UTC");
  });
});
