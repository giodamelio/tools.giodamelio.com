import { describe, expect, it } from "vitest";
import {
  abbr,
  instantToWall,
  offsetText,
  toWall,
  wallToInstant,
  zoneOffset,
} from "../src/lib/time";

const HOUR = 3_600_000;

describe("zoneOffset", () => {
  it("reads a half-hour zone", () => {
    expect(zoneOffset(Date.UTC(2026, 0, 15, 12), "Asia/Kolkata")).toBe(5.5 * HOUR);
  });

  it("reads a three-quarter-hour zone", () => {
    expect(zoneOffset(Date.UTC(2026, 0, 15, 12), "Asia/Kathmandu")).toBe(5.75 * HOUR);
  });

  it("follows a zone across its own DST boundary", () => {
    const winter = zoneOffset(Date.UTC(2026, 0, 15, 12), "America/Chicago");
    const summer = zoneOffset(Date.UTC(2026, 6, 15, 12), "America/Chicago");
    expect(winter).toBe(-6 * HOUR);
    expect(summer).toBe(-5 * HOUR);
  });

  it("stays put in a zone that does not observe DST", () => {
    const winter = zoneOffset(Date.UTC(2026, 0, 15, 12), "America/Phoenix");
    const summer = zoneOffset(Date.UTC(2026, 6, 15, 12), "America/Phoenix");
    expect(winter).toBe(summer);
  });
});

describe("wallToInstant", () => {
  it("resolves an ordinary time", () => {
    // 9:00 in Chicago on a winter day is 15:00 UTC.
    expect(wallToInstant("2026-01-15T09:00", "America/Chicago")).toBe(
      Date.UTC(2026, 0, 15, 15),
    );
  });

  it("resolves a summer time on the other side of the boundary", () => {
    expect(wallToInstant("2026-07-15T09:00", "America/Chicago")).toBe(
      Date.UTC(2026, 6, 15, 14),
    );
  });

  it("round-trips through instantToWall in a half-hour zone", () => {
    const wall = "2026-03-29T02:30";
    const instant = wallToInstant(wall, "Asia/Kolkata");
    expect(instant).not.toBeNull();
    expect(instantToWall(instant as number, "Asia/Kolkata")).toBe(wall);
  });

  /* 2:30am does not exist in Chicago that morning. Any answer is a choice;
     what matters is that it is a real instant, and that reading it back does
     not claim the hour happened. */
  it("picks a real instant inside a spring-forward gap", () => {
    const instant = wallToInstant("2026-03-08T02:30", "America/Chicago") as number;
    expect(Number.isFinite(instant)).toBe(true);
    expect(instantToWall(instant, "America/Chicago")).not.toBe("2026-03-08T02:30");
    expect(["2026-03-08T01:30", "2026-03-08T03:30"]).toContain(
      instantToWall(instant, "America/Chicago"),
    );
  });

  /* 1:30am happens twice that morning. Both are correct; the answer has to be
     one of them and not something in between. */
  it("picks one of the two instants in a fall-back overlap", () => {
    const instant = wallToInstant("2026-11-01T01:30", "America/Chicago") as number;
    expect([Date.UTC(2026, 10, 1, 6, 30), Date.UTC(2026, 10, 1, 7, 30)]).toContain(instant);
    expect(instantToWall(instant, "America/Chicago")).toBe("2026-11-01T01:30");
  });

  /* An unset time, not an invalid one: nothing reaches here that toWall has
     not already read, so validation is its job and not this one's. */
  it("has nothing to say about a time that is not set", () => {
    expect(wallToInstant("", "UTC")).toBeNull();
    expect(wallToInstant(undefined, "UTC")).toBeNull();
  });
});

describe("toWall", () => {
  it("keeps a plain wall clock as it is", () => {
    expect(toWall("2022-12-18T14:06", "America/Chicago", "start")).toBe("2022-12-18T14:06");
  });

  it("drops seconds from a plain stamp", () => {
    expect(toWall("2022-12-18T14:06:30", "America/Chicago", "start")).toBe("2022-12-18T14:06");
  });

  it("resolves an offset-bearing stamp into the entry's own zone", () => {
    // 09:00-06:00 is 15:00 UTC, which is 09:00 in Chicago and 10:00 in New York.
    expect(toWall("2022-12-17T09:00:00-06:00", "America/Chicago", "start")).toBe(
      "2022-12-17T09:00",
    );
    expect(toWall("2022-12-17T09:00:00-06:00", "America/New_York", "start")).toBe(
      "2022-12-17T10:00",
    );
  });

  it("resolves a Z stamp", () => {
    expect(toWall("2022-12-17T15:00:00Z", "America/Chicago", "start")).toBe("2022-12-17T09:00");
  });

  it("says which time it could not read", () => {
    expect(() => toWall("next tuesday", "UTC", "start")).toThrow(/its start time/);
  });

  it("treats a missing time as no time", () => {
    expect(toWall(undefined, "UTC", "end")).toBe("");
  });
});

describe("abbr", () => {
  it("names the zone as it is at that instant", () => {
    expect(abbr(Date.UTC(2026, 0, 15, 18), "America/Chicago")).toBe("CST");
    expect(abbr(Date.UTC(2026, 6, 15, 18), "America/Chicago")).toBe("CDT");
  });
});

describe("offsetText", () => {
  it("writes whole hours without minutes", () => {
    expect(offsetText(-360)).toBe("UTC−6");
    expect(offsetText(540)).toBe("UTC+9");
  });

  it("writes partial hours with them", () => {
    expect(offsetText(330)).toBe("UTC+5:30");
    expect(offsetText(-210)).toBe("UTC−3:30");
  });

  it("writes UTC itself as +0", () => {
    expect(offsetText(0)).toBe("UTC+0");
  });
});
