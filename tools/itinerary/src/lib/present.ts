import type { CSSProperties } from "vue";
import { EVERYONE } from "../types";
import type { Entry } from "../types";
import { SCHEMA } from "./schema";
import { abbr, fmt, localZone, lowerMeridiem, wallToInstant } from "./time";

/* Bound straight to `:style`, because a person's colour is data — one of six
   palette slots the document itself records — not a class the CSS can know. */
export type ChipStyle = CSSProperties;

export function personColor(name: string, palette: Record<string, number>): string {
  return name === EVERYONE ? "var(--fg)" : `var(--p${palette[name] ?? 0})`;
}

export function chipStyle(
  name: string,
  on: boolean,
  palette: Record<string, number>,
): ChipStyle {
  if (!on) {
    return { color: "var(--muted)", background: "transparent", borderColor: "var(--border)" };
  }
  const c = personColor(name, palette);
  return {
    color: c,
    background: `color-mix(in oklab, ${c} 12%, transparent)`,
    borderColor: `color-mix(in oklab, ${c} 38%, transparent)`,
  };
}

/* "local" shows each entry where it happens; anything else pins the whole trip
   to one zone. */
export function displayZone(entry: Entry, tzMode: string): string {
  return tzMode === "local" ? entry.startTz || "UTC" : tzMode;
}

export interface DetailRow {
  label: string;
  place: string;
  time: string;
}

function clock(instant: number | null, tz: string): string {
  if (!instant) return "";
  return `${lowerMeridiem(fmt(instant, tz, { hour: "numeric", minute: "2-digit" }))} ${abbr(instant, tz)}`;
}

export interface EntryView {
  entry: Entry;
  instant: number;
  isoDay: string | null;
  dayKey: string;
  dayIso: string | null;
  weekday: string;
  date: string;
  dateShort: string;
  time: string;
  zone: string;
  kind: string;
  carrier: string;
  hasDetail: boolean;
  detailRows: DetailRow[];
  trackUrl: string;
  title: string;
  meta: string[];
  chipColor: string;
}

function describe(entry: Entry, tzMode: string, shownIn: string) {
  const endTz = tzMode === "local" ? entry.endTz || entry.startTz : shownIn;
  const arrival = wallToInstant(entry.end, entry.endTz || entry.startTz);
  const meta: string[] = [];
  let title: string;

  if (entry.type === "flight" || entry.type === "transit" || entry.type === "drive") {
    const route = `${entry.from || "?"} → ${entry.to || "?"}`;
    title = entry.type === "drive" ? `Drive ${route}` : route;
    if (arrival) {
      const at = lowerMeridiem(
        fmt(arrival, endTz, { weekday: "short", hour: "numeric", minute: "2-digit" }),
      );
      meta.push(`Arrives ${at} ${abbr(arrival, endTz)}`);
    }
  } else if (entry.type === "lodging") {
    title = entry.name || "Lodging";
    if (entry.from) meta.push(entry.from);
    if (arrival) {
      meta.push(
        `Until ${lowerMeridiem(
          fmt(arrival, endTz, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        )}`,
      );
    }
  } else {
    title = entry.name || SCHEMA[entry.type].label;
    if (entry.from) meta.push(entry.from);
  }

  return { title, meta };
}

function detailRowsFor(entry: Entry): DetailRow[] {
  const rows: DetailRow[] = [];
  const departs = wallToInstant(entry.start, entry.startTz);
  const arrives = wallToInstant(entry.end, entry.endTz || entry.startTz);

  if (entry.from) {
    rows.push({ label: "From", place: entry.from, time: clock(departs, entry.startTz) });
  }
  if (entry.to) {
    rows.push({
      label: "To",
      place: entry.to,
      time: clock(arrives, entry.endTz || entry.startTz),
    });
  }
  if (departs && arrives) {
    const mins = Math.round((arrives - departs) / 60000);
    if (mins > 0) {
      rows.push({
        label: "Duration",
        place: `${Math.floor(mins / 60)}h ${mins % 60}m`,
        time: "",
      });
    }
  }
  return rows;
}

