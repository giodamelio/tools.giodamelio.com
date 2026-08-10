# Itinerary format

An itinerary is one JSON blob in [Keeper of State](/api/keeper-of-state/docs.md), under the
app namespace `itinerary`. The blob is the whole thing — there is no other copy.

    https://tools.giodamelio.com/itinerary/k7m3qxbn9fd2rt
    https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt

The last path segment is the blob id: 14 characters from
`23456789bcdfghjkmnpqrstvwxz`. Anyone holding it can read the itinerary. Editing needs a
key, which the app keeps in the browser that created the itinerary and never puts in a
link.

## Read one

No key needed.

```sh
curl https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt
```

## The shape

```json
{
  "title": "Christmas 2022",
  "roster": ["Kirsten", "Gio"],
  "colors": { "Kirsten": 1, "Gio": 4 },
  "tzMode": "local",
  "entries": [
    {
      "id": "a2",
      "type": "flight",
      "operator": "United",
      "service": "UAL4690",
      "from": "Birmingham",
      "to": "Denver",
      "start": "2022-12-18T14:06",
      "startTz": "America/Chicago",
      "end": "2022-12-18T16:25",
      "endTz": "America/Denver",
      "people": ["Kirsten", "Gio"]
    }
  ]
}
```

| Field     | Type     | Meaning                                                                             |
|-----------|----------|-------------------------------------------------------------------------------------|
| `title`   | string   | Trip name                                                                           |
| `roster`  | string[] | Names of everyone currently on the trip                                             |
| `colors`  | object   | Name to colour slot, `0`–`5`. See below — do not reassign one                       |
| `tzMode`  | string   | `"local"` shows each entry in its own zone; an IANA name shows all in that one zone |
| `entries` | object[] | In any order — the app sorts by absolute instant on load                            |

Each entry:

| Field      | Type     | Meaning                                                       |
|------------|----------|---------------------------------------------------------------|
| `id`       | string   | Stable handle. Keep it; other things reference it             |
| `type`     | string   | `flight`, `transit`, `drive`, `lodging`, `booking`, or `note` |
| `start`    | string   | Local wall clock, `YYYY-MM-DDTHH:MM`                          |
| `startTz`  | string   | IANA zone for `start`, e.g. `America/Chicago`                 |
| `end`      | string   | Same format. Omit when the entry has no end                   |
| `endTz`    | string   | IANA zone for `end`. Defaults to `startTz`                    |
| `people`   | string[] | Names from `roster`, or the single sentinel `["Everyone"]`    |
| `from`     | string   | Origin, address, or place                                     |
| `to`       | string   | Destination                                                   |
| `operator` | string   | Airline or carrier                                            |
| `service`  | string   | Flight or train number                                        |
| `name`     | string   | Label for lodging, reservations, and notes                    |

Which string fields matter depends on the type: flights and trains use
`from`/`to`/`operator`/`service`, drives use `from`/`to`, lodging uses `name` for the place
and `from` for the address, reservations use `name` and `from`, notes use `name`. Leave the
rest out.

**Times are local wall clock at that place, never converted to UTC.** `9:00 am` in Chicago
is `"start": "2022-12-17T09:00"` with `"startTz": "America/Chicago"`. A stamp that carries
an offset (`2022-12-17T09:00:00-06:00`) is accepted and resolved into the entry's zone, but
the plain wall clock is the canonical form. Zones must be IANA names, never abbreviations
like `CST`.

## Edit one

You need a key. The app mints a temporary one for you through **Hand off to an
assistant** — it lasts an hour, cannot delete the itinerary, and cannot mint more keys.

Write with `PATCH`, not `PUT`, so you only touch the keys you meant to:

```sh
curl -X PATCH https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt \
  -H 'Authorization: Bearer 4c1de907-8b52-4a3f-bd16-2e7fa9c05d84' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Christmas 2022 — final"}'
```

Two merge-patch rules bite people:

**A `null` deletes the key.** There is no way to write an explicit `null` through `PATCH`.

**Arrays are replaced whole.** `entries` and `roster` have no element-wise semantics and no
append. To add one entry, `GET` the blob, append to the array you got back, and send the
entire `entries` array again. The same goes for adding a traveler to `roster`.

When you are done, revoke your key:

```sh
curl -X DELETE \
  https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt/keys/self \
  -H 'Authorization: Bearer 4c1de907-8b52-4a3f-bd16-2e7fa9c05d84'
```

## Watch out

- **Last write wins.** There is no conflict detection. Do not edit while the owner has the
  page open in another tab, and do not hand the same key to two agents.
- **New entries need an `id`.** Any short unique string works; the app will not merge two
  entries that share one.
- **`people` is names, not indices.** A name that is not in `roster` still renders, and the
  app adds it to `roster` on the next write.
- **Leave `colors` alone.** It maps a name to one of six palette slots and is what keeps a
  person the same colour from one edit to the next. Add a traveler and the app picks a free
  slot for them; you do not need to. Entries are kept even for people no longer on the trip,
  so their colour is not handed to someone else and comes back with them — deleting an entry
  from `colors` will silently recolour other people.
- **`"Everyone"` is a sentinel**, not a roster member. An entry is either `["Everyone"]` or
  an explicit list, never both.
- **There is no `view` field.** List versus calendar is a per-reader preference kept in the
  browser. Older itineraries may still carry one; it is ignored and dropped on the next write.
- Errors come back as `{"error": "<code>", "message": "..."}`. Branch on `error` and stop
  rather than retrying blindly. The full list is in the
  [Keeper of State docs](/api/keeper-of-state/docs.md).
