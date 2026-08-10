import type { Entry, EntryType, SmartAction } from "../types";
import { SCHEMA } from "./schema";

/* What the fields of an action are editing: a new entry, or a patch onto an
   existing one. A `people` action edits neither. */
export function actionSource(action: SmartAction): Partial<Entry> {
  if (action.kind === "add") return action.entry;
  if (action.kind === "update") return action.fields;
  return {};
}

export function actionPeople(action: SmartAction): string[] {
  if (action.kind === "people") return action.people;
  return actionSource(action).people ?? [];
}

export function withPeople(action: SmartAction, people: string[]): SmartAction {
  if (action.kind === "people") return { ...action, people };
  if (action.kind === "add") return { ...action, entry: { ...action.entry, people } };
  if (action.kind === "update") return { ...action, fields: { ...action.fields, people } };
  return action;
}

export function withField(action: SmartAction, key: keyof Entry, value: string): SmartAction {
  if (action.kind === "add") return { ...action, entry: { ...action.entry, [key]: value } };
  if (action.kind === "update")
    return { ...action, fields: { ...action.fields, [key]: value } };
  return action;
}

/* The type whose form an action's fields belong to: its own if it brought one,
   otherwise the entry it is changing. */
export function actionType(action: SmartAction, entries: readonly Entry[]): EntryType {
  const own = actionSource(action).type;
  if (own) return own;
  if (action.kind === "add") return "note";
  return entries.find((e) => e.id === action.id)?.type ?? "note";
}

function label(entry: Partial<Entry> | undefined): string {
  if (!entry) return "an entry";
  if (entry.type === "flight" || entry.type === "transit" || entry.type === "drive") {
    return `${entry.from || "?"} → ${entry.to || "?"}`;
  }
  return entry.name || (entry.type ? SCHEMA[entry.type].label : "") || "entry";
}

export interface ActionDescription {
  summary: string;
  detail: string;
}

/* Said in the words of the form, not the document: "Change the airline and the
   departs", never "Change operator, start". */
export function describeAction(
  action: SmartAction,
  entries: readonly Entry[],
): ActionDescription {
  const existing = action.kind === "add" ? undefined : entries.find((e) => e.id === action.id);

  if (action.kind === "add") {
    const src = action.entry;
    return {
      summary: label(src),
      detail: [
        src.type ? SCHEMA[src.type].label : "",
        [src.operator, src.service].filter(Boolean).join(" "),
        src.start,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (action.kind === "update") {
    const fields = SCHEMA[existing?.type ?? "note"].fields;
    const human = (key: string) => {
      const match = fields.find(
        (f) => f.key === key || (f.kind === "when" && f.zoneKey === key),
      );
      return match ? match.label.toLowerCase() : key;
    };
    const changed = [...new Set(Object.keys(action.fields).map(human))];
    return { summary: label(existing), detail: `Change the ${changed.join(" and ")}` };
  }

  if (action.kind === "people") {
    return {
      summary: label(existing),
      detail: `Travelers become ${action.people.join(", ")}`,
    };
  }

  return { summary: label(existing), detail: "Remove this entry" };
}