export function entryView(
  entry: Entry,
  tzMode: string,
  palette: Record<string, number>,
): EntryView {
  const tz = displayZone(entry, tzMode);
  const instant = wallToInstant(entry.start, entry.startTz || "UTC");
  const { title, meta } = describe(entry, tzMode, tz);
  const carrier = [entry.operator, entry.service].filter(Boolean).join(" ");
  const named = entry.people.filter((p) => p !== EVERYONE)[0];

  return {
    entry,
    instant: instant == null ? Infinity : instant,
    isoDay:
      instant == null
        ? null
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(instant)),
    dayKey:
      instant == null
        ? "zzz"
        : fmt(instant, tz, { year: "numeric", month: "2-digit", day: "2-digit" }),
    dayIso: entry.start ? entry.start.slice(0, 10) : null,
    weekday: instant == null ? "Unscheduled" : fmt(instant, tz, { weekday: "long" }),
    date:
      instant == null
        ? ""
        : fmt(instant, tz, { month: "long", day: "numeric", year: "numeric" }),
    dateShort:
      instant == null
        ? ""
        : fmt(instant, tz, { month: "short", day: "numeric", year: "numeric" }),
    time:
      instant == null
        ? "—"
        : fmt(instant, tz, { hour: "numeric", minute: "2-digit" }).toLowerCase(),
    zone: instant == null ? "" : abbr(instant, tz),
    kind: SCHEMA[entry.type].label,
    carrier,
    hasDetail:
      (entry.type === "flight" || entry.type === "transit") &&
      !!(entry.operator || entry.service),
    detailRows: detailRowsFor(entry),
    trackUrl:
      entry.type === "flight" && entry.service
        ? `https://www.flightaware.com/live/flight/${entry.service.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`
        : "",
    title,
    meta,
    chipColor: named ? personColor(named, palette) : "var(--muted)",
  };
}

export interface DayGroup {
  key: string;
  weekday: string;
  date: string;
  dayIso: string | null;
  isToday: boolean;
  gapLabel: string;
  entries: EntryView[];
}

/* Days are consecutive only when the trip is; a run of empty days shows as one
   rule rather than a stretch of nothing. */
export function groupDays(views: readonly EntryView[], tzMode: string): DayGroup[] {
  const days: DayGroup[] = [];
  for (const view of views) {
    const last = days[days.length - 1];
    if (!last || last.key !== view.dayKey) {
      days.push({
        key: view.dayKey,
        weekday: view.weekday,
        date: view.date,
        dayIso: view.dayIso,
        isToday: false,
        gapLabel: "",
        entries: [view],
      });
    } else {
      last.entries.push(view);
    }
  }

  const zoneNow = tzMode === "local" ? localZone() : tzMode;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zoneNow,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  days.forEach((day, i) => {
    day.isToday = day.entries[0]?.isoDay === today;
    const before = days[i - 1]?.entries[0]?.isoDay;
    const now = day.entries[0]?.isoDay;
    const diff =
      before && now
        ? Math.round(
            (Date.parse(`${now}T00:00Z`) - Date.parse(`${before}T00:00Z`)) / 86_400_000,
          )
        : 0;
    day.gapLabel = diff >= 3 ? `${diff} days later` : "";
  });

  return days;
}

export interface CalendarItem {
  label: string;
  tip: string;
  color: string;
}

export interface CalendarCell {
  dayNum: string;
  inMonth: boolean;
  items: CalendarItem[];
}

export interface CalendarMonth {
  label: string;
  cells: CalendarCell[];
}

/* Every month the trip touches, trimmed to the weeks that carry something —
   a trip that starts on the 28th should not open on four blank rows. */
export function calendarMonths(views: readonly EntryView[]): CalendarMonth[] {
  const byDay = new Map<string, EntryView[]>();
  for (const view of views) {
    if (!view.isoDay) continue;
    const bucket = byDay.get(view.isoDay);
    if (bucket) bucket.push(view);
    else byDay.set(view.isoDay, [view]);
  }

  const dayKeys = [...byDay.keys()].sort();
  if (!dayKeys.length) return [];

  const [startYear, startMonth] = dayKeys[0].split("-").map(Number);
  const [endYear, endMonth] = dayKeys[dayKeys.length - 1].split("-").map(Number);

  const months: CalendarMonth[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const at = new Date(Date.UTC(year, month - 1, 1 - firstDow + i));
      const iso = at.toISOString().slice(0, 10);
      const inMonth = at.getUTCMonth() === month - 1;
      cells.push({
        dayNum: String(at.getUTCDate()),
        inMonth,
        items: inMonth
          ? (byDay.get(iso) ?? []).map((view) => ({
              label: `${view.time}  ${view.title}`,
              tip: `${view.kind} · ${view.title} · ${view.time} ${view.zone}`,
              color: view.chipColor,
            }))
          : [],
      });
    }

    const weeks: CalendarCell[][] = [];
    for (let w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7));
    const busy = weeks.filter((week) => week.some((c) => c.items.length));
    const kept = busy.length ? busy : weeks.filter((week) => week.some((c) => c.inMonth));

    months.push({
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }),
      cells: kept.flat(),
    });

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
}

export function spanLabel(views: readonly EntryView[]): string {
  const first = views[0];
  const last = views[views.length - 1];
  if (!first?.dateShort || !last?.dateShort) return "No dates yet";
  return first.dateShort === last.dateShort
    ? first.dateShort
    : `${first.dateShort} – ${last.dateShort}`;
}

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
