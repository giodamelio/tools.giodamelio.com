use serde_json::Value;

use crate::route::Route;
use crate::store::TripRow;

/// Everything the card and the page's tags say about a trip, before anything is fitted to a width.
pub struct Summary {
    pub title: String,
    pub dates: Option<String>,
    pub route: Route,
    /// In the order `alphabetical` gives.
    pub people: Vec<String>,
    /// The trip's URL without its scheme, as printed on the card.
    pub link: String,
}

impl Summary {
    /// The trip document is editable by anyone holding a key, agents included, so a field with the wrong
    /// shape leaves its line off the card rather than failing the whole preview.
    pub fn from_row(row: &TripRow, link: String) -> Summary {
        let title = row.title.as_deref().map(str::trim).unwrap_or_default();
        Summary {
            title: if title.is_empty() { "Untitled trip".to_string() } else { title.to_string() },
            dates: match (row.first_day.as_deref(), row.last_day.as_deref()) {
                (Some(first), Some(last)) => date_range(first, last),
                _ => None,
            },
            route: Route::from_legs(row.legs.as_deref()),
            people: alphabetical(strings(row.roster.as_deref())),
            link,
        }
    }

    /// The dates and the travelers, for `og:description`, or `None` when the trip has neither.
    pub fn description(&self) -> Option<String> {
        let people = (!self.people.is_empty()).then(|| listed(&self.people, 0));
        let parts: Vec<String> = self.dates.iter().cloned().chain(people).collect();
        (!parts.is_empty()).then(|| parts.join(" · "))
    }
}

/// Names in alphabetical order, ignoring case and the accents of Latin letters, so Ægir sorts with the
/// A names and Ólafur with the O names rather than after Z.
pub fn alphabetical(mut names: Vec<String>) -> Vec<String> {
    names.sort_by_cached_key(|name| name.chars().flat_map(fold).collect::<String>());
    names
}

/// A letter's lowercase base form, for sorting.
fn fold(c: char) -> impl Iterator<Item = char> {
    let base = match c.to_lowercase().next().unwrap_or(c) {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => "a",
        'æ' => "ae",
        'ç' | 'ć' | 'ĉ' | 'ċ' | 'č' => "c",
        'ď' | 'đ' | 'ð' => "d",
        'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ĕ' | 'ė' | 'ę' | 'ě' => "e",
        'ĝ' | 'ğ' | 'ġ' | 'ģ' => "g",
        'ĥ' | 'ħ' => "h",
        'ì' | 'í' | 'î' | 'ï' | 'ĩ' | 'ī' | 'ĭ' | 'į' | 'ı' => "i",
        'ĵ' => "j",
        'ķ' => "k",
        'ĺ' | 'ļ' | 'ľ' | 'ŀ' | 'ł' => "l",
        'ñ' | 'ń' | 'ņ' | 'ň' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ŏ' | 'ő' => "o",
        'œ' => "oe",
        'ŕ' | 'ŗ' | 'ř' => "r",
        'ś' | 'ŝ' | 'ş' | 'š' => "s",
        'ß' => "ss",
        'ţ' | 'ť' | 'ŧ' => "t",
        'þ' => "th",
        'ù' | 'ú' | 'û' | 'ü' | 'ũ' | 'ū' | 'ŭ' | 'ů' | 'ű' | 'ų' => "u",
        'ŵ' => "w",
        'ý' | 'ÿ' | 'ŷ' => "y",
        'ź' | 'ż' | 'ž' => "z",
        lower => return Folded::One(Some(lower)),
    };
    Folded::Many(base.chars())
}

