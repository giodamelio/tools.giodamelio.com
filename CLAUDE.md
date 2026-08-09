# Work in this repo

## Put code in the right directory

`src/` holds the static tools browsers download: HTML, CSS, and plain JS. `worker/` holds the backend
Worker, one directory per API, alongside whatever that API serves — its `docs.md` and `openapi.yaml`
live next to its code. `docs/` is internal: prose for whoever works on this repo, never shipped.
Backend code never goes in `src/`.

## Build and deploy with devenv

The site is a Cloudflare Worker serving static assets, deployed with the devenv tasks (`site:publish`,
`site:publish:preview`). Run `devenv tasks list` to see the rest.

Wrangler comes from devenv, not npm. There is no `package.json` and no `node_modules`, so do not add npm
dependencies.

## Match the JavaScript style of each side

Frontend code is dependency-free vanilla JS wrapped in an IIFE. Code under `worker/` is ESM because the
Workers runtime requires modules.

## Use jujutsu

This repo uses jujutsu (`jj`), not git. Do not run `git commit` or `git rebase`.

## Read the Keeper of State guides

Building a tool on the Keeper of State API starts at `docs/keeper-of-state.md` — when to
reach for the store, and the conventions tools here follow.

`worker/keeper-of-state/docs.md` is the API reference itself, written for whoever calls it
from the internet. It is served at `/api/keeper-of-state/docs.md`, so edit it as public
copy.
