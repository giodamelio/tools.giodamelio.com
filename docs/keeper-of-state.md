# Build a tool on Keeper of State

How to decide whether a tool here should use the store, and how to wire it up once you
have. The API itself — every route, header, and error code — is documented in
`worker/keeper-of-state/docs.md`, which ships to the internet at
`/api/keeper-of-state/docs.md`. This file does not repeat it.

## Decide whether to reach for it

Reach for it when a tool needs to hand a piece of state to someone else: a link a friend
can open, a draft that survives a browser wipe, a document an agent can edit. That is the
whole brief.

Do not reach for it for anything private. The id is the only thing standing between a blob
and the world, and there is no read authentication at all. Anything a user would mind a
stranger reading does not belong here.

It is also not a database. There is no listing, no queries, and no history, so nothing
enumerates the blobs in an app or the keys on a blob. A tool that needs to show someone
"your saved things" has to keep its own index in `localStorage`, because the store cannot
answer that question.

Nothing purges either. Blobs are kept indefinitely, including soft-deleted ones, but do
not treat one as guaranteed permanent — plan for the copy in the browser to be the one
that matters.

## Pick a namespace and stick to it

One app namespace per tool, matching `^[a-z0-9-]{1,32}$`, chosen once. It is part of every
URL the tool hands out, so renaming it strands every link already in the wild.

## Keep the key out of the link

The create call returns `edit_key` exactly once. Put the id in the URL you share and the
key in `localStorage`, never the other way around. Key the storage by blob id — a user can
own several documents in the same tool, and a single `tool.key` entry breaks the moment
they open a second one:

```js
// localStorage["itin-keys"] -> { "k7m3qxbn9fd2rt": "9f2c7a51-…" }
```

A visitor holding a link but no key gets a read-only view. Decide up front what that looks
like and make it obvious, rather than letting a write fail with `missing_key` after the
user has typed something.

## Create lazily

Creating on page load means every drive-by visitor claims a blob, and creation is rate
limited to 20 per minute per IP. Create on the first real change instead, and treat an
untouched page as a local draft. Serialize the document and compare against the last saved
copy so incidental state — a theme toggle, a collapsed panel — never triggers a write.

Debounce the save and coalesce overlapping ones; a save fired per keystroke will both
hammer the API and race itself. Show the user where they stand — unsaved, saving, saved,
failed — and fail loud with the API's own `error` code, because the browser copy is the
only other copy.

## Choose PUT or PATCH by who owns the document

The tool that renders the whole document should `PUT` it. It holds every field, and a
deletion needs to actually stick.

Anything editing someone else's document should `PATCH`. That includes agents, and it is
why the handoff prompt says so twice.

## Same-origin only

There are no CORS headers. A page on tools.giodamelio.com can call the API because it is
same-origin; nothing else can. Use a root-relative URL (`/api/keeper-of-state/{app}`) so
the tool works against local dev and production without a build step.

`nix run .#serve` runs the Worker and the static assets together on `http://localhost:8788`,
so local dev is same-origin too. `nix run .#keeper-migrate` sets up the local D1 first.

## Hand a key to an agent

Mint a temporary key with the shortest lifetime the task can justify, hand the agent the
id and that key, and let it work. It can read and edit that one blob and nothing else — it
cannot delete the data and cannot mint keys for anyone else.

The prompt should carry the base URL, app, id, key, and the wall-clock time the key dies,
plus instructions to `PATCH` rather than `PUT` and to `DELETE /keys/self` when finished.
`tools/itinerary/itinerary.js` builds one; copy its shape.

Two things to tell the user, not just the agent. Last write wins, so a tool that autosaves
will overwrite whatever the agent just wrote — the page must sit still while an agent has
a live key. And nothing pushes changes back, so the page goes stale silently until it is
reloaded.
