import { ZONE_DATA } from "./zone-data";
import { ZONES } from "./schema";
import { localZone, offsetText } from "./time";

export interface Zone {
  /** What this engine calls the zone — which may be a name tzdb has retired. */
  id: string;
  /** What tzdb calls it today, and what a document written elsewhere will say. */
  canonical: string;
  city: string;
  region: string;
  within: string;
  mins: number;
  aka: string[];
  country: string;
  offsetLabel: string;
  note: string;
  search: string;
}

export interface ZoneGroup {
  label: string;
  zones: Zone[];
}

/* The browser already ships the whole IANA database, so nothing here is
   fetched. Built on first use — 400-odd Intl formatters is a few tens of
   milliseconds, which is fine once but not on every render. */
let table: Zone[] | null = null;
let index: Record<string, Zone> = {};

const regionOf = (name: string) => name.split("/")[0];

export function zoneTable(): Zone[] {
  if (table) return table;

  let ids: string[] = [];
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      ids = Intl.supportedValuesOf("timeZone") as string[];
    } catch {
      // Some engines list the method without supporting "timeZone".
    }
  }
  if (!ids.length) ids = ZONES.map((z) => z[0]);
  // A valid zone that the enumeration leaves out, and the app's own default.
  if (!ids.includes("UTC")) ids = ids.concat(["UTC"]);

  const listed = new Set(ids);

  /* The tzdb list of former names mixes true renames with merges of places
     that were never the same — Accra sits under Abidjan because they have
     shared rules since 1970. A former name is only a rename if this engine has
     stopped listing it as a zone of its own. */
  const factsFor: Record<string, { country: string; cities: readonly string[] }> = {};
  const retired: Record<string, string[]> = {};
  const claims: Record<string, string[]> = {};

  for (const [current, older, country, cities] of ZONE_DATA) {
    factsFor[current] = { country: country || "", cities: cities || [] };
    const gone: string[] = [];
    for (const name of older ?? []) {
      if (!listed.has(name)) {
        gone.push(name);
        continue;
      }
      // Still listed in its own right, or filed under a different region: a
      // separate place, not this one under an old name.
      if (listed.has(current) || regionOf(name) !== regionOf(current)) continue;
      (claims[current] ??= []).push(name);
    }
    retired[current] = gone;
  }

  const renamedTo: Record<string, string> = {};
  for (const [current, names] of Object.entries(claims)) {
    // Two names cannot both be the old spelling of one zone; leave both be.
    if (names.length === 1) renamedTo[names[0]] = current;
  }

  const now = new Date();
  table = ids.map((id) => {
    const shown = renamedTo[id] ?? id;
    const facts = factsFor[shown];
    const parts = shown.split("/");
    const city = parts[parts.length - 1].replace(/_/g, " ");
    const region = parts.length > 1 ? parts[0] : "Other";
    const within = parts.length > 2 ? parts.slice(1, -1).join(" ").replace(/_/g, " ") : "";
    const country = facts ? facts.country : "";
    const cities = facts ? facts.cities : [];
    const aka = (retired[shown] ?? []).concat(shown === id ? [] : [id]);

    let raw = "GMT+0";
    try {
      raw = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" })
        .formatToParts(now)
        .filter((p) => p.type === "timeZoneName")[0].value;
    } catch {
      // A zone the enumeration knows but the formatter does not.
    }
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
    const mins = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;

    const label = offsetText(mins);
    return {
      id,
      canonical: shown,
      city,
      region,
      within,
      mins,
      aka,
      country,
      offsetLabel: label,
      note: country || (within ? `${within} · ${region}` : region),
      search: [id, shown, city, region, within, country, label, label.replace("−", "-"), raw]
        .concat(aka, cities)
        .join(" ")
        .replace(/[_/]/g, " ")
        .toLowerCase(),
    };
  });

  /* Every name a zone answers to, so a document written on another engine
     still finds it: what this engine enumerates, what tzdb calls it today, and
     the names it has been retired under. */
  index = {};
  for (const zone of table) {
    index[zone.id] = zone;
    index[zone.canonical] ??= zone;
    for (const name of zone.aka) index[name] ??= zone;
  }
  return table;
}

export function zoneById(id: string): Zone | null {
  zoneTable();
  return index[id] ?? null;
}

export function zoneLabelFor(id: string): string {
  const zone = zoneById(id);
  return zone ? `${zone.city} · ${zone.offsetLabel}` : id;
}

export function searchRank(zone: Zone, q: string): number {
  const city = zone.city.toLowerCase();
  const country = zone.country.toLowerCase();
  if (city.indexOf(q) === 0) return 0;
  if (country.indexOf(q) === 0) return 1;
  if (city.includes(q)) return 2;
  if (country.includes(q)) return 3;
  if (zone.id.toLowerCase().includes(q)) return 4;
  return 5;
}

/* Your zone, then the ones this trip already uses west to east, then every
   region with your own first — the zone you want next is far more often near
   you than on the other side of the world. */
export function zoneGroups(tripZones: readonly string[], query: string): ZoneGroup[] {
  const all = zoneTable();
  const q = query.trim().toLowerCase();

  if (q) {
    const hits = all.filter((z) => z.search.includes(q));
    hits.sort((a, b) => searchRank(a, q) - searchRank(b, q) || a.city.localeCompare(b.city));
    return [{ label: "", zones: hits }];
  }

  const seen = new Set<string>();
  const take = (ids: readonly string[]) =>
    ids
      .map((id) => zoneById(id))
      .filter((z): z is Zone => !!z && !seen.has(z.id))
      .map((z) => {
        seen.add(z.id);
        return z;
      });

  const groups: ZoneGroup[] = [];
  const push = (label: string, zones: Zone[]) => {
    if (zones.length) groups.push({ label, zones });
  };

  const mine = localZone();
  push("Your timezone", take([mine]));

  const trip = tripZones
    .map((id) => zoneById(id))
    .filter((z): z is Zone => !!z)
    .sort((a, b) => a.mins - b.mins || a.city.localeCompare(b.city))
    .map((z) => z.id);
  push("In this trip", take(trip));

  const rest = all.filter((z) => !seen.has(z.id));
  const home = zoneById(mine)?.region ?? "";
  const regions: string[] = [];
  for (const zone of rest) if (!regions.includes(zone.region)) regions.push(zone.region);
  regions.sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
  for (const region of regions) {
    push(
      region,
      rest.filter((z) => z.region === region).sort((a, b) => a.city.localeCompare(b.city)),
    );
  }

  return groups;
}

export function shortZoneName(id: string): string {
  return id.split("/").pop()!.replace(/_/g, " ");
}
