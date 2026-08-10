/* No date library: the browser already ships the whole IANA database behind
   Intl, and everything here is a few formatter calls. */

export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/* How far a zone is from UTC at one instant, in milliseconds. */
export function zoneOffset(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const got: Record<string, string> = {};
  for (const part of parts) got[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(got.year),
    Number(got.month) - 1,
    Number(got.day),
    Number(got.hour),
    Number(got.minute),
    Number(got.second),
  );
  return asUtc - utcMs;
}

/* A wall clock plus a zone is an instant, but the offset that resolves it is
   itself a function of the instant. One correction settles it everywhere
   except inside a DST gap, where the hour does not exist and any answer is a
   choice. */
export function wallToInstant(wall: string | undefined, tz: string): number | null {
  if (!wall) return null;
  const naive = Date.parse(wall + ":00Z");
  if (isNaN(naive)) return null;
  let guess = naive - zoneOffset(naive, tz);
  guess = naive - zoneOffset(guess, tz);
  return guess;
}

export function fmt(instant: number, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(new Date(instant));
}

export function abbr(instant: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date(instant));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

export function instantToWall(instant: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));

  const got: Record<string, string> = {};
  for (const part of parts) got[part.type] = part.value;
  return `${got.year}-${got.month}-${got.day}T${got.hour}:${got.minute}`;
}

const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/* Stored times are local wall clock at the place. A stamp that carries an
   offset is still accepted — an agent writing full ISO is doing the obvious
   thing — and gets resolved into the entry's own zone. */
export function toWall(value: unknown, tz: string, label: string): string {
  if (!value) return "";
  const text = String(value).trim();
  const m = STAMP_RE.exec(text);
  if (!m) throw new Error(`its ${label} time ${JSON.stringify(value)} could not be read`);
  if (!m[3]) return m[1];
  const instant = Date.parse(text);
  if (isNaN(instant)) {
    throw new Error(`its ${label} time ${JSON.stringify(value)} could not be read`);
  }
  return instantToWall(instant, tz || "UTC");
}

export function offsetText(mins: number): string {
  const abs = Math.abs(mins);
  const rest = abs % 60;
  const sign = mins < 0 ? "−" : "+";
  return `UTC${sign}${Math.floor(abs / 60)}${rest ? ":" + String(rest).padStart(2, "0") : ""}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* "Edited Mar 4", dropping the year while it is still this one. */
export function shortStamp(iso: string): string {
  const at = new Date(iso);
  if (isNaN(at.getTime())) return "recently";
  const sameYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

export function agentExpiryLabel(expiresAt: string): string {
  const ends = new Date(expiresAt);
  if (isNaN(ends.getTime())) return expiresAt;
  return ends.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/* Intl gives "3:05 PM"; everything in this app is lower case. */
export function lowerMeridiem(text: string): string {
  return text.replace("AM", "am").replace("PM", "pm");
}
