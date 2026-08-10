# Work in this repo

## Build a tool as its own derivation

Each tool is a directory under `tools/` holding a `package.nix`. It builds however it likes, with
whatever dependencies it likes, and nothing outside it knows or cares which. `nix/packages.nix`
discovers tools by reading the directory, so adding one means creating a directory — no list to
update anywhere.

A tool's `package.nix` takes `{ basePath, baseCss, ... }` and must:

- produce an output directory holding `index.html` and its assets, referenced **relatively**
- attach `passthru.tool = { name; description; order; routes; }`

Keep the `...` in the argument set. Every tool is called with the same arguments and takes only what it
needs; `tools/itinerary/package.nix` ignores `baseCss` and styles itself.

"However it likes" includes a real build. Units copies files; the itinerary runs Vite over a Vue 3 app
and is pinned by its own `package-lock.json`, which `importNpmLock` reads directly — there is no vendor
hash to keep in step with the lockfile. A tool that builds should run its typecheck and unit tests in
the same `buildPhase`, so a broken one fails `nix build` rather than only the editor. Leave linting
out: a formatting rule must not be able to block a deploy.

## Let the base tag carry the mount path

**`basePath` has exactly one consumer: the `<base href>` in `index.html`,** substituted at build time
from an `@basePath@` placeholder. Everything else in a tool is relative and resolves against it, and JS
that needs the mount path reads `document.baseURI` — see `BASE` in `tools/itinerary/src/router.ts`,
which is what the router's history base is built from.

Never hardcode a tool's own prefix. This is what lets the worker serve the itinerary page at
`/itinerary/<id>` without a relative `./assets/index.js` resolving a directory too deep. A tool built
with Vite therefore sets `base: './'`, and rewrites `@basePath@` to `/` for the dev server only.

`routes` are patterns relative to the tool's own mount, so they mean the same thing wherever it is
mounted. `nix/worker.nix` prefixes them and generates `tool-routes.js`; the worker itself knows nothing
about any particular tool.

## Put the rest in the right directory

`worker/` holds the backend Worker, one directory per API, alongside whatever that API serves — its
`docs.md` and `openapi.yaml` live next to its code. `site/` is the index page and its templates. `css/`
is the barebones shared stylesheet a tool may take or leave. `nix/` is the build. `docs/` is internal
prose, never shipped. `scripts/` holds one-off generators, which never ship either.

A generated file says so in its first line and names the command that rebuilds it. Edit the generator,
not the output.

## Render with gomplate

Anything templated goes through gomplate against a real template file, driven by a JSON context Nix
builds from `passthru.tool`. That covers `site/index.html.tmpl`, `site/index.md.tmpl` (the plain-text
index robots get at `/index.md`), and `worker/tool-routes.js.tmpl`.

gomplate uses Go's `text/template`, which does **not** auto-escape. Pipe anything interpolated into
HTML through `html`.

## Build and deploy with the flake

| Command | Does |
|---|---|
| `nix run .#serve` | builds everything and runs `wrangler dev` on port 8788 |
| `nix run .#deploy` | ships to production |
| `nix run .#deploy-preview` | uploads a preview version; set `PREVIEW_ALIAS` to name it |
| `nix run .#keeper-migrate` / `-remote` | applies D1 migrations |
| `nix run .#keeper-seed` | writes the itinerary's demo trip into the local D1 |
| `nix run .#keeper-test` | runs the Hurl suite against `KEEPER_BASE`, default localhost:8788 |
| `nix run .#zones` | refreshes `tools/itinerary/src/lib/zone-data.ts` from tzdb |

They are on `PATH` by bare name inside `nix develop`, and they expect to be run from the project root.

Wrangler runs in `worker/` against the checked-in `wrangler.jsonc`, so nothing is copied anywhere.
Two pieces are not checked in: `worker/tool-routes.js`, which `index.js` imports and both the devShell
and every wrangler script link in from the store, and the built site, which the scripts pass as
`--assets` so every run serves what the sources say now. `worker/.wrangler/` holds local D1 state between runs; deleting it
is safe, and `nix run .#keeper-migrate` builds it back.

That D1 starts empty, which is why the itinerary's "View a demo trip" link 404s locally even though
the same blob answers in production. `nix run .#keeper-seed` writes it in, after the migrations.

Nix is not the inner loop. A tool with a dev server runs it natively from its own directory — `npm run
dev` in `tools/itinerary/`, which proxies `/api` to port 8788, so run `nix run .#serve` alongside it for
the API. `nix run .#serve` on its own is how you see the whole site assembled.

## Match the JavaScript style of each side

Each tool picks its own. Units is dependency-free vanilla JS. The itinerary is Vue 3 and TypeScript:
`<script setup>`, Pinia setup stores, shared shapes in `src/styles/controls.css` and everything else in
a scoped block. Code under `worker/` is ESM because the Workers runtime requires modules.

## Use jujutsu

This repo uses jujutsu (`jj`), not git. Do not run `git commit` or `git rebase`.

## Read the Keeper of State guides

Building a tool on the Keeper of State API starts at `docs/keeper-of-state.md` — when to reach for the
store, and the conventions tools here follow.

`worker/keeper-of-state/docs.md` is the API reference itself, written for whoever calls it from the
internet. It is served at `/api/keeper-of-state/docs.md`, so edit it as public copy.
