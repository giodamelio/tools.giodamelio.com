#!/usr/bin/env node
// Regenerates src/itinerary/zone-data.js. Run it with
// `devenv tasks run itinerary:zones`.
//
// The browser supplies the list of zones that exist, through
// Intl.supportedValuesOf. This file supplies what the browser cannot:
//
//   Renames, from the IANA database's own `backward` file. Engines disagree
//   about whether they enumerate a zone's current name or the one it shipped
//   with — older ICU still says Asia/Calcutta — so the picker needs both.
//
//   Country and major cities, from @vvo/tzdb, so searching "Mumbai" or
//   "India" finds Asia/Kolkata.
//
// Note that @vvo/tzdb's `group` is NOT a list of renames: it groups zones that
// currently share the same rules, so America/Anchorage's group sweeps in
// Juneau, Nome and Sitka, which are separate places. Only `backward` describes
// renaming, and only the exact `name` match may lend its country and cities.

import { writeFile } from "node:fs/promises";

const TZDB = "https://cdn.jsdelivr.net/npm/@vvo/tzdb";
const BACKWARD = "https://data.iana.org/time-zones/tzdb/backward";
const OUT = new URL("../src/itinerary/zone-data.js", import.meta.url);

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
}

const { version } = await (await get(`${TZDB}/package.json`)).json();
const zones = await (await get(`${TZDB}/raw-time-zones.json`)).json();
const backward = await (await get(BACKWARD)).text();

// `Link  <current name>  <name it used to have>`
const olderNames = new Map();
for (const line of backward.split("\n")) {
  const match = /^Link\s+(\S+)\s+(\S+)/.exec(line);
  if (!match) continue;
  const [, current, older] = match;
  if (current === older) continue;
  if (!olderNames.has(current)) olderNames.set(current, []);
  olderNames.get(current).push(older);
}

const facts = new Map();
for (const zone of zones) {
  facts.set(zone.name, {
    country: zone.countryName || "",
    cities: (zone.mainCities || []).slice(0, 3),
  });
}

const names = [...new Set([...olderNames.keys(), ...facts.keys()])].sort();

// [ current name, [older names], country, [major cities] ]
const rows = names.map((name) => {
  const fact = facts.get(name) || { country: "", cities: [] };
  return [name, (olderNames.get(name) || []).sort(), fact.country, fact.cities];
});

const body = `/* GENERATED — do not edit. Rebuild with \`devenv tasks run itinerary:zones\`.
   Renames from the IANA tzdb \`backward\` file; country and cities from @vvo/tzdb ${version}.
   Each row is [ current name, [older names], country, [major cities] ]. */
window.ITIN_ZONE_DATA = ${JSON.stringify(rows)};
`;

await writeFile(OUT, body);
console.log(
  `wrote ${rows.length} zones — ${olderNames.size} renamed, ${facts.size} with country data (${body.length} bytes)`,
);
