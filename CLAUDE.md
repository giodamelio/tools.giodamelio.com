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

## Let the base tag carry the mount path

**`basePath` has exactly one consumer: the `<base href>` in `index.html`,** substituted at build time
from an `@basePath@` placeholder. Everything else in a tool is relative and resolves against it, and JS
that needs the mount path reads `document.baseURI` — see `BASE` in `tools/itinerary/itinerary.js`.

Never hardcode a tool's own prefix. This is what lets the worker serve the itinerary page at
`/itinerary/<id>` without a relative `./itinerary.js` resolving a directory too deep.

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
| `nix run .#keeper-test` | runs the Hurl suite against `KEEPER_BASE`, default localhost:8788 |
| `nix run .#zones` | refreshes `tools/itinerary/zone-data.js` from tzdb |

They are on `PATH` by bare name inside `nix develop`.

Wrangler cannot run from the read-only store, so these scripts sync the built worker into `.worker/`
and run there. That directory holds local D1 state between runs; deleting it is safe.

Nix is not the inner loop. A tool with a dev server runs it natively from its own directory; `nix run
.#serve` is how you see the whole site assembled.

## Match the JavaScript style of each side

Each tool picks its own. Units is dependency-free vanilla JS; the itinerary is classic scripts talking
through globals, pending a rewrite. Code under `worker/` is ESM because the Workers runtime requires
modules.

## Use jujutsu

This repo uses jujutsu (`jj`), not git. Do not run `git commit` or `git rebase`.

## Read the Keeper of State guides

Building a tool on the Keeper of State API starts at `docs/keeper-of-state.md` — when to reach for the
store, and the conventions tools here follow.

`worker/keeper-of-state/docs.md` is the API reference itself, written for whoever calls it from the
internet. It is served at `/api/keeper-of-state/docs.md`, so edit it as public copy.
