use serde_json::Value;

use crate::airport_data::{AIRPORT_CITIES, AIRPORT_NAMES, TRAILING_WORDS};

/// How a leg of the trip travels, drawn as an icon between two stops.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Flight,
    Train,
    Bus,
    Boat,
    Car,
}

impl Mode {
    /// The Material Symbols codepoint for this mode, in the subset preview.nix builds.
    pub fn icon(self) -> char {
        match self {
            Mode::Flight => '\u{e539}',
            Mode::Train => '\u{e570}',
            Mode::Bus => '\u{e530}',
            Mode::Boat => '\u{e532}',
            Mode::Car => '\u{e531}',
        }
    }

    pub const ALL: [Mode; 5] = [Mode::Flight, Mode::Train, Mode::Bus, Mode::Boat, Mode::Car];
}

/// The places a trip travels through, with how it gets from each to the next: `modes[i]` is the leg from
/// `stops[i]` to `stops[i + 1]`.
#[derive(Debug, Default, PartialEq)]
pub struct Route {
    pub stops: Vec<String>,
    pub modes: Vec<Mode>,
}

impl Route {
    /// From the card query's `legs`, an array of `[type, from, to, operator, service]` in start order.
    ///
    /// The route is the first leg's origin and then each leg's destination. A leg's own origin is left out
    /// after the first, so a transfer nobody entered as a leg — landing at the airport, leaving from the
    /// ferry terminal — does not show up as a stop. A stop whose name contains the one before it, or is
    /// contained by it, as whole words, is the same place: "Ceiba" after "Ceiba ferry terminal". The
    /// shorter name is kept and the leg between them dropped.
    pub fn from_legs(json: Option<&str>) -> Route {
        let Some(Value::Array(legs)) = json.and_then(|j| serde_json::from_str(j).ok()) else {
            return Route::default();
        };
        let mut route = Route::default();
        for leg in legs.iter().filter_map(Leg::parse) {
            let place = |text: &str| place(text, leg.mode);
            let Some(to) = leg.to.map(place) else { continue };
            if route.stops.is_empty() {
                match leg.from.map(place) {
                    Some(from) => route.stops.push(from),
                    None => {
                        route.stops.push(to);
                        continue;
                    }
                }
            }
            route.arrive(to, leg.mode);
        }
        route
    }

    fn arrive(&mut self, stop: String, mode: Mode) {
        let last = self.stops.last_mut().expect("a route starts with a stop");
        if same_place(last, &stop) {
            if stop.chars().count() < last.chars().count() {
                *last = stop;
            }
            return;
        }
        self.stops.push(stop);
        self.modes.push(mode);
    }
}

struct Leg<'a> {
    mode: Mode,
    from: Option<&'a str>,
    to: Option<&'a str>,
}

impl<'a> Leg<'a> {
    fn parse(value: &'a Value) -> Option<Leg<'a>> {
        let Value::Array(fields) = value else { return None };
        let field = |i: usize| fields.get(i).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty());
        let mode = match field(0)? {
            "flight" => Mode::Flight,
            "drive" => Mode::Car,
            "transit" => transit_mode([field(1), field(2), field(3), field(4)].into_iter().flatten()),
            _ => return None,
        };
        Some(Leg { mode, from: field(1), to: field(2) })
    }
}

/// Trains, buses and ferries share the transit type. A leg that says "ferry", "ferries" or "boat" anywhere in its
/// places, operator or service is a boat, one that says "bus" is a bus, and anything else is a train.
fn transit_mode<'a>(texts: impl Iterator<Item = &'a str>) -> Mode {
    let mut mode = Mode::Train;
    for word in texts.flat_map(words) {
        match word.to_lowercase().as_str() {
            "ferry" | "ferries" | "boat" => return Mode::Boat,
            "bus" => mode = Mode::Bus,
            _ => {}
        }
    }
    mode
}

fn words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|c: char| !c.is_alphanumeric()).filter(|word| !word.is_empty())
}

/// The city a place is in, when it names an airport, or the place as written.
///
/// Any leg's place may hold an airport code: a standalone word of three capital letters, so "SFO" and
/// "SFO International" are both San Francisco. A flight's place may also be an airport's name, matched
/// exactly once both lose case, apostrophes and trailing words like "International": "Chicago O'Hare" is
/// Chicago. Only flights are matched by name, so a station or terminal that shares a name with an airport
/// is left as written.
fn place(text: &str, mode: Mode) -> String {
    let by_code = || {
        words(text)
            .filter(|word| word.len() == 3 && word.bytes().all(|b| b.is_ascii_uppercase()))
            .find_map(|code| lookup(AIRPORT_CITIES, code))
    };
    let by_name = || (mode == Mode::Flight).then(|| lookup(AIRPORT_NAMES, &name_key(text))).flatten();
    by_code().or_else(by_name).unwrap_or(text).to_string()
}

