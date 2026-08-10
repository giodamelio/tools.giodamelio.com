export const ENTRY_TYPES = [
  "flight",
  "transit",
  "drive",
  "lodging",
  "booking",
  "note",
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

export const EVERYONE = "Everyone";

/* Times are local wall clock at the place, `YYYY-MM-DDTHH:MM`, never converted
   to UTC. `startTz`/`endTz` say where that clock is. */
export interface Entry {
  id: string;
  type: EntryType;
  start: string;
  startTz: string;
  end?: string;
  endTz?: string;
  from?: string;
  to?: string;
  operator?: string;
  service?: string;
  name?: string;
  people: string[];
}

export type EntryText = "from" | "to" | "operator" | "service" | "name";

/* What lives in Keeper of State. Documented for whoever calls it from the
   internet at public/llm.md — keep the two in step. */
export interface TripDoc {
  title: string;
  roster: string[];
  colors: Record<string, number>;
  tzMode: string;
  entries: Entry[];
}

/* The same trip as the app holds it. Identical today; named apart because the
   document is a wire format and this is not. */
export interface TripState {
  title: string;
  roster: string[];
  colors: Record<string, number>;
  tzMode: string;
  entries: Entry[];
}

export interface LibraryItem {
  id: string;
  role: "owner";
  key: string;
  title: string;
  created: string;
  modified: string;
}

export interface Library {
  v: 1;
  items: LibraryItem[];
}

export interface CreatedBlob {
  id: string;
  edit_key: string;
  created_at: string;
  url: string;
}

export interface AgentKey {
  key: string;
  expires_at: string;
}

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

/* What Smart Add proposes, before you have accepted any of it. `aid` is this
   session's handle on one proposal and never reaches the document. */
export type SmartAction =
  | { aid: string; kind: "add"; entry: Partial<Entry> }
  | { aid: string; kind: "update"; id: string; fields: Partial<Entry> }
  | { aid: string; kind: "people"; id: string; people: string[] }
  | { aid: string; kind: "delete"; id: string };

export type SmartActionKind = SmartAction["kind"];
