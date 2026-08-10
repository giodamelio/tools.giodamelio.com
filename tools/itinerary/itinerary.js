/* Ported from the Claude Design source `Itinerary.dc.html`. The template
   lives in index.html and is driven by render.js. */
(function () {
  "use strict";

  const ZONES = [
    ["America/Los_Angeles","Pacific — Los Angeles"],
    ["America/Denver","Mountain — Denver"],
    ["America/Phoenix","Arizona — Phoenix"],
    ["America/Chicago","Central — Chicago"],
    ["America/New_York","Eastern — New York"],
    ["America/Anchorage","Alaska — Anchorage"],
    ["Pacific/Honolulu","Hawaii — Honolulu"],
    ["Europe/London","London"],
    ["Europe/Paris","Paris / Berlin"],
    ["Asia/Tokyo","Tokyo"],
    ["Australia/Sydney","Sydney"],
    ["UTC","UTC"]
  ];

  const EVERYONE = "Everyone";

  /* Shown to the user to hand to an agent, so it has to be absolute. Derived
     from where the tool is mounted rather than hardcoded. */
  const LLM_DOC = new URL("llm.md", document.baseURI).href;

  const MODELS = [
    ["google/gemini-2.5-flash", "Gemini 2.5 Flash", "Fast and cheap; good at pulling structure out of emails", true],
    ["openai/gpt-4o-mini", "GPT-4o mini", "Reliable and inexpensive", false],
    ["anthropic/claude-3.5-haiku", "Claude 3.5 Haiku", "Careful with dates and time zones", false],
    ["openai/gpt-4.1-mini", "GPT-4.1 mini", "A step up when a booking is messy", false],
    ["google/gemini-2.5-pro", "Gemini 2.5 Pro", "Slowest and priciest; for long, tangled emails", false]
  ];

  const DEFAULT_MODEL = MODELS[0][0];

  const SYSTEM_PROMPT = [
    "You turn travel booking text into edit actions for an itinerary app.",
    "Reply with JSON only: {\"actions\": [...]}. Each action is one of:",
    "  {\"kind\":\"add\", \"entry\": <entry>}",
    "  {\"kind\":\"update\", \"id\": \"<existing id>\", \"fields\": <partial entry>}",
    "  {\"kind\":\"people\", \"id\": \"<existing id>\", \"people\": [\"Name\", ...]}",
    "  {\"kind\":\"delete\", \"id\": \"<existing id>\"}",
    "An entry looks like:",
    "  {\"type\":\"flight|transit|drive|lodging|booking|note\", \"operator\":\"United\", \"service\":\"UA1486\",",
    "   \"name\":\"for lodging/booking/note\", \"from\":\"origin or address\", \"to\":\"destination\",",
    "   \"start\":\"YYYY-MM-DDTHH:MM\", \"startTz\":\"IANA zone\", \"end\":\"YYYY-MM-DDTHH:MM\", \"endTz\":\"IANA zone\",",
    "   \"people\":[\"Name\"] or [\"Everyone\"]}",
    "Times are always LOCAL WALL-CLOCK time at that place, never converted to UTC.",
    "Always set startTz (and endTz when there is an end) to the IANA zone of that city, e.g. America/Chicago.",
    "Split multi-leg trips into one action per leg. Do not invent data that is not in the text.",
    "Prefer existing people names when the text names travelers; otherwise use [\"Everyone\"]."
  ].join("\n");

  const TYPE_PLURALS = {
    flight: "Flights",
    transit: "Trains & buses",
    drive: "Drives",
    lodging: "Lodging",
    booking: "Reservations",
    note: "Notes"
  };

  const HINTS = { flight:"depart / arrive", transit:"depart / arrive", drive:"leave / arrive", lodging:"check in / out", booking:"a time and place", note:"anything else" };

  const SCHEMA = {
    flight:  { label:"Flight", fields:[["operator","Airline","text"],["service","Flight no.","text"],["from","From","text"],["to","To","text"],["start","Departs","when","startTz"],["end","Arrives","when","endTz"]] },
    transit: { label:"Train / bus", fields:[["operator","Operator","text"],["service","Service","text"],["from","From","text"],["to","To","text"],["start","Departs","when","startTz"],["end","Arrives","when","endTz"]] },
    drive:   { label:"Drive", fields:[["from","From","text"],["to","To","text"],["start","Leaves","when","startTz"],["end","Arrives","when","endTz"]] },
    lodging: { label:"Lodging", fields:[["name","Place","text"],["from","Address","text"],["start","Check in","when","startTz"],["end","Check out","when","endTz"]] },
    booking: { label:"Reservation", fields:[["name","What","text"],["from","Where","text"],["start","When","when","startTz"]] },
    note:    { label:"Note", fields:[["name","Note","text"],["start","When","when","startTz"]] }
  };

  function zoneOffset(utcMs, tz) {
    const d = new Date(utcMs);
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" }).formatToParts(d);
    const g = {};
    p.forEach(x => { g[x.type] = x.value; });
    const asUtc = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
    return asUtc - utcMs;
  }

  function wallToInstant(wall, tz) {
    if (!wall) return null;
    const naive = Date.parse(wall + ":00Z");
    if (isNaN(naive)) return null;
    let guess = naive - zoneOffset(naive, tz);
    guess = naive - zoneOffset(guess, tz);
    return guess;
  }

  function fmt(instant, tz, opts) {
    return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: tz }, opts)).format(new Date(instant));
  }

  function abbr(instant, tz) {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName:"short" }).formatToParts(new Date(instant));
    const z = p.find(x => x.type === "timeZoneName");
    return z ? z.value : "";
  }

  function instantToWall(instant, tz) {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instant));
    const g = {};
    p.forEach(x => { g[x.type] = x.value; });
    return g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute;
  }

  const STAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

  /* Stored times are local wall clock at the place. A stamp that carries an
     offset is still accepted — an agent writing full ISO is doing the obvious
     thing — and gets resolved into the entry's own zone. */
  function toWall(value, tz, label) {
    if (!value) return "";
    const m = STAMP_RE.exec(String(value).trim());
    if (!m) throw new Error("its " + label + " time " + JSON.stringify(value) + " could not be read");
    if (!m[3]) return m[1];
    const instant = Date.parse(value);
    if (isNaN(instant)) throw new Error("its " + label + " time " + JSON.stringify(value) + " could not be read");
    return instantToWall(instant, tz || "UTC");
  }

  const TYPES = ["flight", "transit", "drive", "lodging", "booking", "note"];

  function fromIso(iso) {
    return iso ? iso.slice(0, 16) : "";
  }

  function unb64u(s) {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  }

  function unpack(a) {
    const zones = a[1] || [];
    const roster = a[2] || [];
    const zone = i => (i == null || i < 0 ? "" : zones[i] || "");
    return {
      t: a[0] || "",
      r: roster,
      z: a[4] == null || a[4] < 0 ? "local" : (zones[a[4]] || "local"),
      v: a[5] === 1 ? "calendar" : "list",
      e: (a[3] || []).map((x, n) => {
        const o = {
          id: "u" + n.toString(36) + Math.random().toString(36).slice(2, 6),
          type: TYPES[x[0]] || "note",
          start: fromIso(x[1]),
          startTz: zone(x[2]) || "UTC",
          people: (x[5] || []).map(i => roster[i]).filter(Boolean)
        };
        if (x[3]) {
          o.end = fromIso(x[3]);
          o.endTz = zone(x[4]) || o.startTz;
        }
        if (x[6]) o.from = x[6];
        if (x[7]) o.to = x[7];
        if (x[8]) o.operator = x[8];
        if (x[9]) o.service = x[9];
        if (x[10]) o.name = x[10];
        return o;
      })
    };
  }

  /* Links minted before the itinerary moved into Keeper of State carried the
     whole trip in the fragment. They still open; they load as an unsaved draft
     and get a blob of their own on the first edit. */
  async function decode(s) {
    try {
      const dot = s.indexOf(".");
      if (dot < 0) return null;
      const ver = s.slice(0, dot);
      const bytes = unb64u(s.slice(dot + 1));
      if (ver === "1u") return unpack(JSON.parse(new TextDecoder().decode(bytes)));
      if (ver !== "1") return null;
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const buf = await new Response(stream).arrayBuffer();
      return unpack(JSON.parse(new TextDecoder().decode(buf)));
    } catch (err) { return null; }
  }

  const API = "/api/keeper-of-state/itinerary";
  const LIBRARY_STORE = "itin-library";
  const LEGACY_KEY_STORE = "itin-keys";
  const BLOB_ID_RE = /^[23456789bcdfghjkmnpqrstvwxz]{14}$/;
  const AGENT_KEY_SECONDS = 3600;
  const DEMO_ID = "3pwsf4hhwx5n6s";
  const UNTITLED = "Untitled trip";

  /* The library is every itinerary this browser knows about:

       { v: 1, items: [ { id, role, key, title, created, modified } ] }

     `role` is "owner" today and carries the key that lets you write. It is the
     seam for following someone else's itinerary later — such a record would
     drop `key` and render without the editing affordances. */
  function readLibrary() {
    let lib = null;
    try { lib = JSON.parse(localStorage.getItem(LIBRARY_STORE)); } catch (err) {}
    if (!lib || !Array.isArray(lib.items)) lib = { v: 1, items: [] };

    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY_STORE)); } catch (err) {}
    let migrated = false;
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      Object.keys(legacy).forEach(id => {
        if (typeof legacy[id] !== "string") return;
        if (lib.items.some(it => it.id === id)) return;
        lib.items.push({ id, role: "owner", key: legacy[id], title: "", created: "", modified: "" });
        migrated = true;
      });
    }
    if (migrated) writeLibrary(lib);
    return lib;
  }

  function writeLibrary(lib) {
    try { localStorage.setItem(LIBRARY_STORE, JSON.stringify(lib)); } catch (err) {}
  }

  function libraryItems() {
    return readLibrary().items;
  }

  function libraryItem(id) {
    return libraryItems().filter(it => it.id === id)[0] || null;
  }

  function keyFor(id) {
    const item = libraryItem(id);
    return item && item.role === "owner" && typeof item.key === "string" ? item.key : "";
  }

  function rememberItinerary(id, patch) {
    const lib = readLibrary();
    const existing = lib.items.filter(it => it.id === id)[0];
    if (existing) Object.assign(existing, patch);
    else lib.items.push(Object.assign({ id, role: "owner", key: "", title: "", created: "", modified: "" }, patch));
    writeLibrary(lib);
    return lib.items;
  }

  function forgetItinerary(id) {
    const lib = readLibrary();
    lib.items = lib.items.filter(it => it.id !== id);
    writeLibrary(lib);
    return lib.items;
  }

  /* One round trip per itinerary today. Kept behind a single call so it can
     become one bulk read when the store grows one. */
  function refreshLibrary(items) {
    return Promise.all(items.map(item =>
      fetch(API + "/" + item.id)
        .then(res => (res.ok ? res.json().then(doc => ({ item, doc, modified: res.headers.get("last-modified") || "" })) : null))
        .catch(() => null)
    )).then(results => {
      const found = results.filter(Boolean);
      if (!found.length) return items;
      const lib = readLibrary();
      found.forEach(({ item, doc, modified }) => {
        const row = lib.items.filter(it => it.id === item.id)[0];
        if (!row) return;
        row.title = typeof doc.title === "string" ? doc.title : "";
        if (modified) row.modified = new Date(modified).toISOString();
      });
      writeLibrary(lib);
      return lib.items;
    });
  }

  const API_TROUBLE = {
    not_found: "this itinerary no longer exists",
    missing_key: "this browser is not allowed to change it",
    unknown_key: "this browser is not allowed to change it",
    key_expired: "the access being used has expired",
    key_revoked: "the access being used was withdrawn",
    forbidden: "this browser is not allowed to do that",
    rate_limited: "the server is asking you to slow down, so wait a minute",
    too_large: "this itinerary has grown too big to save"
  };

  /* The server answers with codes like `not_found`; none of that vocabulary
     belongs in front of someone planning a trip. */
  async function apiFailure(res) {
    let body = null;
    try { body = await res.json(); } catch (err) {}
    const code = body && body.error ? body.error : "";
    return new Error(API_TROUBLE[code] || "the server said " + res.status);
  }

  async function createBlob(doc) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc)
    });
    if (!res.ok) throw await apiFailure(res);
    return res.json();
  }

  async function readBlob(id) {
    const res = await fetch(API + "/" + id);
    if (res.status === 404) return null;
    if (!res.ok) throw await apiFailure(res);
    return res.json();
  }

  async function writeBlob(id, key, doc) {
    const res = await fetch(API + "/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify(doc)
    });
    if (!res.ok) throw await apiFailure(res);
    const stamp = res.headers.get("last-modified");
    return stamp ? new Date(stamp).toISOString() : "";
  }

  async function deleteBlob(id, key) {
    const res = await fetch(API + "/" + id, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + key }
    });
    if (!res.ok) throw await apiFailure(res);
  }

  /* Where this tool is mounted, from the <base> tag the build stamps in. The
     tool never hardcodes its own prefix, so it can be served from anywhere. */
  const BASE = new URL(document.baseURI).pathname;

  function tripPath(id, editing) {
    return BASE + id + (editing ? "/edit" : "");
  }

  /* Matches the path below BASE, so this is the same pattern the tool
     publishes in its derivation for the worker to route on. */
  const ROUTE_RE = /^([23456789bcdfghjkmnpqrstvwxz]{14})(?:\/(edit))?\/?$/;

  function currentRoute() {
    const path = location.pathname;
    if (!path.startsWith(BASE)) return null;
    return ROUTE_RE.exec(path.slice(BASE.length));
  }

  function emptyDoc() {
    return { title: UNTITLED, roster: [], tzMode: "local", entries: [] };
  }

  async function mintAgentKey(id, key, seconds) {
    const res = await fetch(API + "/" + id + "/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ expires_in: seconds })
    });
    if (!res.ok) throw await apiFailure(res);
    return res.json();
  }

  /* The stored blob is plain readable JSON rather than the old packed array,
     so an agent holding a key can edit it without a codec. */
  function toDoc(s) {
    return {
      title: s.title || "",
      roster: rosterOrder(s),
      colors: colorMap(s),
      tzMode: s.tzMode,
      entries: s.entries.map(e => {
        const out = { id: e.id, type: e.type, start: e.start || "", startTz: e.startTz || "UTC" };
        if (e.end) {
          out.end = e.end;
          out.endTz = e.endTz || e.startTz || "UTC";
        }
        ["from", "to", "operator", "service", "name"].forEach(k => { if (e[k]) out[k] = e[k]; });
        out.people = Array.isArray(e.people) ? e.people.slice() : [];
        return out;
      })
    };
  }

  function fromDoc(doc) {
    if (!doc || typeof doc !== "object") throw new Error("its contents are not in a shape this app can read");
    const rows = Array.isArray(doc.entries) ? doc.entries : [];
    const entries = rows.map((e, n) => {
      if (!e || typeof e !== "object") throw new Error("item " + (n + 1) + " is not in a shape this app can read");
      const type = TYPES.indexOf(e.type) >= 0 ? e.type : "note";
      const startTz = e.startTz || "UTC";
      const out = {
        id: typeof e.id === "string" && e.id ? e.id : "e" + n.toString(36) + Math.random().toString(36).slice(2, 6),
        type,
        start: toWall(e.start, startTz, "start"),
        startTz,
        people: Array.isArray(e.people) ? e.people.filter(p => typeof p === "string" && p) : []
      };
      if (e.end) {
        out.endTz = e.endTz || startTz;
        out.end = toWall(e.end, out.endTz, "end");
      }
      ["from", "to", "operator", "service", "name"].forEach(k => { if (e[k]) out[k] = String(e[k]); });
      return out;
    });
    const colors = {};
    if (doc.colors && typeof doc.colors === "object" && !Array.isArray(doc.colors)) {
      Object.keys(doc.colors).forEach(name => {
        const slot = doc.colors[name];
        if (typeof slot === "number" && slot >= 0 && slot < PALETTE_SIZE && slot === Math.floor(slot)) colors[name] = slot;
      });
    }

    return {
      t: typeof doc.title === "string" ? doc.title : "",
      c: colors,
      r: Array.isArray(doc.roster) ? doc.roster.filter(p => typeof p === "string" && p) : [],
      z: doc.tzMode === "local" || !doc.tzMode ? "local" : String(doc.tzMode),
      e: entries
    };
  }

  const PALETTE_SIZE = 6;

  function peopleOf(entry) {
    if (Array.isArray(entry.people)) return entry.people;
    return String(entry.people || "").split(/,| and /i).map(x => x.trim()).filter(Boolean);
  }

  /* The stored list comes first and keeps its order; anyone who only appears
     on an entry is appended. Colours hang off this order, so it has to be
     stable as entries are edited. */
  function rosterOrder(state) {
    const names = [];
    const add = n => { if (n && n !== EVERYONE && names.indexOf(n) < 0) names.push(n); };
    (state.roster || []).forEach(add);
    (state.entries || []).forEach(entry => peopleOf(entry).forEach(add));
    return names;
  }

  function nameHash(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % PALETTE_SIZE;
  }

  /* A colour is a stored fact, not something recomputed each time. A name new
     to the itinerary gets one from the hash of the name — so the same person
     tends to keep their colour across trips — and from then on the document
     says what it is.

     Entries here outlive the roster on purpose. Drop someone from the trip and
     their colour stays booked, so nobody else inherits it and they get it back
     if they return. */
  function assignColors(names, existing) {
    const slots = {};
    const taken = {};
    Object.keys(existing || {}).forEach(name => {
      const slot = existing[name];
      if (typeof slot === "number" && slot >= 0 && slot < PALETTE_SIZE && slot === Math.floor(slot)) {
        slots[name] = slot;
        taken[slot] = true;
      }
    });
    names.forEach(name => {
      if (name === EVERYONE || Object.prototype.hasOwnProperty.call(slots, name)) return;
      let slot = nameHash(name);
      for (let i = 0; i < PALETTE_SIZE && taken[slot]; i++) slot = (slot + 1) % PALETTE_SIZE;
      taken[slot] = true;
      slots[name] = slot;
    });
    return slots;
  }

  function colorMap(state) {
    return assignColors(rosterOrder(state), state.colors);
  }

  const SAVE_NOTES = {
    unsaved: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved",
    error: "Not saved"
  };

  function offsetText(mins) {
    const abs = Math.abs(mins);
    const rest = abs % 60;
    return "UTC" + (mins < 0 ? "−" : "+") + Math.floor(abs / 60) + (rest ? ":" + String(rest).padStart(2, "0") : "");
  }

  /* zone-data.js is generated; see scripts/build-zone-data.js. It carries the
     name each zone goes by today, its country and its major cities. It is an
     enhancement, not a requirement — without it the picker still lists every
     zone under whatever name the browser gave. */
  const ZONE_DATA = window.ITIN_ZONE_DATA || [];

  /* The browser already ships the whole IANA database, so nothing here is
     bundled or fetched. Built on first use — 400-odd Intl formatters is a few
     tens of milliseconds, which is fine once but not on every render. */
  let ZONE_TABLE = null;
  let ZONE_INDEX = null;

  function zoneTable() {
    if (ZONE_TABLE) return ZONE_TABLE;

    let ids = [];
    if (typeof Intl.supportedValuesOf === "function") {
      try { ids = Intl.supportedValuesOf("timeZone"); } catch (err) {}
    }
    if (!ids.length) ids = ZONES.map(z => z[0]);
    // A valid zone that the enumeration leaves out, and the app's own default.
    if (ids.indexOf("UTC") < 0) ids = ids.concat(["UTC"]);

    const listed = {};
    ids.forEach(id => { listed[id] = true; });

    /* The tzdb list of former names mixes true renames with merges of places
       that were never the same — Accra sits under Abidjan because they have
       shared rules since 1970. A former name is only a rename if this engine
       has stopped listing it as a zone of its own. */
    const region = name => name.split("/")[0];
    const factsFor = {};
    const retired = {};
    const claims = {};
    ZONE_DATA.forEach(row => {
      const current = row[0];
      const older = row[1] || [];
      factsFor[current] = { country: row[2] || "", cities: row[3] || [] };
      const gone = [];
      older.forEach(name => {
        if (!listed[name]) { gone.push(name); return; }
        // Still listed in its own right, or filed under a different region:
        // a separate place, not this one under an old name.
        if (listed[current] || region(name) !== region(current)) return;
        (claims[current] = claims[current] || []).push(name);
      });
      retired[current] = gone;
    });

    const renamedTo = {};
    Object.keys(claims).forEach(current => {
      // Two names cannot both be the old spelling of one zone; leave both be.
      if (claims[current].length === 1) renamedTo[claims[current][0]] = current;
    });

    const now = new Date();
    ZONE_TABLE = ids.map(id => {
      const shown = renamedTo[id] || id;
      const facts = factsFor[shown] || null;
      const parts = shown.split("/");
      const city = parts[parts.length - 1].replace(/_/g, " ");
      const region = parts.length > 1 ? parts[0] : "Other";
      const within = parts.length > 2 ? parts.slice(1, -1).join(" ").replace(/_/g, " ") : "";
      const country = facts ? facts.country : "";
      const cities = facts ? facts.cities : [];
      const aka = (retired[shown] || []).concat(shown === id ? [] : [id]);

      let raw = "GMT+0";
      try {
        raw = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" })
          .formatToParts(now).filter(p => p.type === "timeZoneName")[0].value;
      } catch (err) {}
      const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
      const mins = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;

      const label = offsetText(mins);
      return {
        id, city, region, within, mins, aka, country,
        offsetLabel: label,
        note: country || (within ? within + " · " + region : region),
        search: [id, city, region, within, country, label, label.replace("−", "-"), raw]
          .concat(aka, cities).join(" ").replace(/[_/]/g, " ").toLowerCase()
      };
    });

    ZONE_INDEX = {};
    ZONE_TABLE.forEach(zone => {
      ZONE_INDEX[zone.id] = zone;
      zone.aka.forEach(name => { if (!ZONE_INDEX[name]) ZONE_INDEX[name] = zone; });
    });
    return ZONE_TABLE;
  }

  function zoneById(id) {
    zoneTable();
    return ZONE_INDEX[id] || null;
  }

  function zoneLabelFor(id) {
    const zone = zoneById(id);
    return zone ? zone.city + " · " + zone.offsetLabel : id;
  }

  function searchRank(zone, q) {
    const city = zone.city.toLowerCase();
    const country = zone.country.toLowerCase();
    if (city.indexOf(q) === 0) return 0;
    if (country.indexOf(q) === 0) return 1;
    if (city.indexOf(q) >= 0) return 2;
    if (country.indexOf(q) >= 0) return 3;
    if (zone.id.toLowerCase().indexOf(q) >= 0) return 4;
    return 5;
  }

  /* Your zone, then the ones this trip already uses west to east, then the
     curated shortlist, then everything else by region. */
  function zoneGroups(tripZones, query) {
    const table = zoneTable();
    const q = (query || "").trim().toLowerCase();

    if (q) {
      const hits = table.filter(z => z.search.indexOf(q) >= 0);
      hits.sort((a, b) => searchRank(a, q) - searchRank(b, q) || a.city.localeCompare(b.city));
      return [{ label: "", zones: hits }];
    }

    const seen = {};
    const take = ids => ids
      .map(id => zoneById(id))
      .filter(z => z && !seen[z.id])
      .map(z => { seen[z.id] = true; return z; });

    const groups = [];
    const push = (label, zones) => { if (zones.length) groups.push({ label, zones }); };

    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    push("Your timezone", take([mine]));

    const trip = tripZones
      .map(id => zoneById(id))
      .filter(Boolean)
      .sort((a, b) => a.mins - b.mins || a.city.localeCompare(b.city))
      .map(z => z.id);
    push("In this trip", take(trip));

    /* Then every region, with your own first — the zone you want next is far
       more often near you than on the other side of the world. */
    const rest = table.filter(z => !seen[z.id]);
    const home = (zoneById(mine) || {}).region || "";
    const regions = [];
    rest.forEach(z => { if (regions.indexOf(z.region) < 0) regions.push(z.region); });
    regions.sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
    regions.forEach(region => {
      push(region, rest.filter(z => z.region === region).sort((a, b) => a.city.localeCompare(b.city)));
    });

    return groups;
  }

  function shortStamp(iso) {
    const at = new Date(iso);
    if (isNaN(at)) return "recently";
    const sameYear = at.getFullYear() === new Date().getFullYear();
    return at.toLocaleDateString(undefined, sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" });
  }

  function agentExpiryLabel(expiresAt) {
    const ends = new Date(expiresAt);
    if (isNaN(ends)) return expiresAt;
    return ends.toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
    });
  }

  function agentPromptFor(id, key, expiresAt) {
    const url = location.origin + "/api/keeper-of-state/itinerary/" + id;
    return [
      "You can edit my travel itinerary. It is a JSON document at",
      "",
      "  " + url,
      "",
      "Authorization: Bearer " + key,
      "",
      "That key works until " + agentExpiryLabel(expiresAt) + ".",
      "",
      "GET the URL to read the itinerary. PATCH it with a JSON merge patch (RFC 7386)",
      "and Content-Type: application/json to change it. A merge patch replaces whole",
      "arrays, so to touch one entry, read `entries`, edit it, and send the whole list back.",
      "",
      "The format is documented at " + LLM_DOC + " — read it before you write.",
      "",
      "When you are done, revoke the key:",
      "",
      "  DELETE " + url + "/keys/self",
      "",
      "Ask me what I want to change. I may paste in confirmation emails from airlines or hotels."
    ].join("\n");
  }

  class Component extends DCLogic {
    state = {
      title: "",
      entries: [],
      editing: false,
      openId: null,
      theme: "dark",
      tzMode: "local",
      view: "list",
      hiddenPeople: [],
      colors: {},
      hiddenTypes: [],
      typeMenuOpen: false,
      roster: [],
      newPerson: "",
      draft: null,
      llmOpen: false,
      settingsOpen: false,
      smartHintOpen: false,
      apiKey: "",
      model: DEFAULT_MODEL,
      apiKeyDraft: "",
      modelDraft: DEFAULT_MODEL,
      modelMenuOpen: false,
      smartOpen: false,
      smartText: "",
      smartNote: "",
      smartBusy: false,
      smartError: "",
      actions: null,
      openAction: null,
      detailId: null,
      pickerKey: null,
      pickerMonth: null,
      promptCopied: false,
      copied: false,
      blobId: null,
      canEdit: true,
      loading: true,
      loadError: "",
      saveState: "idle",
      saveError: "",
      agentKey: null,
      agentBusy: false,
      agentError: "",
      route: "trip",
      library: [],
      libraryBusy: false,
      createBusy: false,
      createError: "",
      menuId: null,
      menuInfo: null,
      sharedId: null,
      pendingRemoval: null,
      removalBusy: false,
      removalError: "",
      zoneChooser: null,
      zoneQuery: "",
      zoneActive: 0
    };

    /* One dropdown serves the toolbar and every date popover, positioned
       against whichever control opened it. The setter lives on the instance so
       the callback never has to survive a render. */
    openZoneChooser(anchor, allowLocal, onPick) {
      const rect = anchor.getBoundingClientRect();
      const width = Math.round(Math.min(340, Math.max(268, rect.width)));
      const left = Math.round(Math.min(Math.max(8, rect.left), window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const dropUp = below < 240 && above > below;

      const place = dropUp
        ? "bottom:" + Math.round(window.innerHeight - rect.top + 6) + "px"
        : "top:" + Math.round(rect.bottom + 6) + "px";

      this._zonePick = onPick;
      this.setState({
        zoneChooser: {
          allowLocal,
          position: place + ";left:" + left + "px;width:" + width + "px;max-height:" + Math.round(Math.max(220, dropUp ? above : below)) + "px"
        },
        zoneQuery: "",
        zoneActive: 0
      });
      setTimeout(() => {
        const field = document.getElementById("zone-search");
        if (field) field.focus();
      }, 0);
    }

    closeZoneChooser() {
      this._zonePick = null;
      this.setState({ zoneChooser: null, zoneQuery: "", zoneActive: 0 });
    }

    pickZone(id) {
      const pick = this._zonePick;
      this.closeZoneChooser();
      if (pick) pick(id);
    }

    moveZoneActive(delta, count) {
      if (!count) return;
      this.setState(st => ({ zoneActive: Math.max(0, Math.min(count - 1, st.zoneActive + delta)) }));
      setTimeout(() => {
        const row = document.querySelector('[data-zone-active="yes"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
      }, 0);
    }

    componentDidMount() {
      const stored = (() => { try { return localStorage.getItem("itin-theme"); } catch (e) { return null; } })();
      const base = {};
      try {
        const key = localStorage.getItem("itin-or-key");
        const model = localStorage.getItem("itin-or-model");
        if (key) { base.apiKey = key; base.apiKeyDraft = key; }
        if (model) { base.model = model; base.modelDraft = model; }
      } catch (err) {}
      const storedView = (() => { try { return localStorage.getItem("itin-view"); } catch (e) { return null; } })();
      if (storedView === "list" || storedView === "calendar") base.view = storedView;
      if (stored === "light" || stored === "dark") base.theme = stored;
      else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) base.theme = "light";

      const apply = (data, extra) => {
        const next = Object.assign({ loading: false }, base, extra || {});
        if (data && Array.isArray(data.e)) { next.title = data.t || "Trip"; next.entries = data.e; }
        if (data && data.z) { next.tzMode = data.z; }
        if (data && Array.isArray(data.r)) { next.roster = data.r; }
        if (data && data.c) { next.colors = data.c; }
        this.setState(next, () => {
          this._baseline = JSON.stringify(toDoc(this.state));
          this.sync();
        });
      };

      /* A link that cannot be opened shows the reason and nothing else —
         rendering someone else's trip underneath would read as their data. */
      const failed = message => apply(null, {
        route: "trip", loadError: message, canEdit: false, title: "", entries: [], roster: []
      });

      const open = (id, editing) => {
        readBlob(id)
          .then(doc => {
            if (!doc) throw new Error("it was deleted, or the link is wrong");
            const canEdit = !!keyFor(id);
            apply(fromDoc(doc), { route: "trip", blobId: id, canEdit, editing: canEdit && editing });
          })
          .catch(err => failed("This itinerary could not be opened — " + (err.message || String(err)) + "."));
      };

      const route = currentRoute();
      if (route) {
        open(route[1], route[2] === "edit");
        return;
      }

      /* Links from before the move to path URLs put the id, or the whole trip,
         in the fragment. */
      const hash = (location.hash || "").replace(/^#/, "");

      if (BLOB_ID_RE.test(hash)) {
        history.replaceState(null, "", tripPath(hash, false));
        open(hash, false);
        return;
      }

      if (hash) {
        decode(hash).then(
          data => data ? apply(data, { route: "trip" }) : failed("That link is not an itinerary this app understands."),
          () => failed("That link is not an itinerary this app understands.")
        );
        return;
      }

      apply(null, { route: "list", library: libraryItems(), title: "", entries: [] });
      this.loadLibrary();
    }

    loadLibrary() {
      const items = libraryItems();
      this.setState({ library: items });
      if (!items.length) return;
      this.setState({ libraryBusy: true });
      refreshLibrary(items).then(
        fresh => this.setState({ library: fresh, libraryBusy: false }),
        () => this.setState({ libraryBusy: false })
      );
    }

    createItinerary() {
      if (this.state.createBusy) return;
      this.setState({ createBusy: true, createError: "" });
      const doc = emptyDoc();
      createBlob(doc).then(
        created => {
          rememberItinerary(created.id, {
            role: "owner",
            key: created.edit_key,
            title: doc.title,
            created: created.created_at,
            modified: created.created_at
          });
          location.assign(tripPath(created.id, true));
        },
        err => this.setState({ createBusy: false, createError: "Could not create an itinerary — " + (err.message || String(err)) + "." })
      );
    }

    shareItinerary(id, title) {
      const url = location.origin + tripPath(id, false);
      const text = "Look at my itinerary for " + (title || "our trip");
      const done = () => {
        this.setState({ sharedId: id });
        setTimeout(() => this.setState(st => (st.sharedId === id ? { sharedId: null } : null)), 1800);
      };
      const canShare = typeof navigator !== "undefined" && navigator.share
        && (!navigator.canShare || navigator.canShare({ text: text + "\n\n" + url }));
      if (canShare) {
        navigator.share({ title: title || "Itinerary", text: text + "\n\n" + url }).catch(() => {});
        return;
      }
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done);
      else done();
    }

    confirmRemoval() {
      const pending = this.state.pendingRemoval;
      if (!pending || this.state.removalBusy) return;

      if (pending.mode === "forget") {
        this.setState({ library: forgetItinerary(pending.id), pendingRemoval: null });
        return;
      }

      this.setState({ removalBusy: true, removalError: "" });
      deleteBlob(pending.id, keyFor(pending.id)).then(
        () => this.setState({ library: forgetItinerary(pending.id), pendingRemoval: null, removalBusy: false }),
        err => this.setState({ removalBusy: false, removalError: "Could not delete it — " + (err.message || String(err)) + "." })
      );
    }

    sync() {
      const s = this.state;
      try {
        localStorage.setItem("itin-theme", s.theme);
        localStorage.setItem("itin-view", s.view);
      } catch (err) {}
      document.documentElement.setAttribute("data-theme", s.theme);
      document.body.setAttribute("data-theme", s.theme);

      let page = document.getElementById("itin-page-size");
      if (!page) {
        page = document.createElement("style");
        page.id = "itin-page-size";
        document.head.appendChild(page);
      }
      page.textContent = s.view === "calendar"
        ? "@page { size: landscape; margin: 0 } @media print { .sheet { padding: 11mm 12mm !important } }"
        : "@page { size: portrait; margin: 0 } @media print { .sheet { padding: 14mm 16mm !important } }";

      this.scheduleSave();
    }

    /* Nothing reaches the store until the itinerary itself changes, so a
       drive-by visit — or a theme toggle — never creates a blob. */
    scheduleSave() {
      const s = this.state;
      if (s.loading || !s.canEdit) return;
      if (JSON.stringify(toDoc(s)) === this._baseline) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.saveNow(), 700);
      if (s.saveState !== "unsaved") this.setState({ saveState: "unsaved" });
    }

    /* `force` is for the paths that need an id in hand — sharing a link,
       minting an agent key — where an untouched draft still has to land. */
    saveNow(force) {
      clearTimeout(this._saveTimer);
      if (this._saving) {
        this._resave = true;
        return this._saving;
      }

      const doc = toDoc(this.state);
      const body = JSON.stringify(doc);
      const needsId = force && !this.state.blobId;
      if (body === this._baseline && !needsId) return Promise.resolve(true);
      if (!this.state.canEdit) return Promise.resolve(false);

      this._resave = false;
      this.setState({ saveState: "saving", saveError: "" });

      this._saving = (async () => {
        try {
          const id = this.state.blobId;
          if (id) {
            const key = keyFor(id);
            if (!key) throw new Error("this browser can no longer edit it");
            const modified = await writeBlob(id, key, doc);
            rememberItinerary(id, { title: doc.title, modified });
          } else {
            const created = await createBlob(doc);
            rememberItinerary(created.id, {
              role: "owner",
              key: created.edit_key,
              title: doc.title,
              created: created.created_at,
              modified: created.created_at
            });
            history.replaceState(null, "", tripPath(created.id, this.state.editing));
            this.setState({ blobId: created.id });
          }
          this._baseline = body;
          this.setState({ saveState: "saved", saveError: "" });
          return true;
        } catch (err) {
          this.setState({ saveState: "error", saveError: err.message || String(err) });
          return false;
        } finally {
          this._saving = null;
          if (this._resave) this.saveNow();
        }
      })();

      return this._saving;
    }

    /* List or calendar is how one person likes to read a trip, not part of
       the trip, so it stays in this browser and never reaches the server. */
    setView(view) {
      this.setState({ view }, () => this.sync());
    }

    mutate(updater) {
      this.setState(updater, () => this.sync());
    }

    /* Minted as the handoff opens so the prompt is ready to copy. A key from
       earlier in this session is reused while it still has real time on it,
       rather than leaving a trail of live keys behind every time the dialog
       is opened. */
    mintKeyForAgent() {
      const live = this.state.agentKey;
      if (live && Date.parse(live.expires_at) - Date.now() > 60000) return Promise.resolve(true);
      if (this.state.agentBusy) return Promise.resolve(false);

      this.setState({ agentBusy: true, agentError: "" });
      return this.saveNow(true)
        .then(saved => {
          if (!saved) throw new Error("the itinerary could not be saved first");
          const id = this.state.blobId;
          return mintAgentKey(id, keyFor(id), AGENT_KEY_SECONDS);
        })
        .then(
          minted => {
            this.setState({ agentKey: minted, agentBusy: false });
            return true;
          },
          err => {
            this.setState({ agentBusy: false, agentError: "Could not set up access for the assistant — " + (err.message || String(err)) + "." });
            return false;
          }
        );
    }

    displayZone(entry) {
      if (this.state.tzMode === "local") return entry.startTz || "UTC";
      return this.state.tzMode;
    }

    patch(id, key, value) {
      this.mutate(s => ({ entries: s.entries.map(e => e.id === id ? Object.assign({}, e, { [key]: value }) : e) }));
    }

    describe(e, tz) {
      const endTz = this.state.tzMode === "local" ? (e.endTz || e.startTz) : tz;
      const meta = [];
      let title = "";
      if (e.type === "flight" || e.type === "transit") {
        title = (e.from || "?") + " → " + (e.to || "?");
        const inst = wallToInstant(e.end, e.endTz || e.startTz);
        if (inst) meta.push({ text: "Arrives " + fmt(inst, endTz, { weekday:"short", hour:"numeric", minute:"2-digit" }).replace("AM","am").replace("PM","pm") + " " + abbr(inst, endTz) });
      } else if (e.type === "drive") {
        title = "Drive " + (e.from || "?") + " → " + (e.to || "?");
        const inst = wallToInstant(e.end, e.endTz || e.startTz);
        if (inst) meta.push({ text: "Arrives " + fmt(inst, endTz, { weekday:"short", hour:"numeric", minute:"2-digit" }).replace("AM","am").replace("PM","pm") + " " + abbr(inst, endTz) });
      } else if (e.type === "lodging") {
        title = e.name || "Lodging";
        if (e.from) meta.push({ text: e.from });
        const inst = wallToInstant(e.end, e.endTz || e.startTz);
        if (inst) meta.push({ text: "Until " + fmt(inst, endTz, { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).replace("AM","am").replace("PM","pm") });
      } else {
        title = e.name || SCHEMA[e.type].label;
        if (e.from) meta.push({ text: e.from });
      }
      return { title, meta };
    }

    splitPeople(e) {
      if (Array.isArray(e.people)) return e.people;
      return (e.people || "").split(/,| and /i).map(x => x.trim()).filter(Boolean);
    }

    roster() {
      return rosterOrder(this.state);
    }

    nextPeople(cur, name, on, key) {
      this._prevPeople = this._prevPeople || {};
      if (name === EVERYONE) {
        if (on) {
          if (cur.length && cur.indexOf(EVERYONE) < 0) this._prevPeople[key] = cur;
          return [EVERYONE];
        }
        const restored = this._prevPeople[key];
        delete this._prevPeople[key];
        return restored || [];
      }
      if (on) return cur.filter(x => x !== EVERYONE).concat(cur.indexOf(name) < 0 ? [name] : []);
      return cur.filter(x => x !== name);
    }

    setDraftPerson(name, on) {
      this.patchDraft("people", this.nextPeople(this.splitPeople(this.state.draft), name, on, "draft"));
    }

    setPerson(id, name, on) {
      this.mutate(s => ({
        entries: s.entries.map(e => {
          if (e.id !== id) return e;
          return Object.assign({}, e, { people: this.nextPeople(this.splitPeople(e), name, on, "entry:" + id) });
        })
      }));
    }

    defaultZone() {
      const last = this.state.entries[this.state.entries.length - 1];
      return (last && (last.endTz || last.startTz)) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    openDraft(isoDay) {
      const day = isoDay || (this.state.entries[0] && this.state.entries[0].start ? this.state.entries[0].start.slice(0, 10) : new Date().toISOString().slice(0, 10));
      this.setState({
        editing: true,
        draft: { id: "e" + Math.random().toString(36).slice(2, 8), type: "flight", start: day + "T12:00", startTz: this.defaultZone(), endTz: this.defaultZone(), people: [EVERYONE] }
      });
    }

    patchDraft(key, value) {
      this.setState(s => ({ draft: Object.assign({}, s.draft, { [key]: value }) }));
    }

    addPerson(id, raw) {
      const name = (raw || "").trim();
      if (!name) return;
      this.setState(s => ({
        roster: (s.roster || []).indexOf(name) < 0 ? (s.roster || []).concat([name]) : s.roster,
        newPerson: ""
      }), () => { if (id === "draft") this.setDraftPerson(name, true); else this.setPerson(id, name, true); });
    }

    smartRequest() {
      const s = this.state;
      const existing = s.entries.map(e => ({
        id: e.id, type: e.type, start: e.start, startTz: e.startTz, end: e.end, endTz: e.endTz,
        from: e.from, to: e.to, operator: e.operator, service: e.service, name: e.name,
        people: this.splitPeople(e)
      }));
      const parts = [
        "Today is " + new Date().toISOString().slice(0, 10) + ".",
        "Known travelers: " + (this.roster().join(", ") || "none yet") + ".",
        "The itinerary as it stands (ids are what update/people/delete must reference):",
        JSON.stringify(existing),
        "",
        "New text to turn into actions:",
        s.smartText || "(none — work only from the note below)"
      ];
      if (s.smartNote.trim()) {
        parts.push("", "The last set of actions was not right. Correction from the user:", s.smartNote.trim());
      }
      return parts.join("\n");
    }

    async callModel() {
      const key = (this.state.apiKey || "").trim();
      if (!key) throw new Error("Add an OpenRouter API key in Settings first.");
      if (!this.state.smartText.trim() && !this.state.smartNote.trim()) {
        throw new Error("Paste some text to work from.");
      }

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key,
          "HTTP-Referer": location.origin,
          "X-Title": "Itinerary"
        },
        body: JSON.stringify({
          model: this.state.model || DEFAULT_MODEL,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: this.smartRequest() }
          ]
        })
      });

      const raw = await res.text();
      if (!res.ok) throw new Error("OpenRouter returned " + res.status + ": " + raw.slice(0, 300));

      let payload;
      try { payload = JSON.parse(raw); } catch (err) { throw new Error("OpenRouter sent back something unreadable: " + raw.slice(0, 300)); }
      if (payload.error) throw new Error(payload.error.message || JSON.stringify(payload.error));

      const content = payload.choices && payload.choices[0] && payload.choices[0].message
        ? payload.choices[0].message.content : "";
      if (!content) throw new Error("The assistant replied with nothing.");

      const body = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
      const open = body.indexOf("{");
      const close = body.lastIndexOf("}");
      if (open < 0 || close < open) throw new Error("The assistant did not answer in the expected form: " + content.slice(0, 300));

      let parsed;
      try { parsed = JSON.parse(body.slice(open, close + 1)); }
      catch (err) { throw new Error("The assistant did not answer in the expected form: " + content.slice(0, 300)); }

      const actions = Array.isArray(parsed.actions) ? parsed.actions : null;
      if (!actions) throw new Error("The assistant did not suggest any changes: " + content.slice(0, 300));

      const ids = this.state.entries.map(e => e.id);
      const usable = actions.filter(a =>
        a && (a.kind === "add" ? !!a.entry : ids.indexOf(a.id) >= 0)
      );
      if (!usable.length) throw new Error("Nothing in the reply could be applied to this itinerary.");

      return usable.map((a, i) => Object.assign({ aid: "a" + i + Math.random().toString(36).slice(2, 6) }, a));
    }

    runSmart() {
      if (this.state.smartBusy) return;
      this.setState({ smartBusy: true, smartError: "", openAction: null });
      this.callModel().then(
        actions => this.setState({ actions, smartBusy: false, openAction: null }),
        err => this.setState({ smartBusy: false, smartError: err.message || String(err) })
      );
    }

    patchAction(aid, key, value) {
      this.setState(s => ({
        actions: s.actions.map(a => {
          if (a.aid !== aid) return a;
          const target = a.kind === "update" ? "fields" : "entry";
          return Object.assign({}, a, { [target]: Object.assign({}, a[target] || {}, { [key]: value }) });
        })
      }));
    }

    actionPeople(a) {
      if (a.kind === "people") return a.people || [];
      const src = a.kind === "update" ? a.fields : a.entry;
      return (src && src.people) || [];
    }

    setActionPerson(aid, name, on) {
      this.setState(s => ({
        actions: s.actions.map(a => {
          if (a.aid !== aid) return a;
          const next = this.nextPeople(this.actionPeople(a), name, on, "action:" + aid);
          if (a.kind === "people") return Object.assign({}, a, { people: next });
          const target = a.kind === "update" ? "fields" : "entry";
          return Object.assign({}, a, { [target]: Object.assign({}, a[target] || {}, { people: next }) });
        })
      }));
    }

    applyActions() {
      const list = this.state.actions || [];
      this.mutate(s => {
        let entries = s.entries.slice();
        list.forEach(a => {
          if (a.kind === "add" && a.entry) {
            entries = entries.concat([Object.assign({ id: "e" + Math.random().toString(36).slice(2, 8) }, a.entry)]);
          } else if (a.kind === "update" && a.id) {
            entries = entries.map(e => e.id === a.id ? Object.assign({}, e, a.fields || {}) : e);
          } else if (a.kind === "people" && a.id) {
            entries = entries.map(e => e.id === a.id ? Object.assign({}, e, { people: a.people || [] }) : e);
          } else if (a.kind === "delete" && a.id) {
            entries = entries.filter(e => e.id !== a.id);
          }
        });
        return { entries, actions: null, smartOpen: false, smartText: "", smartNote: "", openAction: null };
      });
    }

    describeAction(a) {
      const src = a.kind === "update" ? (a.fields || {}) : (a.entry || {});
      const existing = this.state.entries.filter(e => e.id === a.id)[0];
      const label = e => {
        if (!e) return "an entry";
        if (e.type === "flight" || e.type === "transit" || e.type === "drive") return (e.from || "?") + " → " + (e.to || "?");
        return e.name || SCHEMA[e.type] && SCHEMA[e.type].label || "entry";
      };
      if (a.kind === "add") return { summary: label(src), detail: [SCHEMA[src.type] ? SCHEMA[src.type].label : src.type, [src.operator, src.service].filter(Boolean).join(" "), src.start].filter(Boolean).join(" · ") };
      if (a.kind === "update") {
        const type = (existing && existing.type) || "note";
        const named = (SCHEMA[type] || SCHEMA.note).fields;
        const human = key => {
          const match = named.filter(f => f[0] === key || f[3] === key)[0];
          return match ? match[1].toLowerCase() : key;
        };
        const changed = Object.keys(a.fields || {}).map(human);
        return { summary: label(existing), detail: "Change the " + changed.filter((v, i, all) => all.indexOf(v) === i).join(" and ") };
      }
      if (a.kind === "people") return { summary: label(existing), detail: "Travelers become " + (a.people || []).join(", ") };
      return { summary: label(existing), detail: "Remove this entry" };
    }

    pickerFor(key, value, zone, setValue, setZone) {
      const s = this.state;
      const open = s.pickerKey === key;
      const datePart = (value || "").slice(0, 10);
      const timePart = (value || "").slice(11, 16) || "12:00";
      const month = open ? (s.pickerMonth || datePart.slice(0, 7) || new Date().toISOString().slice(0, 7)) : (datePart.slice(0, 7) || "");
      const shiftMonth = n => {
        const [y, m] = (month || new Date().toISOString().slice(0, 7)).split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 1 + n, 1));
        this.setState({ pickerMonth: d.toISOString().slice(0, 7) });
      };

      let days = [];
      let monthLabel = "";
      if (open && month) {
        const [y, m] = month.split("-").map(Number);
        const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
        monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
        for (let i = 0; i < 42; i++) {
          const d = new Date(Date.UTC(y, m - 1, 1 - firstDow + i));
          const iso = d.toISOString().slice(0, 10);
          const inMonth = d.getUTCMonth() === m - 1;
          const selected = iso === datePart;
          days.push({
            label: String(d.getUTCDate()),
            bg: selected ? "var(--accent)" : "transparent",
            fg: selected ? "var(--bg)" : (inMonth ? "var(--fg)" : "var(--muted)"),
            border: selected ? "var(--accent)" : "transparent",
            onPick: () => setValue(iso + "T" + timePart)
          });
        }
        if (days.slice(35).every(d => d.fg === "var(--muted)")) days = days.slice(0, 35);
      }

      const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const counts = {};
      const sameDay = {};
      this.state.entries.forEach(e => {
        const touches = e.start && e.start.slice(0, 10) === datePart
          || (e.end && datePart && e.start && e.start.slice(0, 10) <= datePart && e.end.slice(0, 10) >= datePart);
        [e.startTz, e.endTz].forEach(z => {
          if (!z) return;
          counts[z] = (counts[z] || 0) + 1;
          if (touches) sameDay[z] = (sameDay[z] || 0) + 1;
        });
      });
      const rank = z => (sameDay[z] ? 1000 + sameDay[z] : 0) + (counts[z] || 0) + (z === mine ? 0.5 : 0);
      const nearby = Object.keys(counts).concat(counts[mine] ? [] : [mine])
        .sort((a, b) => rank(b) - rank(a));
      if (zone && nearby.indexOf(zone) < 0) nearby.unshift(zone);
      const shortOf = id => id.split("/").pop().replace(/_/g, " ");

      const inst = wallToInstant(value, zone);
      const display = value
        ? new Date(datePart + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" })
          + " · " + new Date("1970-01-01T" + timePart + ":00Z").toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).replace("AM", "am").replace("PM", "pm")
          + (inst ? " " + abbr(inst, zone) : "")
        : "Pick a date and time";

      return {
        display,
        pickerOpen: open,
        onOpen: () => this.setState({ pickerKey: key, pickerMonth: datePart.slice(0, 7) || new Date().toISOString().slice(0, 7) }),
        onClose: () => this.setState({ pickerKey: null }),
        onPrevMonth: () => shiftMonth(-1),
        onNextMonth: () => shiftMonth(1),
        monthLabel,
        days,
        timeValue: (value || "").slice(11, 16),
        onTimeChange: ev => setValue((datePart || new Date().toISOString().slice(0, 10)) + "T" + (ev.target.value || "12:00")),
        zoneLabel: zoneLabelFor(zone),
        onZoneOpen: ev => this.openZoneChooser(ev.currentTarget, false, id => setZone(id)),
        hasNearby: open && nearby.length > 1,
        nearbyZones: nearby.slice(0, 4).map(z => ({
          short: shortOf(z),
          fg: z === zone ? "var(--accent)" : "var(--muted)",
          bg: z === zone ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "transparent",
          border: z === zone ? "var(--accent)" : "var(--border)",
          onPick: () => setZone(z)
        }))
      };
    }

    buildFields(type, src, prefix, patch) {
      return (SCHEMA[type] || SCHEMA.note).fields.map(fd => {
        const base = {
          label: fd[1],
          value: src[fd[0]] || "",
          isText: fd[2] === "text",
          isWhen: fd[2] === "when",
          onChange: ev => patch(fd[0], ev.target.value)
        };
        if (fd[2] !== "when") return base;
        const zone = (fd[3] ? src[fd[3]] : "") || src.startTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
        return Object.assign(base, this.pickerFor(
          prefix + ":" + fd[0],
          src[fd[0]] || "",
          zone,
          v => patch(fd[0], v),
          z => patch(fd[3], z)
        ));
      });
    }

    renderVals() {
      const s = this.state;
      const roster = this.roster();
      const palette = colorMap(s);
      const chip = (name, on) => {
        if (!on) return { name, fg: "var(--muted)", bg: "transparent", border: "var(--border)" };
        const c = name === EVERYONE ? "var(--fg)" : "var(--p" + (palette[name] || 0) + ")";
        return {
          name,
          fg: c,
          bg: "color-mix(in oklab, " + c + " 12%, transparent)",
          border: "color-mix(in oklab, " + c + " 38%, transparent)"
        };
      };
      const hidden = s.hiddenPeople || [];
      const visible = n => hidden.indexOf(n) < 0;

      const anyVisible = roster.length === 0 || roster.some(visible);
      const hiddenTypes = s.hiddenTypes || [];
      const rows = s.entries.filter(e => {
        if (hiddenTypes.indexOf(e.type) >= 0) return false;
        const p = this.splitPeople(e);
        if (p.length === 0) return true;
        if (p.indexOf(EVERYONE) >= 0) return anyVisible;
        return p.some(visible);
      }).map(e => {
        const tz = this.displayZone(e);
        const inst = wallToInstant(e.start, e.startTz || "UTC");
        const d = this.describe(e, tz);
        return {
          id: e.id,
          instant: inst == null ? Infinity : inst,
          dayKey: inst == null ? "zzz" : fmt(inst, tz, { year:"numeric", month:"2-digit", day:"2-digit" }),
          dayIso: e.start ? e.start.slice(0, 10) : null,
          isoDay: inst == null ? null : new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(inst)),
          chipColor: (() => { const p = this.splitPeople(e); const n = p.filter(x => x !== EVERYONE)[0]; return n ? chip(n, true).fg : "var(--muted)"; })(),
          weekday: inst == null ? "Unscheduled" : fmt(inst, tz, { weekday:"long" }),
          date: inst == null ? "" : fmt(inst, tz, { month:"long", day:"numeric", year:"numeric" }),
          dateShort: inst == null ? "" : fmt(inst, tz, { month:"short", day:"numeric", year:"numeric" }),
          time: inst == null ? "—" : fmt(inst, tz, { hour:"numeric", minute:"2-digit" }).toLowerCase().replace(" ", " "),
          zone: inst == null ? "" : abbr(inst, tz),
          kind: SCHEMA[e.type].label,
          isFlight: e.type === "flight",
          isDrive: e.type === "drive",
          isTransit: e.type === "transit",
          isLodging: e.type === "lodging",
          isBooking: e.type === "booking",
          isNote: e.type === "note",
          carrier: [e.operator, e.service].filter(Boolean).join(" "),
          hasDetail: (e.type === "flight" || e.type === "transit") && !!(e.operator || e.service),
          plainCarrier: !((e.type === "flight" || e.type === "transit") && !!(e.operator || e.service)),
          detailOpen: s.detailId === e.id,
          onDetail: () => this.setState(st => ({ detailId: st.detailId === e.id ? null : e.id })),
          onDetailEnter: () => { clearTimeout(this._detailTimer); this.setState({ detailId: e.id }); },
          onDetailLeave: () => {
            clearTimeout(this._detailTimer);
            this._detailTimer = setTimeout(() => this.setState(st => (st.detailId === e.id ? { detailId: null } : null)), 220);
          },
          detailTitle: [e.operator, e.service].filter(Boolean).join(" "),
          detailRows: (() => {
            const out = [];
            const dep = wallToInstant(e.start, e.startTz);
            const arr = wallToInstant(e.end, e.endTz || e.startTz);
            const clock = (inst, tz) => inst ? fmt(inst, tz, { hour:"numeric", minute:"2-digit" }).replace("AM","am").replace("PM","pm") + " " + abbr(inst, tz) : "";
            if (e.from) out.push({ label: "From", place: e.from, time: clock(dep, e.startTz) });
            if (e.to) out.push({ label: "To", place: e.to, time: clock(arr, e.endTz || e.startTz) });
            if (dep && arr) {
              const mins = Math.round((arr - dep) / 60000);
              if (mins > 0) out.push({ label: "Duration", place: Math.floor(mins / 60) + "h " + (mins % 60) + "m", time: "" });
            }
            return out;
          })(),
          trackUrl: e.type === "flight" && e.service ? "https://www.flightaware.com/live/flight/" + e.service.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "",
          trackLabel: "Track on FlightAware →",
          people: this.splitPeople(e).map(n => chip(n, true)),
          roster: [EVERYONE].concat(roster).map(n => {
            const on = this.splitPeople(e).indexOf(n) >= 0;
            const c = chip(n, on);
            return { name: n, fg: c.fg, bg: c.bg, border: c.border, on, off: !on, onToggle: () => this.setPerson(e.id, n, !on) };
          }),
          onNewPerson: ev => { if (ev.key === "Enter") { ev.preventDefault(); this.addPerson(e.id, ev.target.value); } },
          title: d.title,
          meta: d.meta,
          open: s.openId === e.id,
          editLabel: s.openId === e.id ? "Done" : "Edit",
          onToggle: () => this.setState(st => ({ openId: st.openId === e.id ? null : e.id })),
          onDelete: () => this.mutate(st => ({ entries: st.entries.filter(x => x.id !== e.id), openId: null })),
          fields: this.buildFields(e.type, e, "entry:" + e.id, (k, v) => this.patch(e.id, k, v))
        };
      }).sort((a, b) => a.instant - b.instant);

      const days = [];
      rows.forEach(r => {
        let d = days[days.length - 1];
        if (!d || d.key !== r.dayKey) {
          d = { key: r.dayKey, weekday: r.weekday, date: r.date, onAdd: () => this.openDraft(r.dayIso), entries: [] };
          days.push(d);
        }
        d.entries.push(r);
      });

      const zoneNow = s.tzMode === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : s.tzMode;
      const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: zoneNow, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      days.forEach((d, i) => {
        d.isToday = !!(d.entries[0] && d.entries[0].isoDay === nowParts);
        d.headColor = d.isToday ? "var(--accent)" : "var(--fg)";
        const prev = days[i - 1];
        const a = prev && prev.entries[0] && prev.entries[0].isoDay;
        const b = d.entries[0] && d.entries[0].isoDay;
        const diff = a && b ? Math.round((Date.parse(b + "T00:00Z") - Date.parse(a + "T00:00Z")) / 86400000) : 0;
        d.hasGap = diff >= 3;
        d.gapLabel = diff >= 3 ? diff + " days later" : "";
      });

      const byDay = {};
      rows.forEach(r => { if (r.isoDay) (byDay[r.isoDay] = byDay[r.isoDay] || []).push(r); });
      const dayKeys = Object.keys(byDay).sort();
      const months = [];
      if (dayKeys.length) {
        const [sy, sm] = dayKeys[0].split("-").map(Number);
        const [ey, em] = dayKeys[dayKeys.length - 1].split("-").map(Number);
        let y = sy, mo = sm;
        while (y < ey || (y === ey && mo <= em)) {
          const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
          const cells = [];
          for (let i = 0; i < 42; i++) {
            const d = new Date(Date.UTC(y, mo - 1, 1 - firstDow + i));
            const iso = d.toISOString().slice(0, 10);
            const inMonth = d.getUTCMonth() === mo - 1;
            cells.push({
              dayNum: String(d.getUTCDate()),
              numFg: inMonth ? "var(--muted)" : "transparent",
              items: inMonth ? (byDay[iso] || []).map(r => ({
                label: r.time + "  " + r.title,
                tip: r.kind + " · " + r.title + " · " + r.time + " " + r.zone,
                color: r.chipColor
              })) : []
            });
          }
          const weeks = [];
          for (let w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7));
          const keep = weeks.filter(wk => wk.some(c => c.items.length));
          const kept = (keep.length ? keep : weeks.filter(wk => wk.some(c => c.numFg !== "transparent"))).reduce((a, wk) => a.concat(wk), []);
          cells.length = 0;
          kept.forEach(c => cells.push(c));
          months.push({ label: new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" }), cells });
          mo++; if (mo > 12) { mo = 1; y++; }
        }
      }

      const first = rows[0], last = rows[rows.length - 1];
      const span = first && last && first.dateShort && last.dateShort
        ? (first.dateShort === last.dateShort ? first.dateShort : first.dateShort + " – " + last.dateShort)
        : "No dates yet";
      const subtitle = span;

      const pending = s.pendingRemoval;

      const chooser = s.zoneChooser;
      const chooserQuery = (s.zoneQuery || "").trim().toLowerCase();
      let chooserGroups = [];
      let chooserCount = 0;
      if (chooser) {
        const tripZones = [];
        s.entries.forEach(e => [e.startTz, e.endTz].forEach(z => {
          if (z && tripZones.indexOf(z) < 0) tripZones.push(z);
        }));

        const raw = zoneGroups(tripZones, s.zoneQuery);
        if (chooser.allowLocal && (!chooserQuery || "local time at each stop".indexOf(chooserQuery) >= 0)) {
          raw.unshift({ label: "", zones: [{ id: "local", city: "Local time at each stop", note: "", offsetLabel: "" }] });
        }

        let index = 0;
        chooserGroups = raw.map(group => ({
          label: group.label,
          hasLabel: !!group.label,
          zones: group.zones.map(zone => {
            const at = index++;
            const on = zone.id === s.tzMode || (chooser.allowLocal && zone.id === "local" && s.tzMode === "local");
            const active = at === s.zoneActive;
            return {
              city: zone.city,
              note: zone.note,
              offsetLabel: zone.offsetLabel,
              activeAttr: active ? "yes" : "no",
              bg: active ? "var(--card)" : "transparent",
              fg: on ? "var(--accent)" : "var(--fg)",
              onPick: () => this.pickZone(zone.id)
            };
          })
        }));
        chooserCount = index;
      }

      const flatZones = chooserGroups.reduce((all, g) => all.concat(g.zones), []);

      return {
        zoneChooserOpen: !!chooser,
        zonePopPosition: chooser ? chooser.position : "",
        zoneQuery: s.zoneQuery,
        zoneGroups: chooserGroups,
        zoneNoMatch: !!chooser && chooserCount === 0,
        onZoneQuery: ev => this.setState({ zoneQuery: ev.target.value, zoneActive: 0 }),
        onZoneKey: ev => {
          if (ev.key === "ArrowDown") { ev.preventDefault(); this.moveZoneActive(1, chooserCount); }
          else if (ev.key === "ArrowUp") { ev.preventDefault(); this.moveZoneActive(-1, chooserCount); }
          else if (ev.key === "Enter") {
            ev.preventDefault();
            const row = flatZones[this.state.zoneActive];
            if (row) row.onPick();
          } else if (ev.key === "Escape") { ev.preventDefault(); this.closeZoneChooser(); }
        },
        closeZoneChooser: () => this.closeZoneChooser(),
        theme: s.theme,
        isLibrary: !s.loading && s.route === "list",
        isTrip: !s.loading && s.route !== "list",
        hasLibrary: s.route === "list" && s.library.length > 0,
        isLibraryEmpty: s.route === "list" && s.library.length === 0,
        createLabel: s.createBusy ? "Creating…" : "Create itinerary",
        createItinerary: () => this.createItinerary(),
        showCreateError: !!s.createError,
        createError: s.createError,
        demoUrl: tripPath(DEMO_ID, false),
        libraryRows: s.library.map(item => {
          const owned = item.role === "owner" && !!item.key;
          return {
            id: item.id,
            title: item.title || UNTITLED,
            note: item.modified ? "Edited " + shortStamp(item.modified) : "Not opened yet",
            href: tripPath(item.id, false),
            editHref: tripPath(item.id, true),
            owned,
            menuOpen: s.menuId === item.id,
            shareLabel: s.sharedId === item.id ? "Link copied" : "Share",
            onMenu: () => this.setState(st => ({ menuId: st.menuId === item.id ? null : item.id, menuInfo: null })),
            onCloseMenu: () => this.setState({ menuId: null, menuInfo: null }),
            onShare: () => {
              this.setState({ menuId: null, menuInfo: null });
              this.shareItinerary(item.id, item.title);
            },
            onForget: () => this.setState({ menuId: null, menuInfo: null, removalError: "", pendingRemoval: { id: item.id, title: item.title || UNTITLED, mode: "forget" } }),
            onDelete: () => this.setState({ menuId: null, menuInfo: null, removalError: "", pendingRemoval: { id: item.id, title: item.title || UNTITLED, mode: "delete" } }),
            forgetInfoOpen: !!s.menuInfo && s.menuInfo.id === item.id && s.menuInfo.kind === "forget",
            deleteInfoOpen: !!s.menuInfo && s.menuInfo.id === item.id && s.menuInfo.kind === "delete",
            onForgetInfoEnter: () => this.setState({ menuInfo: { id: item.id, kind: "forget" } }),
            onDeleteInfoEnter: () => this.setState({ menuInfo: { id: item.id, kind: "delete" } }),
            onInfoLeave: () => this.setState({ menuInfo: null }),
            onForgetInfo: () => this.setState(st => ({ menuInfo: st.menuInfo && st.menuInfo.kind === "forget" && st.menuInfo.id === item.id ? null : { id: item.id, kind: "forget" } })),
            onDeleteInfo: () => this.setState(st => ({ menuInfo: st.menuInfo && st.menuInfo.kind === "delete" && st.menuInfo.id === item.id ? null : { id: item.id, kind: "delete" } }))
          };
        }),
        removalOpen: !!pending,
        removalTitle: pending ? (pending.mode === "delete" ? "Delete it for everyone?" : "Forget it on this device?") : "",
        removalBody: pending
          ? (pending.mode === "delete"
            ? "“" + pending.title + "” will be erased. Everyone you gave the link to loses it too, not just you, and there is no undo."
            : "“" + pending.title + "” disappears from this list on this device. Your link keeps working, but you will not be able to change the itinerary again.")
          : "",
        removalConfirmLabel: pending
          ? (s.removalBusy ? "Deleting…" : pending.mode === "delete" ? "Delete for everyone" : "Forget it")
          : "",
        confirmRemoval: () => this.confirmRemoval(),
        cancelRemoval: () => this.setState({ pendingRemoval: null, removalError: "" }),
        showRemovalError: !!s.removalError,
        removalError: s.removalError,
        months,
        isList: !s.loadError && s.view !== "calendar",
        isCalendar: !s.loadError && s.view === "calendar",
        showToolbar: !s.loadError,
        showList: () => this.setView("list"),
        showCalendar: () => this.setView("calendar"),
        listBg: s.view !== "calendar" ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "var(--card)",
        listZ: s.view === "calendar" ? 0 : 1,
        calZ: s.view === "calendar" ? 1 : 0,
        listFg: s.view !== "calendar" ? "var(--accent)" : "var(--muted)",
        listBorder: s.view !== "calendar" ? "var(--accent)" : "var(--border)",
        calBg: s.view === "calendar" ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "var(--card)",
        calFg: s.view === "calendar" ? "var(--accent)" : "var(--muted)",
        calBorder: s.view === "calendar" ? "var(--accent)" : "var(--border)",
        weekdayLabels: ["S", "M", "T", "W", "T", "F", "S"].map((w, i) => ({ label: w, key: i })),
        hasPeople: roster.length > 1,
        newPerson: s.newPerson,
        onNewPersonChange: ev => this.setState({ newPerson: ev.target.value }),
        openAddTop: () => this.openDraft(null),
        openLlm: () => {
          this.setState({ llmOpen: true, agentError: "" });
          this.mintKeyForAgent();
        },
        hasKey: !!s.apiKey,
        noKey: !s.apiKey,
        smartHintOpen: s.smartHintOpen,
        toggleSmartHint: () => this.setState(st => ({ smartHintOpen: !st.smartHintOpen })),
        onSmartHintEnter: () => { clearTimeout(this._hintTimer); this.setState({ smartHintOpen: true }); },
        onSmartHintLeave: () => { clearTimeout(this._hintTimer); this._hintTimer = setTimeout(() => this.setState({ smartHintOpen: false }), 220); },
        openSettingsFromHint: () => this.setState({ smartHintOpen: false, settingsOpen: true, apiKeyDraft: s.apiKey, modelDraft: s.model, modelMenuOpen: false }),
        settingsOpen: s.settingsOpen,
        apiKeyDraft: s.apiKeyDraft,
        modelLabel: (MODELS.filter(m => m[0] === s.modelDraft)[0] || [null, s.modelDraft])[1],
        modelIsSuggested: !!(MODELS.filter(m => m[0] === s.modelDraft)[0] || [])[3],
        modelMenuOpen: s.modelMenuOpen,
        toggleModelMenu: () => this.setState(st => ({ modelMenuOpen: !st.modelMenuOpen })),
        modelOptions: MODELS.map(m => ({
          label: m[1],
          note: m[2],
          suggested: m[3],
          fg: s.modelDraft === m[0] ? "var(--accent)" : "var(--fg)",
          bg: s.modelDraft === m[0] ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "transparent",
          onPick: () => this.setState({ modelDraft: m[0], modelMenuOpen: false })
        })),
        openSettings: () => this.setState({ settingsOpen: true, apiKeyDraft: s.apiKey, modelDraft: s.model, modelMenuOpen: false }),
        closeSettings: () => this.setState({ settingsOpen: false, modelMenuOpen: false }),
        onApiKey: ev => this.setState({ apiKeyDraft: ev.target.value }),
        saveSettings: () => {
          const key = (s.apiKeyDraft || "").trim();
          const model = (s.modelDraft || "").trim() || DEFAULT_MODEL;
          try { localStorage.setItem("itin-or-key", key); localStorage.setItem("itin-or-model", model); } catch (err) {}
          this.setState({ apiKey: key, model, settingsOpen: false, modelMenuOpen: false });
        },
        clearKey: () => {
          try { localStorage.removeItem("itin-or-key"); } catch (err) {}
          this.setState({ apiKey: "", apiKeyDraft: "", settingsOpen: false });
        },

        smartOpen: s.smartOpen,
        smartText: s.smartText,
        smartNote: s.smartNote,
        smartError: s.smartError,
        showError: !!s.smartError && !s.smartBusy,
        smartStatus: s.smartBusy ? "Reading…" : (s.actions ? "Review the proposed changes" : ""),
        smartBusy: s.smartBusy,
        hasActions: !!(s.actions && s.actions.length),
        noActions: !(s.actions && s.actions.length),
        runLabel: "Extract changes",
        rerunLabel: "Run again with this note",
        applyLabel: "Apply " + (s.actions ? s.actions.length : 0) + " change" + (s.actions && s.actions.length === 1 ? "" : "s"),
        openSmart: () => this.setState({ smartOpen: true, smartError: "", actions: null, smartText: "", smartNote: "" }),
        closeSmart: () => this.setState({ smartOpen: false, actions: null, smartError: "", smartText: "", smartNote: "" }),
        onSmartText: ev => this.setState({ smartText: ev.target.value }),
        onSmartNote: ev => this.setState({ smartNote: ev.target.value }),
        runSmart: () => this.runSmart(),
        reprocess: () => this.runSmart(),
        applyActions: () => this.applyActions(),
        actionRows: (s.actions || []).map(a => {
          const d = this.describeAction(a);
          const editable = a.kind === "add" || a.kind === "update" || a.kind === "people";
          const src = a.kind === "update" ? (a.fields || {}) : (a.entry || {});
          const type = src.type || (this.state.entries.filter(e => e.id === a.id)[0] || {}).type || "note";
          const tone = a.kind === "delete" ? "var(--danger)" : "var(--accent)";
          const chosen = this.actionPeople(a);
          return {
            aid: a.aid,
            kindLabel: a.kind === "add" ? "New item" : a.kind === "delete" ? "Remove item" : "Change item",
            tone,
            border: a.kind === "delete" ? "var(--danger)" : "var(--border)",
            bg: a.kind === "delete" ? "color-mix(in oklab, var(--danger) 8%, transparent)" : "var(--card)",
            summary: d.summary,
            detail: d.detail,
            editable,
            open: s.openAction === a.aid,
            onToggle: () => this.setState(st => ({ openAction: st.openAction === a.aid ? null : a.aid })),
            onDrop: () => this.setState(st => ({ actions: st.actions.filter(x => x.aid !== a.aid), openAction: null })),
            fields: a.kind === "people" ? [] : this.buildFields(type, src, "action:" + a.aid, (k, v) => this.patchAction(a.aid, k, v)),
            roster: [EVERYONE].concat(roster).map(n => {
              const on = chosen.indexOf(n) >= 0;
              const c = chip(n, on);
              return { name: n, fg: c.fg, bg: c.bg, border: c.border, on, off: !on, onToggle: () => this.setActionPerson(a.aid, n, !on) };
            })
          };
        }),
        closeLlm: () => this.setState({ llmOpen: false, promptCopied: false }),
        llmOpen: s.llmOpen,
        llmDocUrl: LLM_DOC,
        hasAgentKey: !!s.agentKey && !s.agentBusy,
        agentBusy: s.agentBusy,
        agentError: s.agentError,
        showAgentError: !!s.agentError && !s.agentBusy,
        agentExpiry: s.agentKey ? agentExpiryLabel(s.agentKey.expires_at) : "",
        llmPrompt: s.agentKey ? agentPromptFor(s.blobId, s.agentKey.key, s.agentKey.expires_at) : "",
        retryMint: () => this.mintKeyForAgent(),
        copyPromptLabel: s.promptCopied ? "Copied" : "Copy prompt",
        copyPrompt: () => {
          const text = s.agentKey ? agentPromptFor(s.blobId, s.agentKey.key, s.agentKey.expires_at) : "";
          if (!text) return;
          const done = () => { this.setState({ promptCopied: true }); setTimeout(() => this.setState({ promptCopied: false }), 1600); };
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
        },
        draftOpen: !!s.draft,
        draftDayLabel: s.draft && s.draft.start
          ? new Date(s.draft.start.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { timeZone:"UTC", weekday:"long", month:"long", day:"numeric", year:"numeric" })
          : "",
        draftTypes: Object.keys(SCHEMA).map(k => {
          const on = s.draft && s.draft.type === k;
          return {
            label: SCHEMA[k].label,
            hint: HINTS[k],
            fg: on ? "var(--accent)" : "var(--fg)",
            bg: on ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "transparent",
            border: on ? "var(--accent)" : "var(--border)",
            onPick: () => this.patchDraft("type", k)
          };
        }),
        draftFields: s.draft ? this.buildFields(s.draft.type, s.draft, "draft", (k, v) => this.patchDraft(k, v)) : [],
        draftRoster: s.draft ? [EVERYONE].concat(roster).map(n => {
          const on = this.splitPeople(s.draft).indexOf(n) >= 0;
          const c = chip(n, on);
          return { name: n, fg: c.fg, bg: c.bg, border: c.border, on, off: !on, onToggle: () => this.setDraftPerson(n, !on) };
        }) : [],
        onDraftNewPerson: ev => { if (ev.key === "Enter") { ev.preventDefault(); this.addPerson("draft", ev.target.value); } },
        closeDraft: () => this.setState({ draft: null, newPerson: "" }),
        commitDraft: () => {
          const d = this.state.draft;
          if (!d) return;
          this.mutate(st => ({ entries: st.entries.concat([d]), draft: null, newPerson: "", openId: null }));
        },
        typeMenuOpen: s.typeMenuOpen,
        toggleTypeMenu: () => this.setState(st => ({ typeMenuOpen: !st.typeMenuOpen })),
        closeTypeMenu: () => this.setState({ typeMenuOpen: false }),
        /* No noun: "Everything" and "Nothing" say it without needing a word
           for what an entry is, and the counts keep the width steady. */
        typeFilterLabel: (() => {
          const shown = TYPES.filter(t => hiddenTypes.indexOf(t) < 0);
          if (shown.length === TYPES.length) return "Everything";
          if (!shown.length) return "Nothing";
          return shown.length + " of " + TYPES.length;
        })(),
        typeFiltered: hiddenTypes.length > 0,
        typeOptions: TYPES.map(t => {
          const on = hiddenTypes.indexOf(t) < 0;
          return {
            label: TYPE_PLURALS[t],
            count: s.entries.filter(e => e.type === t).length,
            isFlight: t === "flight",
            isTransit: t === "transit",
            isDrive: t === "drive",
            isLodging: t === "lodging",
            isBooking: t === "booking",
            isNote: t === "note",
            on,
            off: !on,
            fg: on ? "var(--fg)" : "var(--muted)",
            onToggle: () => this.setState(st => {
              const h = st.hiddenTypes || [];
              return { hiddenTypes: h.indexOf(t) < 0 ? h.concat([t]) : h.filter(x => x !== t) };
            })
          };
        }),
        showAllTypes: () => this.setState({ hiddenTypes: [] }),
        showNoTypes: () => this.setState({ hiddenTypes: TYPES.slice() }),
        peopleFilters: roster.map(n => ({
          name: n,
          fg: chip(n, visible(n)).fg,
          bg: chip(n, visible(n)).bg,
          border: chip(n, visible(n)).border,
          onToggle: () => this.setState(st => {
            const h = st.hiddenPeople || [];
            return { hiddenPeople: h.indexOf(n) < 0 ? h.concat([n]) : h.filter(x => x !== n) };
          })
        })),
        title: s.title,
        subtitle: s.loadError ? "" : subtitle,
        days,
        editing: s.editing,
        notEditing: !s.editing,
        isEmpty: s.entries.length === 0,
        tzModeLabel: s.tzMode === "local" ? "Local time at each stop" : zoneLabelFor(s.tzMode),
        openTzMode: ev => this.openZoneChooser(ev.currentTarget, true, id => this.mutate({ tzMode: id })),
        themeIcon: s.theme === "dark" ? "☀" : "☾",
        canEdit: s.canEdit,
        saveNote: SAVE_NOTES[s.saveState] || "",
        showSaveNote: !!SAVE_NOTES[s.saveState],
        showSaveError: s.saveState === "error",
        saveError: s.saveError,
        retrySave: () => this.saveNow(),
        showLoadError: !!s.loadError,
        loadError: s.loadError,
        editLabel: s.editing ? "Done" : "Edit",
        editBg: s.editing ? "var(--accent)" : "var(--card)",
        editFg: s.editing ? "var(--bg)" : "var(--fg)",
        editBorder: s.editing ? "var(--accent)" : "var(--border)",
        editWeight: s.editing ? 600 : 400,
        copyLabel: s.copied ? "Link copied" : "Share",
        onTitle: ev => this.mutate({ title: ev.target.value }),
        toggleEdit: () => this.setState(st => {
          if (!st.canEdit) return null;
          const editing = !st.editing;
          if (st.blobId) history.replaceState(null, "", tripPath(st.blobId, editing));
          return { editing, openId: null };
        }),
        toggleTheme: () => this.mutate(st => ({ theme: st.theme === "dark" ? "light" : "dark" })),
        doPrint: () => window.print(),
        /* Flush first: an unsaved draft has no id yet, and a link without one
           would carry nothing. */
        copyLink: () => {
          this.saveNow(true).then(() => {
            const url = location.href;
            const text = "Look at my itinerary for " + (this.state.title || "our trip");
            const copied = () => { this.setState({ copied: true }); setTimeout(() => this.setState({ copied: false }), 1800); };
            const canShare = typeof navigator !== "undefined" && navigator.share
              && (!navigator.canShare || navigator.canShare({ text: text + "\n\n" + url }));
            if (canShare) {
              navigator.share({ title: this.state.title || "Itinerary", text: text + "\n\n" + url }).catch(() => {});
              return;
            }
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(copied, copied); else copied();
          });
        },
      };
    }
  }

  DC.mount(
    document.getElementById("itin-template"),
    document.getElementById("itin-root"),
    Component
  );
})();
