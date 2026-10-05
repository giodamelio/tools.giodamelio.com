//! Link previews for itinerary trips: the `og:*` tags for a trip page and the 1200×630 card they point at.
//!
//! The main worker reaches this one only through its `ITINERARY_PREVIEW` service binding, with two requests:
//! `GET /meta?url=<trip page URL>` for the tags, and the card URL itself, forwarded as the visitor sent it.

mod card;
mod glyphs;
mod layout;
mod shape;
mod store;
mod summary;
mod trip_url;

use serde_json::json;
use worker::{event, Context, Env, Method, Request, Response, Result, Url};

use crate::layout::{HEIGHT, WIDTH};
use crate::trip_url::TripUrl;

pub use crate::card::{render, samples};
pub use crate::summary::Summary;

/// A card whose `v` matches the trip's current version never changes. Any other request gets the current
/// card under a short lifetime, so the main worker does not cache it.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";
const SHORT_LIVED: &str = "public, max-age=300";

#[event(start)]
fn start() {
    card::warm();
}

#[event(fetch)]
async fn fetch(request: Request, env: Env, _ctx: Context) -> Result<Response> {
    if request.method() != Method::Get {
        return Response::error("Method not allowed", 405);
    }
    let url = request.url()?;
    if url.path() == "/meta" {
        let Some(page) = url.query_pairs().find(|(key, _)| key == "url").map(|(_, value)| value.into_owned()) else {
            return Response::error("Missing url parameter", 400);
        };
        return meta(&env, &Url::parse(&page)?).await;
    }
    image(&env, &url).await
}

async fn meta(env: &Env, page: &Url) -> Result<Response> {
    let Some(trip) = TripUrl::from_page(page) else {
        return Response::error("Not a trip page", 404);
    };
    let Some(row) = store::meta(&env.d1("DB")?, &trip.id).await? else {
        return Response::error("No such trip", 404);
    };
    let summary = Summary::from_row(&row, trip.display());

    let mut tags = vec![
        json!({ "property": "og:type", "content": "website" }),
        json!({ "property": "og:title", "content": summary.title }),
        json!({ "property": "og:url", "content": trip.page() }),
        json!({ "property": "og:image", "content": trip.card(&row.updated_at) }),
        json!({ "property": "og:image:type", "content": "image/png" }),
        json!({ "property": "og:image:width", "content": WIDTH.to_string() }),
        json!({ "property": "og:image:height", "content": HEIGHT.to_string() }),
        json!({ "name": "twitter:card", "content": "summary_large_image" }),
    ];
    if let Some(description) = summary.description() {
        tags.push(json!({ "property": "og:description", "content": description }));
    }
    Response::from_json(&tags)
}

async fn image(env: &Env, url: &Url) -> Result<Response> {
    let Some(trip) = TripUrl::from_card(url) else {
        return Response::error("Not found", 404);
    };
    let Some(row) = store::card(&env.d1("DB")?, &trip.id).await? else {
        return Response::error("No such trip", 404);
    };
    let current = url.query_pairs().any(|(key, value)| key == "v" && value == row.updated_at);

    let png = card::render(&Summary::from_row(&row, trip.display()));
    let mut response = Response::from_bytes(png)?;
    let headers = response.headers_mut();
    headers.set("content-type", "image/png")?;
    headers.set("cache-control", if current { IMMUTABLE } else { SHORT_LIVED })?;
    Ok(response)
}
