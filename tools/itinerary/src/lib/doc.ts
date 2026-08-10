import { ENTRY_TYPES, EVERYONE } from "../types";
import type { Entry, EntryText, EntryType, TripDoc, TripState } from "../types";
import { toWall } from "./time";
import { repairedEntryId } from "./id";

export const PALETTE_SIZE = 6;

const TEXT_KEYS: readonly EntryText[] = ["from", "to", "operator", "service", "name"];

export const UNTITLED = "Untitled trip";

export function emptyDoc(): TripDoc {
  return { title: UNTITLED, roster: [], colors: {}, tzMode: "local", entries: [] };
}

export function emptyState(): TripState {
  return { title: "", roster: [], colors: {}, tzMode: "local", entries: [] };
}

function isEntryType(value: unknown): value is EntryType {
  return ENTRY_TYPES.includes(value as EntryType);
}

/* The stored blob is plain readable JSON rather than a packed array, so an
   agent holding a key can edit it without a codec. */
export function toDoc(state: TripState): TripDoc {
  return {
    title: state.title || "",
    roster: rosterOrder(state),
    colors: colorMap(state),
    tzMode: state.tzMode,
    entries: state.entries.map((entry) => {
      /* Built key by key rather than as one literal: the insertion order is
         the order the stored JSON reads in, and `people` belongs last. */
      const out = {
        id: entry.id,
        type: entry.type,
        start: entry.start || "",
        startTz: entry.startTz || "UTC",
      } as Entry;
      if (entry.end) {
        out.end = entry.end;
        out.endTz = entry.endTz || entry.startTz || "UTC";
      }
      for (const key of TEXT_KEYS) if (entry[key]) out[key] = entry[key];
      out.people = Array.isArray(entry.people) ? entry.people.slice() : [];
      return out;
    }),
  };
}

export function fromDoc(doc: unknown): TripState {
  if (!doc || typeof doc !== "object") {
    throw new Error("its contents are not in a shape this app can read");
  }
  const raw = doc as Record<string, unknown>;
  const rows = Array.isArray(raw.entries) ? raw.entries : [];

  const entries = rows.map((row: unknown, n: number): Entry => {
    if (!row || typeof row !== "object") {
      throw new Error(`item ${n + 1} is not in a shape this app can read`);
    }
    const e = row as Record<string, unknown>;
    const type = isEntryType(e.type) ? e.type : "note";
    const startTz = typeof e.startTz === "string" && e.startTz ? e.startTz : "UTC";

    const out: Entry = {
      id: typeof e.id === "string" && e.id ? e.id : repairedEntryId(n),
      type,
      start: toWall(e.start, startTz, "start"),
      startTz,
      people: Array.isArray(e.people)
        ? e.people.filter((p): p is string => typeof p === "string" && !!p)
        : [],
    };
    if (e.end) {
      out.endTz = typeof e.endTz === "string" && e.endTz ? e.endTz : startTz;
      out.end = toWall(e.end, out.endTz, "end");
    }
    for (const key of TEXT_KEYS) if (e[key]) out[key] = String(e[key]);
    return out;
  });

  const colors: Record<string, number> = {};
  if (raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)) {
    for (const [name, slot] of Object.entries(raw.colors as Record<string, unknown>)) {
      if (isSlot(slot)) colors[name] = slot;
    }
  }

  return {
    title: typeof raw.title === "string" ? raw.title : "",
    colors,
    roster: Array.isArray(raw.roster)
      ? raw.roster.filter((p): p is string => typeof p === "string" && !!p)
      : [],
    tzMode: raw.tzMode === "local" || !raw.tzMode ? "local" : String(raw.tzMode),
    entries,
  };
}

function isSlot(value: unknown): value is number {
  return (
    typeof value === "number" &&
    value >= 0 &&
    value < PALETTE_SIZE &&
    value === Math.floor(value)
  );
}

export function peopleOf(entry: Pick<Entry, "people">): string[] {
  if (Array.isArray(entry.people)) return entry.people;
  return String(entry.people ?? "")
    .split(/,| and /i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/* The stored list comes first and keeps its order; anyone who only appears on
   an entry is appended. Colours hang off this order, so it has to be stable as
   entries are edited. */
export function rosterOrder(state: Pick<TripState, "roster" | "entries">): string[] {
  const names: string[] = [];
  const add = (name: string) => {
    if (name && name !== EVERYONE && !names.includes(name)) names.push(name);
  };
  for (const name of state.roster ?? []) add(name);
  for (const entry of state.entries ?? []) for (const name of peopleOf(entry)) add(name);
  return names;
}

export function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % PALETTE_SIZE;
}

/* A colour is a stored fact, not something recomputed each time. A name new to
   the itinerary gets one from the hash of the name — so the same person tends
   to keep their colour across trips — and from then on the document says what
   it is.

   Entries here outlive the roster on purpose. Drop someone from the trip and
   their colour stays booked, so nobody else inherits it and they get it back
   if they return. */
export function assignColors(
  names: readonly string[],
  existing: Record<string, number> | undefined,
): Record<string, number> {
  const slots: Record<string, number> = {};
  const taken: Record<number, boolean> = {};

  for (const [name, slot] of Object.entries(existing ?? {})) {
    if (isSlot(slot)) {
      slots[name] = slot;
      taken[slot] = true;
    }
  }

  for (const name of names) {
    if (name === EVERYONE || Object.prototype.hasOwnProperty.call(slots, name)) continue;
    let slot = nameHash(name);
    for (let i = 0; i < PALETTE_SIZE && taken[slot]; i++) slot = (slot + 1) % PALETTE_SIZE;
    taken[slot] = true;
    slots[name] = slot;
  }
  return slots;
}

export function colorMap(state: TripState): Record<string, number> {
  return assignColors(rosterOrder(state), state.colors);
}

/* Toggling one name. "Everyone" is a sentinel, not a roster member: turning it
   on replaces the list and remembers what was there, turning it off puts that
   list back. */
export function nextPeople(
  current: readonly string[],
  name: string,
  on: boolean,
  remembered: { get(): string[] | undefined; set(value: string[] | undefined): void },
): string[] {
  if (name === EVERYONE) {
    if (on) {
      if (current.length && !current.includes(EVERYONE)) remembered.set(current.slice());
      return [EVERYONE];
    }
    const restored = remembered.get();
    remembered.set(undefined);
    return restored ?? [];
  }
  if (on) {
    return current.filter((x) => x !== EVERYONE).concat(current.includes(name) ? [] : [name]);
  }
  return current.filter((x) => x !== name);
}