enum Folded {
    One(Option<char>),
    Many(std::str::Chars<'static>),
}

impl Iterator for Folded {
    type Item = char;
    fn next(&mut self) -> Option<char> {
        match self {
            Folded::One(c) => c.take(),
            Folded::Many(chars) => chars.next(),
        }
    }
}

/// The non-empty strings in a JSON array; anything else reads as no strings.
fn strings(json: Option<&str>) -> Vec<String> {
    let Some(Value::Array(items)) = json.and_then(|j| serde_json::from_str(j).ok()) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// `Alex`, `Alex and Sam`, `Alex, Gio and Sam`, or with `others` more: `Alex, Gio and 3 others`.
pub fn listed<S: AsRef<str>>(names: &[S], others: usize) -> String {
    let names: Vec<&str> = names.iter().map(AsRef::as_ref).collect();
    match (names.as_slice(), others) {
        ([], 0) => String::new(),
        ([], 1) => "1 other".to_string(),
        ([], n) => format!("{n} others"),
        ([only], 0) => only.to_string(),
        ([rest @ .., last], 0) => format!("{} and {last}", rest.join(", ")),
        (names, 1) => format!("{} and 1 other", names.join(", ")),
        (names, n) => format!("{} and {n} others", names.join(", ")),
    }
}

const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

#[derive(Clone, Copy, PartialEq)]
struct Day {
    year: i64,
    month: usize,
    day: i64,
}

impl Day {
    fn parse(text: &str) -> Option<Day> {
        let bytes = text.as_bytes();
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        let number = |range: std::ops::Range<usize>| -> Option<i64> {
            let part = &text[range];
            part.bytes().all(|b| b.is_ascii_digit()).then(|| part.parse().ok())?
        };
        let (year, month, day) = (number(0..4)?, number(5..7)?, number(8..10)?);
        ((1..=12).contains(&month) && (1..=31).contains(&day)).then_some(Day { year, month: month as usize, day })
    }

    /// Days since 1970-01-01, by Howard Hinnant's days_from_civil.
    fn number(self) -> i64 {
        let year = if self.month <= 2 { self.year - 1 } else { self.year };
        let era = year.div_euclid(400);
        let year_of_era = year - era * 400;
        let shifted_month = (self.month as i64 + 9) % 12;
        let day_of_year = (153 * shifted_month + 2) / 5 + self.day - 1;
        era * 146_097 + year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year - 719_468
    }

    fn month_name(self) -> &'static str {
        MONTHS[self.month - 1]
    }
}

/// `Jul 11 – 18, 2026 · 8 days`, `Oct 28 – Nov 14, 2026 · 18 days`, `Dec 30, 2026 – Jan 2, 2027 · 4 days`,
/// or `Jul 11, 2026 · 1 day`. The days are wall-clock dates at each entry's own place, so no time zone
/// arithmetic applies.
fn date_range(first: &str, last: &str) -> Option<String> {
    let (a, b) = (Day::parse(first)?, Day::parse(last)?);
    let days = b.number() - a.number() + 1;
    if days < 1 {
        return None;
    }
    let span = if a == b {
        format!("{} {}, {}", a.month_name(), a.day, a.year)
    } else if a.year != b.year {
        format!("{} {}, {} – {} {}, {}", a.month_name(), a.day, a.year, b.month_name(), b.day, b.year)
    } else if a.month != b.month {
        format!("{} {} – {} {}, {}", a.month_name(), a.day, b.month_name(), b.day, b.year)
    } else {
        format!("{} {} – {}, {}", a.month_name(), a.day, b.day, b.year)
    };
    let unit = if days == 1 { "day" } else { "days" };
    Some(format!("{span} · {days} {unit}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(title: Option<&str>, roster: Option<&str>, days: Option<(&str, &str)>, legs: Option<&str>) -> TripRow {
        TripRow {
            title: title.map(str::to_string),
            roster: roster.map(str::to_string),
            first_day: days.map(|d| d.0.to_string()),
            last_day: days.map(|d| d.1.to_string()),
            legs: legs.map(str::to_string),
            updated_at: "2026-10-05T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn date_ranges() {
        assert_eq!(date_range("2026-07-11", "2026-07-18").unwrap(), "Jul 11 – 18, 2026 · 8 days");
        assert_eq!(date_range("2026-10-28", "2026-11-14").unwrap(), "Oct 28 – Nov 14, 2026 · 18 days");
        assert_eq!(date_range("2026-12-30", "2027-01-02").unwrap(), "Dec 30, 2026 – Jan 2, 2027 · 4 days");
        assert_eq!(date_range("2026-07-11", "2026-07-11").unwrap(), "Jul 11, 2026 · 1 day");
        assert_eq!(date_range("2028-02-28", "2028-03-01").unwrap(), "Feb 28 – Mar 1, 2028 · 3 days");
    }

    #[test]
    fn malformed_dates_leave_the_line_off() {
        assert_eq!(date_range("2026-7-11", "2026-07-18"), None);
        assert_eq!(date_range("2026-13-01", "2026-13-02"), None);
        assert_eq!(date_range("2026-07-18", "2026-07-11"), None);
    }

    #[test]
    fn people_are_sorted_ignoring_case() {
        let summary = Summary::from_row(&row(Some("T"), Some(r#"["sam","Alex","Gio",""]"#), None, None), String::new());
        assert_eq!(summary.people, ["Alex", "Gio", "sam"]);
    }

    #[test]
    fn accented_names_sort_with_their_base_letter() {
        let names = ["Zoë", "Ólafur", "chloé", "Ægir", "Oscar", "Ada"].map(str::to_string).to_vec();
        assert_eq!(alphabetical(names), ["Ada", "Ægir", "chloé", "Ólafur", "Oscar", "Zoë"]);
    }

    #[test]
    fn listing_names() {
        assert_eq!(listed(&["Alex"], 0), "Alex");
        assert_eq!(listed(&["Alex", "Sam"], 0), "Alex and Sam");
        assert_eq!(listed(&["Alex", "Gio", "Sam"], 0), "Alex, Gio and Sam");
        assert_eq!(listed(&["Alex", "Gio"], 1), "Alex, Gio and 1 other");
        assert_eq!(listed(&["Alex"], 5), "Alex and 5 others");
        assert_eq!(listed::<&str>(&[], 0), "");
    }

    #[test]
    fn empty_trip() {
        let summary = Summary::from_row(&row(Some("  "), Some("[]"), None, Some("[]")), "x".to_string());
        assert_eq!(summary.title, "Untitled trip");
        assert_eq!(summary.dates, None);
        assert!(summary.route.stops.is_empty() && summary.people.is_empty());
        assert_eq!(summary.description(), None);
    }

    #[test]
    fn description_joins_dates_and_people() {
        let summary = Summary::from_row(
            &row(Some("T"), Some(r#"["Sam","Alex"]"#), Some(("2026-07-11", "2026-07-18")), None),
            String::new(),
        );
        assert_eq!(summary.description().unwrap(), "Jul 11 – 18, 2026 · 8 days · Alex and Sam");
    }
}
