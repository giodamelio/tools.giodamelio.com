import type { EntryType } from "../types";

export const ZONES: ReadonlyArray<readonly [string, string]> = [
  ["America/Los_Angeles", "Pacific — Los Angeles"],
  ["America/Denver", "Mountain — Denver"],
  ["America/Phoenix", "Arizona — Phoenix"],
  ["America/Chicago", "Central — Chicago"],
  ["America/New_York", "Eastern — New York"],
  ["America/Anchorage", "Alaska — Anchorage"],
  ["Pacific/Honolulu", "Hawaii — Honolulu"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Paris / Berlin"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["UTC", "UTC"],
];

export interface Model {
  id: string;
  label: string;
  note: string;
  suggested: boolean;
}

export const MODELS: readonly Model[] = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "Fast and cheap; good at pulling structure out of emails",
    suggested: true,
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    note: "Reliable and inexpensive",
    suggested: false,
  },
  {
    id: "anthropic/claude-3.5-haiku",
    label: "Claude 3.5 Haiku",
    note: "Careful with dates and time zones",
    suggested: false,
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 mini",
    note: "A step up when a booking is messy",
    suggested: false,
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    note: "Slowest and priciest; for long, tangled emails",
    suggested: false,
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

export const SYSTEM_PROMPT = [
  "You turn travel booking text into edit actions for an itinerary app.",
  'Reply with JSON only: {"actions": [...]}. Each action is one of:',
  '  {"kind":"add", "entry": <entry>}',
  '  {"kind":"update", "id": "<existing id>", "fields": <partial entry>}',
  '  {"kind":"people", "id": "<existing id>", "people": ["Name", ...]}',
  '  {"kind":"delete", "id": "<existing id>"}',
  "An entry looks like:",
  '  {"type":"flight|transit|drive|lodging|booking|note", "operator":"United", "service":"UA1486",',
  '   "name":"for lodging/booking/note", "from":"origin or address", "to":"destination",',
  '   "start":"YYYY-MM-DDTHH:MM", "startTz":"IANA zone", "end":"YYYY-MM-DDTHH:MM", "endTz":"IANA zone",',
  '   "people":["Name"] or ["Everyone"]}',
  "Times are always LOCAL WALL-CLOCK time at that place, never converted to UTC.",
  "Always set startTz (and endTz when there is an end) to the IANA zone of that city, e.g. America/Chicago.",
  "Split multi-leg trips into one action per leg. Do not invent data that is not in the text.",
  'Prefer existing people names when the text names travelers; otherwise use ["Everyone"].',
].join("\n");

export const TYPE_PLURALS: Record<EntryType, string> = {
  flight: "Flights",
  transit: "Trains & buses",
  drive: "Drives",
  lodging: "Lodging",
  booking: "Reservations",
  note: "Notes",
};

export const HINTS: Record<EntryType, string> = {
  flight: "depart / arrive",
  transit: "depart / arrive",
  drive: "leave / arrive",
  lodging: "check in / out",
  booking: "a time and place",
  note: "anything else",
};

/* One row is one control in the entry form: which key it writes, what it is
   called, and — for a time — which key holds that time's zone. */
export type FieldSpec =
  | { key: "from" | "to" | "operator" | "service" | "name"; label: string; kind: "text" }
  | { key: "start" | "end"; label: string; kind: "when"; zoneKey: "startTz" | "endTz" };

export interface TypeSchema {
  label: string;
  fields: readonly FieldSpec[];
}

export const SCHEMA: Record<EntryType, TypeSchema> = {
  flight: {
    label: "Flight",
    fields: [
      { key: "operator", label: "Airline", kind: "text" },
      { key: "service", label: "Flight no.", kind: "text" },
      { key: "from", label: "From", kind: "text" },
      { key: "to", label: "To", kind: "text" },
      { key: "start", label: "Departs", kind: "when", zoneKey: "startTz" },
      { key: "end", label: "Arrives", kind: "when", zoneKey: "endTz" },
    ],
  },
  transit: {
    label: "Train / bus",
    fields: [
      { key: "operator", label: "Operator", kind: "text" },
      { key: "service", label: "Service", kind: "text" },
      { key: "from", label: "From", kind: "text" },
      { key: "to", label: "To", kind: "text" },
      { key: "start", label: "Departs", kind: "when", zoneKey: "startTz" },
      { key: "end", label: "Arrives", kind: "when", zoneKey: "endTz" },
    ],
  },
  drive: {
    label: "Drive",
    fields: [
      { key: "from", label: "From", kind: "text" },
      { key: "to", label: "To", kind: "text" },
      { key: "start", label: "Leaves", kind: "when", zoneKey: "startTz" },
      { key: "end", label: "Arrives", kind: "when", zoneKey: "endTz" },
    ],
  },
  lodging: {
    label: "Lodging",
    fields: [
      { key: "name", label: "Place", kind: "text" },
      { key: "from", label: "Address", kind: "text" },
      { key: "start", label: "Check in", kind: "when", zoneKey: "startTz" },
      { key: "end", label: "Check out", kind: "when", zoneKey: "endTz" },
    ],
  },
  booking: {
    label: "Reservation",
    fields: [
      { key: "name", label: "What", kind: "text" },
      { key: "from", label: "Where", kind: "text" },
      { key: "start", label: "When", kind: "when", zoneKey: "startTz" },
    ],
  },
  note: {
    label: "Note",
    fields: [
      { key: "name", label: "Note", kind: "text" },
      { key: "start", label: "When", kind: "when", zoneKey: "startTz" },
    ],
  },
};

export const SAVE_NOTES: Record<string, string> = {
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};
