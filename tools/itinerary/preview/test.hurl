# Itinerary link previews, end to end through the main worker.
#
# Needs the demo trip, so run `nix run .#keeper-seed` against a local D1 first. Then run it with
# `nix run .#preview-test`, or point it anywhere with:
#
#   hurl --test --variable base=https://tools.giodamelio.com test.hurl


# A trip page carries the tags, with a versioned card URL.

GET {{base}}/itinerary/3pwsf4hhwx5n6s
HTTP 200
[Captures]
version: regex "card\\.png\\?v=([^\"&]+)"
[Asserts]
xpath "string(//meta[@property='og:title']/@content)" == "Puerto Rico, July"
xpath "string(//meta[@property='og:description']/@content)" == "Jul 11 – 18, 2026 · 8 days · Alex and Sam"
xpath "string(//meta[@property='og:image:width']/@content)" == "1200"
xpath "string(//meta[@name='twitter:card']/@content)" == "summary_large_image"
xpath "string(//meta[@property='og:url']/@content)" endsWith "/itinerary/3pwsf4hhwx5n6s"

GET {{base}}/itinerary/3pwsf4hhwx5n6s/edit
HTTP 200
[Asserts]
xpath "string(//meta[@property='og:title']/@content)" == "Puerto Rico, July"


# The current version of the card is a PNG that never changes.

GET {{base}}/itinerary/3pwsf4hhwx5n6s/card.png?v={{version}}
HTTP 200
[Asserts]
header "content-type" == "image/png"
header "cache-control" contains "immutable"
bytes startsWith hex,89504e470d0a1a0a;


# Any other version gets the current card, cached only briefly.

GET {{base}}/itinerary/3pwsf4hhwx5n6s/card.png?v=stale
HTTP 200
[Asserts]
header "content-type" == "image/png"
header "cache-control" == "public, max-age=300"


# A trip that does not exist: the page is served without tags, and there is no card.

GET {{base}}/itinerary/2222222222222b
HTTP 200
[Asserts]
xpath "count(//meta[@property='og:title'])" == 0

GET {{base}}/itinerary/2222222222222b/card.png
HTTP 404

POST {{base}}/itinerary/3pwsf4hhwx5n6s/card.png
HTTP 405