fn lookup(table: &'static [(&'static str, &'static str)], key: &str) -> Option<&'static str> {
    let index = table.binary_search_by_key(&key, |&(key, _)| key).ok()?;
    Some(table[index].1)
}

/// Lowercase, without apostrophes, words joined by single spaces, and any of `TRAILING_WORDS` taken off the
/// end: the form `AIRPORT_NAMES` is keyed by, which scripts/build-airport-data.js builds the same way.
fn name_key(text: &str) -> String {
    let lower: String = text.to_lowercase().chars().filter(|c| !matches!(c, '\'' | '’')).collect();
    let mut words: Vec<&str> = words(&lower).collect();
    while words.last().is_some_and(|word| TRAILING_WORDS.contains(word)) {
        words.pop();
    }
    words.join(" ")
}

/// Whether one name's words appear, in order and side by side, within the other's, ignoring case.
fn same_place(a: &str, b: &str) -> bool {
    let a: Vec<String> = words(a).map(str::to_lowercase).collect();
    let b: Vec<String> = words(b).map(str::to_lowercase).collect();
    let (short, long) = if a.len() <= b.len() { (&a, &b) } else { (&b, &a) };
    !short.is_empty() && long.windows(short.len()).any(|window| window == short.as_slice())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(legs: &str) -> (Vec<String>, Vec<Mode>) {
        let route = Route::from_legs(Some(legs));
        (route.stops, route.modes)
    }

    #[test]
    fn demo_trip() {
        let (stops, modes) = route(
            r#"[["flight","Chicago O'Hare","San Juan","United","UA1122"],
                ["drive","Old San Juan","Ceiba ferry terminal",null,null],
                ["transit","Ceiba","Vieques","Puerto Rico Ferry","Ceiba–Vieques"],
                ["transit","Vieques","Ceiba","Puerto Rico Ferry","Vieques–Ceiba"],
                ["flight","San Juan","Chicago O'Hare","United","UA1987"]]"#,
        );
        assert_eq!(stops, ["Chicago", "San Juan", "Ceiba ferry terminal", "Vieques", "Ceiba", "Chicago"]);
        assert_eq!(modes, [Mode::Flight, Mode::Car, Mode::Boat, Mode::Boat, Mode::Flight]);
    }

    #[test]
    fn airport_codes_become_cities() {
        let (stops, modes) = route(r#"[["flight","SFO","JFK",null,null],["drive","New York","Boston",null,null]]"#);
        assert_eq!(stops, ["San Francisco", "New York", "Boston"]);
        assert_eq!(modes, [Mode::Flight, Mode::Car]);
        assert_eq!(place("SFO International", Mode::Flight), "San Francisco");
        assert_eq!(place("Helsinki HEL", Mode::Bus), "Helsinki");
        assert_eq!(place("Old San Juan", Mode::Flight), "Old San Juan");
        assert_eq!(place("ZZZ", Mode::Flight), "ZZZ");
    }

    #[test]
    fn flights_match_airport_names_exactly() {
        assert_eq!(place("Chicago O'Hare", Mode::Flight), "Chicago");
        assert_eq!(place("Chicago O’Hare International Airport", Mode::Flight), "Chicago");
        assert_eq!(place("Seattle-Tacoma", Mode::Flight), "Seattle");
        assert_eq!(place("London Heathrow", Mode::Flight), "London");
        assert_eq!(place("Heathrow", Mode::Flight), "Heathrow");
        assert_eq!(place("Chicago", Mode::Flight), "Chicago");
        assert_eq!(place("Chicago O'Hare Hilton", Mode::Flight), "Chicago O'Hare Hilton");
        assert_eq!(place("Chicago O'Hare", Mode::Train), "Chicago O'Hare");
    }

    #[test]
    fn a_contained_name_is_the_same_stop() {
        assert!(same_place("Ceiba ferry terminal", "Ceiba"));
        assert!(same_place("San Juan", "old san juan"));
        assert!(!same_place("Rome", "Romeo"));
        assert!(!same_place("San Juan", "Juan Dolio"));
        let (stops, modes) = route(r#"[["transit","Paris","Paris Gare de Lyon",null,null],["transit","Paris Gare de Lyon","Lyon",null,null]]"#);
        assert_eq!(stops, ["Paris", "Lyon"]);
        assert_eq!(modes, [Mode::Train]);
    }

    #[test]
    fn transit_modes_come_from_the_text() {
        assert_eq!(transit_mode(["Greyhound", "Bus 12"].into_iter()), Mode::Bus);
        assert_eq!(transit_mode(["BC Ferries"].into_iter()), Mode::Boat);
        assert_eq!(transit_mode(["Amtrak", "Cascades 501"].into_iter()), Mode::Train);
        assert_eq!(transit_mode(["Busan"].into_iter()), Mode::Train);
    }

    #[test]
    fn legs_without_a_destination_are_skipped() {
        let (stops, modes) = route(r#"[["flight","SEA",null,null,null],["flight",null,"PDX",null,null],["drive","Portland","Bend",null,null]]"#);
        assert_eq!(stops, ["Portland", "Bend"]);
        assert_eq!(modes, [Mode::Car]);
    }

    #[test]
    fn malformed_legs_are_ignored() {
        assert_eq!(Route::from_legs(Some(r#"{"not":"legs"}"#)), Route::default());
        assert_eq!(Route::from_legs(None), Route::default());
        let (stops, _) = route(r#"[["lodging","A","B",null,null],"junk",["flight","A","B",null,null]]"#);
        assert_eq!(stops, ["A", "B"]);
    }

    #[test]
    fn the_airport_tables_are_sorted_for_binary_search() {
        assert!(AIRPORT_CITIES.windows(2).all(|pair| pair[0].0 < pair[1].0));
        assert!(AIRPORT_NAMES.windows(2).all(|pair| pair[0].0 < pair[1].0));
    }
}
