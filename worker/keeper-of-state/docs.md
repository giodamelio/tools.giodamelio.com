# Keeper of State

A JSON blob store behind the small tools on tools.giodamelio.com. One blob is one JSON
object. Each blob lives under an app namespace and an unguessable 14-character id.

    https://tools.giodamelio.com/api/keeper-of-state

Anyone holding the id can read the blob; there is no read authentication at all. Writing
needs a key. The store is Cloudflare D1 behind a Worker, and request bodies cap at 100 KB.

## Start here if you were handed a key

Someone gave you an app, an id, and a key so you could edit their data. The short version:

1. `GET /{app}/{id}` to read the current object. Read before you write — you need the
   existing arrays to change them.
2. `PATCH /{app}/{id}` to write, with `Authorization: Bearer <key>` and
   `Content-Type: application/json`. Never `PUT` — see [Merge changes into a
   blob](#merge-changes-into-a-blob).
3. `DELETE /{app}/{id}/keys/self` when you are done, to retire your key.

Your key is almost certainly temporary and expires on a clock you were told about. Errors
come back as `{"error": "<code>", "message": "..."}` — branch on `error` and stop rather
than retrying blindly.

## Routes

| Method   | Path                    | Auth      | Success                                   |
|----------|-------------------------|-----------|-------------------------------------------|
| `GET`    | `/`                     | none      | `200` discovery links                     |
| `GET`    | `/openapi.yaml`         | none      | `200` the OpenAPI 3.1 spec                |
| `GET`    | `/docs.md`              | none      | `200` this document                       |
| `POST`   | `/{app}`                | none      | `201` `{ id, edit_key, url, created_at }` |
| `GET`    | `/{app}/{id}`           | none      | `200` the stored object                   |
| `PUT`    | `/{app}/{id}`           | any key   | `204`                                     |
| `PATCH`  | `/{app}/{id}`           | any key   | `200` the merged object                   |
| `DELETE` | `/{app}/{id}`           | owner key | `204`                                     |
| `POST`   | `/{app}/{id}/keys`      | owner key | `201` `{ key, expires_at }`               |
| `DELETE` | `/{app}/{id}/keys/self` | that key  | `204`                                     |

`GET`, `PUT`, and `PATCH` on a blob all return a `Last-Modified` header.

## Authenticate

Send the key as a bearer token:

    Authorization: Bearer 9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62

Keys are UUIDs. There is no query-string form and there never will be — query strings
end up in server logs, `Referer` headers, and browser history, and a leaked write key
cannot be rotated out of a blob you no longer control.

Two kinds of key exist.

An **owner key** comes back exactly once, from the create call. It never expires. It can
read, replace, merge, delete the blob, and mint temporary keys. It cannot revoke itself.

A **temporary key** is minted by an owner key with an `expires_in` lifetime, capped at
86400 seconds. It can read, replace, merge, and revoke itself. It cannot delete the blob
and cannot mint more keys.

Owner keys are deliberately unable to self-revoke. Nothing lists the keys on a blob and
nothing recovers a lost one, so a self-revoking owner key would leave the blob readable
forever and writable by nobody.

## Name an app

App namespaces match `^[a-z0-9-]{1,32}$`. One per tool, stable forever; it is part of every
URL handed out. `openapi.yaml` and `docs.md` are reserved.

Ids are 14 characters drawn from `23456789bcdfghjkmnpqrstvwxz`. There are no vowels, so
an id never spells a word, and no `0`, `1`, or `l`, so nobody mistypes one off a screen.

## Discover the endpoints

```sh
curl https://tools.giodamelio.com/api/keeper-of-state/
```

```json
{
  "docs": "https://tools.giodamelio.com/api/keeper-of-state/docs.md",
  "openapi": "https://tools.giodamelio.com/api/keeper-of-state/openapi.yaml"
}
```

`GET /docs.md` returns this document as `text/markdown`. `GET /openapi.yaml` returns the
OpenAPI 3.1 description of every route below. Both are unauthenticated, so an agent can
bootstrap itself from the base URL alone.

## Create a blob

`POST /{app}` with the initial object as the body. No key is needed to create.

```sh
curl -X POST https://tools.giodamelio.com/api/keeper-of-state/itinerary \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Lisbon, October",
    "travelers": ["Gio", "Kirsten"],
    "entries": [
      {
        "type": "flight",
        "operator": "TAP Air Portugal",
        "service": "TP204",
        "from": "EWR",
        "to": "LIS",
        "start": "2026-10-03T21:15:00-04:00"
      }
    ]
  }'
```

`201 Created`, with `Location: /api/keeper-of-state/itinerary/k7m3qxbn9fd2rt`:

```json
{
  "id": "k7m3qxbn9fd2rt",
  "edit_key": "9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62",
  "url": "https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt",
  "created_at": "2026-08-08T17:04:22Z"
}
```

Store `edit_key` before you do anything else. It is not retrievable later, and without it
the blob is frozen as read-only for good.

The body must be a JSON object. An array, a string, or a number is rejected with
`not_an_object`. Creation is rate limited to 20 per minute per IP.

## Read a blob

`GET /{app}/{id}` needs no key. The response is the stored object verbatim.

```sh
curl https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt
```

```json
{
  "title": "Lisbon, October",
  "travelers": ["Gio", "Kirsten"],
  "entries": [
    {
      "type": "flight",
      "operator": "TAP Air Portugal",
      "service": "TP204",
      "from": "EWR",
      "to": "LIS",
      "start": "2026-10-03T21:15:00-04:00"
    }
  ]
}
```

`Last-Modified: Sat, 08 Aug 2026 17:04:22 GMT` comes back with it. Nothing consumes an
`If-Modified-Since` or `If-Unmodified-Since` on the way in — the header is there to tell
you how stale your copy is, not to gate a write.

## Replace a blob

`PUT /{app}/{id}` overwrites the whole object. Any key works.

```sh
curl -X PUT https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt \
  -H 'Authorization: Bearer 9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Lisbon, October",
    "travelers": ["Gio", "Kirsten"],
    "notes": null,
    "entries": []
  }'
```

`204 No Content`, with a fresh `Last-Modified`. Reach for `PUT` only when you hold the
entire document in hand, and when you need to store an explicit `null` — `PATCH` cannot.
Reconstructing a document from what you remember silently drops every field you never
read, so if you arrived here with a key from someone else, use `PATCH`.

## Merge changes into a blob

`PATCH /{app}/{id}` applies an RFC 7386 JSON merge patch and returns the merged object.
Any key works. It touches only the keys you send, which is what makes it safe to write to
a document you did not author.

Set `Content-Type` to `application/json` or `application/merge-patch+json`, or leave it
off entirely. Anything else is `415 unsupported_media_type`. A missing content-type is
tolerated, but a wrong one is not — and `fetch(url, {method: "PATCH", body:
JSON.stringify(x)})` with no headers sends `text/plain;charset=UTF-8`, which fails. Send
the header explicitly from a browser.

```sh
curl -X PATCH https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt \
  -H 'Authorization: Bearer 9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Lisbon and Porto, October", "hotel": "Casa Amora"}'
```

```json
{
  "title": "Lisbon and Porto, October",
  "travelers": ["Gio", "Kirsten"],
  "notes": null,
  "entries": [],
  "hotel": "Casa Amora"
}
```

Two merge-patch behaviours bite people, so read them twice.

**A `null` deletes the key.** `{"hotel": null}` removes `hotel` entirely. There is no way
to write an explicit `null` through `PATCH`; use `PUT` for that.

**Arrays are replaced whole.** `{"travelers": ["Gio"]}` sets the list to exactly
`["Gio"]`. Merge patch has no element-wise semantics, no append, and no index addressing.
Read the array, change it in your own code, and send the full replacement.

There is no conflict detection anywhere in this API — no ETags, no `If-Match`, no revision
numbers. Last write wins, silently. Read immediately before you write, keep your edits
close together, and assume nobody else is holding the document open while you work.

## Mint a temporary key

`POST /{app}/{id}/keys` with an owner key. `expires_in` is the lifetime in seconds.

```sh
curl -X POST https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt/keys \
  -H 'Authorization: Bearer 9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62' \
  -H 'Content-Type: application/json' \
  -d '{"expires_in": 3600}'
```

```json
{
  "key": "4c1de907-8b52-4a3f-bd16-2e7fa9c05d84",
  "expires_at": "2026-08-08T18:04:22Z"
}
```

`expires_in` is required and must be an integer between 1 and 86400. Absent, non-integer,
zero, negative, or over the cap all return `400 bad_request`. There is no default and
nothing is clamped — ask for a lifetime you can justify.

The new key can read, `PUT`, and `PATCH`. It gets `403 forbidden` on `DELETE /{app}/{id}`
and on `POST /{app}/{id}/keys`. Mint one per collaborator so you can reason about who
still holds what.

## Revoke your own key

`DELETE /{app}/{id}/keys/self` retires whatever key you authenticated with. Owner keys
get `403 forbidden` here; temporary keys get `204 No Content`.

```sh
curl -X DELETE \
  https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt/keys/self \
  -H 'Authorization: Bearer 4c1de907-8b52-4a3f-bd16-2e7fa9c05d84'
```

Self-revoke is idempotent. A key the store recognises returns `204` even if it was
already revoked, or already expired. A client that retries on a dropped connection never
sees a spurious failure, so "revoke when done" is safe to wire into a `finally` block.

Revoking is the real hygiene, not the expiry. The moment your task is done the key should
stop working; the lifetime you were given is only a backstop for the case where you crash
or get interrupted.

## Delete a blob

`DELETE /{app}/{id}` needs the owner key.

```sh
curl -X DELETE https://tools.giodamelio.com/api/keeper-of-state/itinerary/k7m3qxbn9fd2rt \
  -H 'Authorization: Bearer 9f2c7a51-3d84-4b6e-9c0a-71e5d8f43b62'
```

`204 No Content`. The row is soft-deleted server-side, but from the caller's side it is
gone for good: every later read, write, and key operation on that id returns `404
not_found`. The id is never reissued. There is no undelete, so take a copy first if you
might want one.

## Read the errors

Every failure returns the same shape:

```json
{
  "error": "key_expired",
  "message": "This key expired at 2026-08-08T18:04:22Z."
}
```

Branch on `error`. The `message` is for humans and may change.

| Code                     | Status | Meaning                                                          |
|--------------------------|--------|------------------------------------------------------------------|
| `invalid_app`            | 400    | App namespace fails `^[a-z0-9-]{1,32}$` or is reserved           |
| `invalid_json`           | 400    | Body did not parse as JSON                                       |
| `not_an_object`          | 400    | Body parsed, but is an array, string, number, boolean, or null   |
| `bad_request`            | 400    | Malformed request otherwise — a bad `expires_in`, a malformed id |
| `missing_key`            | 401    | No `Authorization: Bearer` header on a route that needs one      |
| `unknown_key`            | 401    | Key is not a key for any blob                                    |
| `key_expired`            | 401    | Temporary key is past its lifetime                               |
| `key_revoked`            | 401    | Key was revoked through `DELETE /keys/self`                      |
| `forbidden`              | 403    | Key is valid but not allowed to do this                          |
| `not_found`              | 404    | No such blob, or it was deleted                                  |
| `method_not_allowed`     | 405    | Right path shape, wrong method — see the `Allow` header          |
| `too_large`              | 413    | Request body exceeds 100 KB                                      |
| `unsupported_media_type` | 415    | `PATCH` sent a `Content-Type` that is not a JSON one             |
| `rate_limited`           | 429    | More than 20 creates in a minute from this IP                    |

`forbidden` covers three cases: a temporary key trying to delete the blob, a temporary
key trying to mint another key, and a valid key used against a blob it does not belong
to. That last one is `forbidden` rather than `not_found`, so a wrong-blob mistake looks
different from a deleted blob.

`method_not_allowed` carries an `Allow` header listing what the path does accept, which
is the fastest way to spot a `PUT` aimed at `/keys` or a `POST` aimed at a blob.

`too_large` is measured on the request body only, never on the stored result. A small
`PATCH` against a blob already near the limit succeeds and leaves the stored object above
100 KB. Nothing rejects it and nothing trims it, so watch the size of what you store, not
just the size of what you send.
