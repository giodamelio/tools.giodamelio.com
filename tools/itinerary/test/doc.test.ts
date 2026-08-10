import { describe, expect, it } from "vitest";
import {
  assignColors,
  colorMap,
  fromDoc,
  nextPeople,
  peopleOf,
  rosterOrder,
  toDoc,
} from "../src/lib/doc";
import { EVERYONE, type TripDoc } from "../src/types";

/* The example from public/llm.md, which is the published contract, with its
   keys in the order the app writes them. */
const EXAMPLE: TripDoc = {
  title: "Christmas 2022",
  roster: ["Kirsten", "Gio"],
  colors: { Kirsten: 1, Gio: 4 },
  tzMode: "local",
  entries: [
    {
      id: "a2",
      type: "flight",
      start: "2022-12-18T14:06",
      startTz: "America/Chicago",
      end: "2022-12-18T16:25",
      endTz: "America/Denver",
      from: "Birmingham",
      to: "Denver",
      operator: "United",
      service: "UAL4690",
      people: ["Kirsten", "Gio"],
    },
  ],
};

describe("toDoc / fromDoc", () => {
  it("round-trips the documented example unchanged", () => {
    expect(toDoc(fromDoc(EXAMPLE))).toEqual(EXAMPLE);
  });

  it("round-trips it byte for byte, key order and all", () => {
    expect(JSON.stringify(toDoc(fromDoc(EXAMPLE)))).toBe(JSON.stringify(EXAMPLE));
  });

  it("is stable over a second round trip", () => {
    const once = toDoc(fromDoc(EXAMPLE));
    expect(JSON.stringify(toDoc(fromDoc(once)))).toBe(JSON.stringify(once));
  });

  it("drops a key an entry has no business carrying", () => {
    const doc = toDoc(
      fromDoc({ ...EXAMPLE, entries: [{ ...EXAMPLE.entries[0], view: "calendar" }] }),
    );
    expect(doc.entries[0]).not.toHaveProperty("view");
  });

  it("leaves out end and endTz when there is no end", () => {
    const doc = toDoc(
      fromDoc({
        ...EXAMPLE,
        entries: [{ id: "n1", type: "note", start: "2022-12-18T09:00", startTz: "UTC" }],
      }),
    );
    expect(doc.entries[0]).not.toHaveProperty("end");
    expect(doc.entries[0]).not.toHaveProperty("endTz");
  });

  it("defaults a missing end zone to the start zone", () => {
    const state = fromDoc({
      ...EXAMPLE,
      entries: [
        {
          id: "a1",
          type: "drive",
          start: "2022-12-18T09:00",
          startTz: "America/Chicago",
          end: "2022-12-18T12:00",
        },
      ],
    });
    expect(state.entries[0].endTz).toBe("America/Chicago");
  });

  it("gives an entry with no id one of its own", () => {
    const state = fromDoc({
      ...EXAMPLE,
      entries: [{ type: "note", start: "2022-12-18T09:00", startTz: "UTC" }],
    });
    expect(state.entries[0].id).toMatch(/^e/);
  });

  it("falls back to a note for a type it does not know", () => {
    const state = fromDoc({
      ...EXAMPLE,
      entries: [{ id: "x", type: "submarine", start: "", startTz: "UTC" }],
    });
    expect(state.entries[0].type).toBe("note");
  });

  it("refuses a document that is not one", () => {
    expect(() => fromDoc(null)).toThrow(/shape this app can read/);
    expect(() => fromDoc("a trip")).toThrow(/shape this app can read/);
  });

  it("says which item it could not read", () => {
    expect(() => fromDoc({ entries: [null] })).toThrow(/item 1/);
  });

  it("ignores a colour slot outside the palette", () => {
    const state = fromDoc({ ...EXAMPLE, colors: { Gio: 9, Kirsten: 1, Sam: 2.5 } });
    expect(state.colors).toEqual({ Kirsten: 1 });
  });
});

describe("rosterOrder", () => {
  it("keeps the stored order and appends anyone only an entry names", () => {
    const state = fromDoc({
      ...EXAMPLE,
      roster: ["Kirsten", "Gio"],
      entries: [{ ...EXAMPLE.entries[0], people: ["Sam", "Gio"] }],
    });
    expect(rosterOrder(state)).toEqual(["Kirsten", "Gio", "Sam"]);
  });

  it("never lets the sentinel into the roster", () => {
    const state = fromDoc({
      ...EXAMPLE,
      roster: [],
      entries: [{ ...EXAMPLE.entries[0], people: [EVERYONE] }],
    });
    expect(rosterOrder(state)).toEqual([]);
    expect(toDoc(state).roster).toEqual([]);
  });
});

describe("assignColors", () => {
  it("leaves a stored slot alone", () => {
    expect(assignColors(["Kirsten", "Gio"], { Kirsten: 1, Gio: 4 })).toEqual({
      Kirsten: 1,
      Gio: 4,
    });
  });

  /* A colour is booked for as long as the document says so, even after the
     person leaves the trip — otherwise their entries would recolour. */
  it("keeps someone on their slot when another person is dropped", () => {
    const before = assignColors(["Kirsten", "Gio", "Sam"], {});
    const after = assignColors(["Kirsten", "Sam"], before);
    expect(after.Kirsten).toBe(before.Kirsten);
    expect(after.Sam).toBe(before.Sam);
    expect(after.Gio).toBe(before.Gio);
  });

  it("gives everyone a slot of their own until the palette runs out", () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    const slots = assignColors(names, {});
    expect(new Set(Object.values(slots)).size).toBe(6);
  });

  it("gives the same name the same slot across trips", () => {
    expect(assignColors(["Kirsten"], {}).Kirsten).toBe(assignColors(["Kirsten"], {}).Kirsten);
  });

  it("never books a slot for the sentinel", () => {
    expect(assignColors([EVERYONE, "Gio"], {})).not.toHaveProperty(EVERYONE);
  });

  it("is what the document records", () => {
    const state = fromDoc({ ...EXAMPLE, colors: {} });
    expect(toDoc(state).colors).toEqual(colorMap(state));
  });
});

describe("peopleOf", () => {
  it("reads a list", () => {
    expect(peopleOf({ people: ["Gio", "Kirsten"] })).toEqual(["Gio", "Kirsten"]);
  });
});

describe("nextPeople", () => {
  function box(initial?: string[]) {
    let held = initial;
    return { get: () => held, set: (v: string[] | undefined) => (held = v) };
  }

  it("adds a name", () => {
    expect(nextPeople(["Gio"], "Kirsten", true, box())).toEqual(["Gio", "Kirsten"]);
  });

  it("does not add one twice", () => {
    expect(nextPeople(["Gio"], "Gio", true, box())).toEqual(["Gio"]);
  });

  it("removes a name", () => {
    expect(nextPeople(["Gio", "Kirsten"], "Gio", false, box())).toEqual(["Kirsten"]);
  });

  it("turning the sentinel on replaces the list", () => {
    expect(nextPeople(["Gio"], EVERYONE, true, box())).toEqual([EVERYONE]);
  });

  it("turning it off puts back what it displaced", () => {
    const held = box();
    const on = nextPeople(["Gio", "Kirsten"], EVERYONE, true, held);
    expect(nextPeople(on, EVERYONE, false, held)).toEqual(["Gio", "Kirsten"]);
  });

  it("naming someone drops the sentinel", () => {
    expect(nextPeople([EVERYONE], "Gio", true, box())).toEqual(["Gio"]);
  });
});
