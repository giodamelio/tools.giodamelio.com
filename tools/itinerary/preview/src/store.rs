use serde::Deserialize;
use worker::{D1Database, Result};

/// One trip, summarised by SQLite so the Worker never decodes the whole document. A 100 KB trip costs a
/// few milliseconds of CPU to parse in the Worker; `json_each` runs on D1's side instead.
///
/// `title`, `roster` and the entries' `type`, `start`, `end`, `from` and `to` are the trip document's
/// shape, defined by `TripDoc` in `tools/itinerary/src/types.ts`. Change these queries with it.
#[derive(Deserialize)]
pub struct TripRow {
    pub title: Option<String>,
    /// JSON text, an array of names.
    pub roster: Option<String>,
    /// `YYYY-MM-DD`, from the earliest entry start.
    pub first_day: Option<String>,
    /// `YYYY-MM-DD`, from the latest entry end, or start where an entry has no end.
    pub last_day: Option<String>,
    /// JSON text, an array of `[type, from, to, operator, service]` for every flight, transit and drive,
    /// ordered by start. Only the card query selects it.
    #[serde(default)]
    pub legs: Option<String>,
    pub updated_at: String,
}

/// The `YYYY-MM-DD` that starts an entry's `YYYY-MM-DDTHH:MM`.
macro_rules! date_glob {
    () => {
        "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*"
    };
}

macro_rules! trip_query {
    ($($extra:literal)?) => {
        concat!(
            "SELECT json_extract(b.data, '$.title') AS title, ",
            "json_extract(b.data, '$.roster') AS roster, ",
            // Only values shaped like dates count, so one malformed entry cannot hide the trip's dates.
            "min(CASE WHEN e.value ->> 'start' GLOB '", date_glob!(), "' ",
            "THEN substr(e.value ->> 'start', 1, 10) END) AS first_day, ",
            "max(CASE WHEN coalesce(e.value ->> 'end', e.value ->> 'start') GLOB '", date_glob!(), "' ",
            "THEN substr(coalesce(e.value ->> 'end', e.value ->> 'start'), 1, 10) END) AS last_day, ",
            $($extra,)?
            "b.updated_at AS updated_at ",
            "FROM blobs AS b ",
            // LEFT JOIN, so a trip with no entries still returns its row.
            "LEFT JOIN json_each(b.data, '$.entries') AS e ON true ",
            // The same filter as getBlob in worker/keeper-of-state/store.js.
            "WHERE b.id = ?1 AND b.app = 'itinerary' AND b.deleted_at IS NULL ",
            "GROUP BY b.id"
        )
    };
}

/// For the page's tags, on every trip page view: the entries are scanned once.
const META: &str = trip_query!();

/// For the card, only on a cache miss: a second scan collects the legs. `json_group_array` keeps the
/// subquery's order.
const CARD: &str = trip_query!(
    "(SELECT json_group_array(json_array(leg.value ->> 'type', leg.value ->> 'from', leg.value ->> 'to', \
                                         leg.value ->> 'operator', leg.value ->> 'service')) \
     FROM (SELECT value FROM json_each(b.data, '$.entries') \
           WHERE value ->> 'type' IN ('flight', 'transit', 'drive') \
           ORDER BY value ->> 'start') AS leg) AS legs, "
);

pub async fn meta(db: &D1Database, id: &str) -> Result<Option<TripRow>> {
    db.prepare(META).bind(&[id.into()])?.first(None).await
}

pub async fn card(db: &D1Database, id: &str) -> Result<Option<TripRow>> {
    db.prepare(CARD).bind(&[id.into()])?.first(None).await
}
