#!/usr/bin/env node
// Prints the SQL that seeds the demo itinerary into Keeper of State. Run it with
// `nix run .#keeper-seed`.
//
// Production already holds this document under this id, so the library links to it
// unconditionally; a local D1 starts empty and the link 404s until this runs. The
// id is the DEMO_ID in tools/itinerary/src/views/LibraryView.vue — change one and
// change the other.

const ID = "3pwsf4hhwx5n6s";

const DEMO = {
  "title": "Puerto Rico, July",
  "roster": [
    "Sam",
    "Alex"
  ],
  "tzMode": "local",
  "view": "list",
  "entries": [
    {
      "id": "d01",
      "type": "flight",
      "operator": "United",
      "service": "UA1122",
      "from": "Chicago O'Hare",
      "to": "San Juan",
      "start": "2026-07-11T07:15",
      "startTz": "America/Chicago",
      "end": "2026-07-11T13:40",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d02",
      "type": "lodging",
      "name": "Casa del Mar Guesthouse",
      "from": "Calle Fortaleza, Old San Juan",
      "start": "2026-07-11T15:00",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-14T11:00",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d03",
      "type": "booking",
      "name": "Dinner on Calle San Sebastián",
      "from": "Old San Juan",
      "start": "2026-07-11T19:30",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d04",
      "type": "booking",
      "name": "El Yunque rainforest hike",
      "from": "Río Grande — meet at the visitor centre",
      "start": "2026-07-12T08:30",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d05",
      "type": "booking",
      "name": "Bioluminescent bay kayak tour",
      "from": "Laguna Grande, Fajardo",
      "start": "2026-07-12T19:45",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d06",
      "type": "booking",
      "name": "Cooking class — sofrito and mofongo",
      "from": "Santurce",
      "start": "2026-07-13T10:00",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Sam"
      ]
    },
    {
      "id": "d07",
      "type": "booking",
      "name": "Two-tank reef dive",
      "from": "Escambrón",
      "start": "2026-07-13T09:00",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Alex"
      ]
    },
    {
      "id": "d08",
      "type": "drive",
      "from": "Old San Juan",
      "to": "Ceiba ferry terminal",
      "start": "2026-07-14T11:30",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-14T12:45",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d09",
      "type": "transit",
      "operator": "Puerto Rico Ferry",
      "service": "Ceiba–Vieques",
      "from": "Ceiba",
      "to": "Vieques",
      "start": "2026-07-14T13:30",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-14T14:15",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d10",
      "type": "lodging",
      "name": "Playa Grande cabana",
      "from": "Barrio Florida, Vieques",
      "start": "2026-07-14T15:00",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-17T10:00",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d11",
      "type": "note",
      "name": "Golf cart is booked — pick up at the ferry dock, cash only",
      "start": "2026-07-14T15:30",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d12",
      "type": "booking",
      "name": "Snorkelling at Playa Caracas",
      "from": "Vieques National Wildlife Refuge",
      "start": "2026-07-15T10:00",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d13",
      "type": "booking",
      "name": "Sunset horseback ride",
      "from": "Esperanza",
      "start": "2026-07-16T17:30",
      "startTz": "America/Puerto_Rico",
      "people": [
        "Alex"
      ]
    },
    {
      "id": "d14",
      "type": "transit",
      "operator": "Puerto Rico Ferry",
      "service": "Vieques–Ceiba",
      "from": "Vieques",
      "to": "Ceiba",
      "start": "2026-07-17T11:00",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-17T11:45",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d15",
      "type": "lodging",
      "name": "Airport hotel, Isla Verde",
      "from": "Carolina",
      "start": "2026-07-17T14:00",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-18T06:00",
      "endTz": "America/Puerto_Rico",
      "people": [
        "Everyone"
      ]
    },
    {
      "id": "d16",
      "type": "flight",
      "operator": "United",
      "service": "UA1987",
      "from": "San Juan",
      "to": "Chicago O'Hare",
      "start": "2026-07-18T08:05",
      "startTz": "America/Puerto_Rico",
      "end": "2026-07-18T11:40",
      "endTz": "America/Chicago",
      "people": [
        "Everyone"
      ]
    }
  ]
};

// The shape store.js writes: whole seconds, no milliseconds.
const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const quote = (value) => `'${value.replace(/'/g, "''")}'`;

// Upsert rather than INSERT OR REPLACE: the keys table carries a foreign key onto
// this row, and re-seeding should leave created_at alone.
process.stdout.write(`INSERT INTO blobs (id, app, data, created_at, updated_at, deleted_at)
VALUES (${quote(ID)}, 'itinerary', ${quote(JSON.stringify(DEMO))}, ${quote(now)}, ${quote(now)}, NULL)
ON CONFLICT (id) DO UPDATE SET
  data = excluded.data,
  updated_at = excluded.updated_at,
  deleted_at = NULL;
`);
