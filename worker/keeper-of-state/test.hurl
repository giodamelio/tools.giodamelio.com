# Keeper of State — full lifecycle suite.
#
# Run it with `devenv tasks run keeper:test` against a running dev server, or
# point it anywhere with:
#
#   hurl --test --variable base=https://preview.example.com test.hurl
#
# The oversize entry reads its body from oversize.json, which the keeper:test
# task generates into the devenv state directory and passes via --file-root.
# Running hurl by hand skips that step, so generate the file yourself first:
#
#   { printf '{"filler":"'; head -c 102400 /dev/zero | tr '\0' 'x'; printf '"}'; } > oversize.json


# Phase 1 — create a blob, capture the id and owner key everything else needs.

POST {{base}}/api/keeper-of-state/hurl-test
Content-Type: application/json
{
  "name": "original",
  "count": 1,
  "nested": { "kept": true }
}

HTTP 201
[Captures]
id: jsonpath "$.id"
edit_key: jsonpath "$.edit_key"
[Asserts]
header "content-type" startsWith "application/json"
jsonpath "$.id" matches /^[23456789bcdfghjkmnpqrstvwxz]+$/
jsonpath "$.id" matches /^.{14}$/
jsonpath "$.edit_key" exists
jsonpath "$.url" contains "/api/keeper-of-state/hurl-test/"
jsonpath "$.created_at" exists


# Phase 2 — read it back unauthenticated and confirm it stored what was sent.

GET {{base}}/api/keeper-of-state/hurl-test/{{id}}

HTTP 200
[Asserts]
header "content-type" == "application/json; charset=utf-8"
header "last-modified" exists
jsonpath "$.name" == "original"
jsonpath "$.count" == 1
jsonpath "$.nested.kept" == true


# Phase 3 — a well-formed id that was never issued is a 404.

GET {{base}}/api/keeper-of-state/hurl-test/bcdfghjkmnpqrs

HTTP 404
[Asserts]
jsonpath "$.error" == "not_found"
jsonpath "$.message" exists


# Phase 4 — create-time validation.

# A JSON array is valid JSON but not a JSON object.
POST {{base}}/api/keeper-of-state/hurl-test
Content-Type: application/json
[1, 2, 3]

HTTP 400
[Asserts]
jsonpath "$.error" == "not_an_object"
jsonpath "$.message" exists

# App namespaces are lowercase only.
POST {{base}}/api/keeper-of-state/Hurl-Test
Content-Type: application/json
{
  "name": "rejected"
}

HTTP 400
[Asserts]
jsonpath "$.error" == "invalid_app"
jsonpath "$.message" exists


# Phase 5 — writes need a key, and it has to be a real one.

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Content-Type: application/json
{
  "name": "no key"
}

HTTP 401
[Asserts]
jsonpath "$.error" == "missing_key"
jsonpath "$.message" exists

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer 00000000-0000-4000-8000-000000000000
Content-Type: application/json
{
  "name": "bogus key"
}

HTTP 401
[Asserts]
jsonpath "$.error" == "unknown_key"
jsonpath "$.message" exists


# Phase 6 — PUT replaces the whole document.

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}
Content-Type: application/json
{
  "name": "replaced",
  "count": 2,
  "tags": ["alpha", "beta", "gamma"],
  "profile": { "theme": "dark", "locale": "en" },
  "doomed": "delete me"
}

HTTP 204

# The replacement landed and the old top-level `nested` key is gone.
GET {{base}}/api/keeper-of-state/hurl-test/{{id}}

HTTP 200
[Asserts]
jsonpath "$.name" == "replaced"
jsonpath "$.count" == 2
jsonpath "$.profile.theme" == "dark"
jsonpath "$.doomed" == "delete me"
jsonpath "$.nested" not exists


# Phase 7 — PATCH is an RFC 7386 merge patch: nulls delete, siblings survive,
# and the merged document comes back in the response body.

PATCH {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}
Content-Type: application/merge-patch+json
{
  "profile": { "locale": "fr" },
  "doomed": null,
  "added": true
}

HTTP 200
[Asserts]
header "content-type" == "application/json; charset=utf-8"
jsonpath "$.doomed" not exists
jsonpath "$.profile.locale" == "fr"
jsonpath "$.profile.theme" == "dark"
jsonpath "$.name" == "replaced"
jsonpath "$.count" == 2
jsonpath "$.added" == true
jsonpath "$.tags" count == 3


# Phase 8 — arrays are replaced wholesale, never merged element-wise.

PATCH {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}
Content-Type: application/json
{
  "tags": ["solo"]
}

HTTP 200
[Asserts]
jsonpath "$.tags" count == 1
jsonpath "$.tags[0]" == "solo"
jsonpath "$.name" == "replaced"


# Phase 9 — the owner mints a temporary key that can write.

POST {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys
Authorization: Bearer {{edit_key}}
Content-Type: application/json
{
  "expires_in": 3600
}

HTTP 201
[Captures]
temp_key: jsonpath "$.key"
[Asserts]
header "content-type" startsWith "application/json"
jsonpath "$.key" exists
jsonpath "$.expires_at" exists
jsonpath "$.expires_at" matches /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{temp_key}}
Content-Type: application/json
{
  "name": "written by the temporary key",
  "tags": ["solo"]
}

HTTP 204


# Phase 10 — a temporary key cannot delete the blob or mint more keys, and
# even the owner cannot mint past the 86400 second cap.

DELETE {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{temp_key}}

HTTP 403
[Asserts]
jsonpath "$.error" == "forbidden"
jsonpath "$.message" exists

POST {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys
Authorization: Bearer {{temp_key}}
Content-Type: application/json
{
  "expires_in": 60
}

HTTP 403
[Asserts]
jsonpath "$.error" == "forbidden"
jsonpath "$.message" exists

POST {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys
Authorization: Bearer {{edit_key}}
Content-Type: application/json
{
  "expires_in": 86401
}

HTTP 400
[Asserts]
jsonpath "$.error" == "bad_request"
jsonpath "$.message" exists


# Phase 11 — self-revoke is idempotent, kills the key, and is closed to owners.

DELETE {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys/self
Authorization: Bearer {{temp_key}}

HTTP 204

# Revoking an already-revoked key the server still recognises is a no-op.
DELETE {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys/self
Authorization: Bearer {{temp_key}}

HTTP 204

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{temp_key}}
Content-Type: application/json
{
  "name": "revoked key"
}

HTTP 401
[Asserts]
jsonpath "$.error" == "key_revoked"
jsonpath "$.message" exists

# An owner key has no way to revoke itself.
DELETE {{base}}/api/keeper-of-state/hurl-test/{{id}}/keys/self
Authorization: Bearer {{edit_key}}

HTTP 403
[Asserts]
jsonpath "$.error" == "forbidden"
jsonpath "$.message" exists


# Phase 12 — bodies over 100 KB are rejected.

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}
Content-Type: application/json
file,oversize.json;

HTTP 413
[Asserts]
jsonpath "$.error" == "too_large"
jsonpath "$.message" exists


# Phase 13 — discovery endpoints, all unauthenticated.

GET {{base}}/api/keeper-of-state/

HTTP 200
[Asserts]
header "content-type" == "application/json; charset=utf-8"
jsonpath "$.docs" contains "/api/keeper-of-state/docs.md"
jsonpath "$.openapi" contains "/api/keeper-of-state/openapi.yaml"

GET {{base}}/api/keeper-of-state/openapi.yaml

HTTP 200
[Asserts]
header "content-type" startsWith "application/yaml"
body contains "openapi"

GET {{base}}/api/keeper-of-state/docs.md

HTTP 200
[Asserts]
header "content-type" startsWith "text/markdown"
body contains "Keeper of State"


# Phase 14 — the owner deletes the blob, and it stays gone.

DELETE {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}

HTTP 204

GET {{base}}/api/keeper-of-state/hurl-test/{{id}}

HTTP 404
[Asserts]
jsonpath "$.error" == "not_found"

PUT {{base}}/api/keeper-of-state/hurl-test/{{id}}
Authorization: Bearer {{edit_key}}
Content-Type: application/json
{
  "name": "after the delete"
}

HTTP 404
[Asserts]
jsonpath "$.error" == "not_found"
