use crate::glyphs::Rgb;
use crate::shape::{self, clusters, pen_before, total, Line, Weight};
use crate::summary::{listed, Summary};

// The itinerary's dark palette, from tools/itinerary/src/styles/tokens.css.
pub const BACKGROUND: Rgb = Rgb(0x11, 0x14, 0x18);
pub const ACCENT: Rgb = Rgb(0x6e, 0xa8, 0xff);
const FOREGROUND: Rgb = Rgb(0xe6, 0xe6, 0xe6);
const MUTED: Rgb = Rgb(0x9a, 0xa0, 0xa6);

pub const WIDTH: u32 = 1200;
pub const HEIGHT: u32 = 630;
pub const ACCENT_BAR_WIDTH: f32 = 12.0;
const MARGIN: f32 = 80.0;
const CONTENT_WIDTH: f32 = WIDTH as f32 - 2.0 * MARGIN;

const TITLE: (Weight, f32) = (Weight::Bold, 72.0);
const DATES: (Weight, f32) = (Weight::Regular, 40.0);
const ROUTE: (Weight, f32) = (Weight::Bold, 44.0);
const PEOPLE: (Weight, f32) = (Weight::Regular, 36.0);
const LINK: (Weight, f32) = (Weight::Regular, 28.0);

/// Every text style on the card, for the warm-up to rasterise ahead of time.
pub const STYLES: [(Weight, f32); 5] = [TITLE, DATES, ROUTE, PEOPLE, LINK];

const TITLE_LEADING: f32 = 82.0;
const LINE_GAP: f32 = 90.0;
const PEOPLE_GAP: f32 = 110.0;
const LINK_BASELINE: f32 = 580.0;

const ELLIPSIS: &str = "…";
const ARROW: &str = " → ";

/// More characters than any line on the card can show. Routes and rosters can run to hundreds of entries;
/// nothing past this is shaped.
const SHAPED_CHARS: usize = 120;

/// The card's text, fitted to the content width.
pub fn lines(summary: &Summary) -> Vec<Line> {
    let line = |(weight, size): (Weight, f32), baseline: f32, color: Rgb, text: String| Line {
        weight,
        size,
        x: MARGIN,
        baseline,
        align_end: false,
        color,
        text,
    };

    let title = title(&summary.title);
    // A wrapped title starts higher and pushes the rest down; the link stays at the bottom.
    let first_baseline = if title.len() == 1 { 200.0 } else { 140.0 };
    let last_title = first_baseline + TITLE_LEADING * (title.len() - 1) as f32;
    let mut lines: Vec<Line> = title
        .into_iter()
        .enumerate()
        .map(|(i, text)| line(TITLE, first_baseline + TITLE_LEADING * i as f32, FOREGROUND, text))
        .collect();

    if let Some(dates) = &summary.dates {
        lines.push(line(DATES, last_title + LINE_GAP, MUTED, truncate(DATES, dates)));
    }
    if !summary.stops.is_empty() {
        lines.push(line(ROUTE, last_title + 2.0 * LINE_GAP, ACCENT, route(&summary.stops)));
    }
    if !summary.people.is_empty() {
        lines.push(line(PEOPLE, last_title + 2.0 * LINE_GAP + PEOPLE_GAP, FOREGROUND, people(&summary.people)));
    }
    lines.push(Line {
        x: MARGIN + CONTENT_WIDTH,
        align_end: true,
        ..line(LINK, LINK_BASELINE, MUTED, truncate(LINK, &summary.link))
    });
    lines
}

/// The longest prefix of `text` that fits with an ellipsis after it, or `text` itself when it fits.
fn truncate((weight, size): (Weight, f32), text: &str) -> String {
    if shape::width(weight, size, text) <= CONTENT_WIDTH {
        return text.to_string();
    }
    let ends: Vec<usize> = text.char_indices().map(|(i, _)| i).skip(1).collect();
    let cut = |end: usize| format!("{}{ELLIPSIS}", text[..end].trim_end());
    let fits = |end: usize| shape::width(weight, size, &cut(end)) <= CONTENT_WIDTH;
    // Binary search for the most characters that fit.
    let (mut low, mut high) = (0, ends.len());
    while low < high {
        let mid = (low + high).div_ceil(2);
        if fits(ends[mid - 1]) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    cut(if low == 0 { 0 } else { ends[low - 1] })
}

/// The byte offset of the last space at which everything before it is no wider than `room`.
fn last_space_within(text: &str, clusters: &[(usize, f32)], room: f32) -> Option<usize> {
    let mut before = 0.0;
    let mut space = None;
    for &(cluster, pen) in clusters {
        if before > room {
            break;
        }
        if text[cluster..].starts_with(' ') {
            space = Some(cluster);
        }
        before = pen;
    }
    space
}

/// `text` cut after its last whole word that fits with an ellipsis, or mid-word when even the first word
/// is too wide.
fn truncate_words(style @ (weight, size): (Weight, f32), text: &str) -> String {
    let shaped = clusters(weight, size, text);
    if total(&shaped) <= CONTENT_WIDTH {
        return text.to_string();
    }
    let room = CONTENT_WIDTH - shape::width(weight, size, ELLIPSIS);
    match last_space_within(text, &shaped, room) {
        Some(at) => format!("{}{ELLIPSIS}", text[..at].trim_end()),
        None => truncate(style, text),
    }
}

/// One line, or two split at the last space that lets the first fit, with the second cut after a whole word.
fn title(text: &str) -> Vec<String> {
    let (weight, size) = TITLE;
    let shaped = clusters(weight, size, text);
    if total(&shaped) <= CONTENT_WIDTH {
        return vec![text.to_string()];
    }
    match last_space_within(text, &shaped, CONTENT_WIDTH) {
        Some(at) => vec![text[..at].to_string(), truncate_words(TITLE, text[at..].trim_start())],
        None => vec![truncate(TITLE, text)],
    }
}

/// Every stop, or as many from the start as fit followed by `… → <last stop>`.
fn route(stops: &[String]) -> String {
    let (weight, size) = ROUTE;
    let (last, rest) = stops.split_last().expect("route has at least one stop");
    if rest.is_empty() {
        return truncate(ROUTE, last);
    }

    let mut chars = last.chars().count();
    let considered = rest
        .iter()
        .take_while(|stop| {
            chars += stop.chars().count() + ARROW.chars().count();
            chars <= SHAPED_CHARS
        })
        .count()
        .max(1);
    let all_considered = considered == rest.len();
    let rest = &rest[..considered];

    let shaped_text = if all_considered { stops.join(ARROW) } else { rest.join(ARROW) };
    let shaped = clusters(weight, size, &shaped_text);
    if all_considered && total(&shaped) <= CONTENT_WIDTH {
        return shaped_text;
    }

    let tail = format!("{ARROW}{ELLIPSIS}{ARROW}{last}");
    let room = CONTENT_WIDTH - shape::width(weight, size, &tail);
    let mut end = 0;
    let mut fitting = 0;
    for (i, stop) in rest.iter().enumerate() {
        end += stop.len();
        if pen_before(&shaped, end) > room {
            break;
        }
        fitting = i + 1;
        end += ARROW.len();
    }
    match fitting {
        0 => truncate(ROUTE, &format!("{}{tail}", rest[0])),
        keep => format!("{}{tail}", rest[..keep].join(ARROW)),
    }
}

/// Everyone, or as many as fit followed by `and N others`. `people` is already in alphabetical order.
fn people(people: &[String]) -> String {
    let (weight, size) = PEOPLE;
    let everyone = listed(people, 0);
    if people.len() == 1 {
        return truncate(PEOPLE, &everyone);
    }
    if everyone.chars().count() <= SHAPED_CHARS && shape::width(weight, size, &everyone) <= CONTENT_WIDTH {
        return everyone;
    }

    let mut chars = 0;
    let considered = people
        .iter()
        .take_while(|name| {
            chars += name.chars().count() + 2;
            chars <= SHAPED_CHARS
        })
        .count()
        .clamp(1, people.len() - 1);
    let shown = &people[..considered];
    let joined = shown.join(", ");
    let shaped = clusters(weight, size, &joined);

    let mut end = 0;
    let name_ends: Vec<usize> = shown
        .iter()
        .map(|name| {
            end += name.len();
            let this = end;
            end += 2;
            this
        })
        .collect();
    for keep in (1..=considered).rev() {
        let others = people.len() - keep;
        let suffix = format!(" and {}", listed::<&str>(&[], others));
        if pen_before(&shaped, name_ends[keep - 1]) + shape::width(weight, size, &suffix) <= CONTENT_WIDTH {
            return listed(&people[..keep], others);
        }
    }
    truncate(PEOPLE, &listed(&people[..1], people.len() - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn fits(style: (Weight, f32), text: &str) -> bool {
        shape::width(style.0, style.1, text) <= CONTENT_WIDTH
    }

    #[test]
    fn short_title_stays_on_one_line() {
        assert_eq!(title("Puerto Rico, July"), ["Puerto Rico, July"]);
    }

    #[test]
    fn long_title_wraps_and_cuts_at_a_word() {
        let lines = title("Grandma Rosalind's 80th Birthday Extravaganza Across the Entire Iberian Peninsula and Back Again");
        assert_eq!(lines, ["Grandma Rosalind's 80th", "Birthday Extravaganza…"]);
        assert!(lines.iter().all(|line| fits(TITLE, line)));
    }

    #[test]
    fn a_word_wider_than_the_line_is_cut_mid_word() {
        let lines = title(&"W".repeat(60));
        assert_eq!(lines.len(), 1);
        assert!(lines[0].ends_with(ELLIPSIS) && fits(TITLE, &lines[0]));
    }

    #[test]
    fn route_that_fits_is_shown_whole() {
        assert_eq!(route(&names(&["SFO", "LIS", "Porto", "SFO"])), "SFO → LIS → Porto → SFO");
    }

    #[test]
    fn long_route_keeps_the_start_and_the_last_stop() {
        let stops = names(&["SFO", "JFK", "LIS", "Porto", "Coimbra", "Sintra", "Évora", "Faro", "Seville", "Granada", "Madrid", "SFO"]);
        let fitted = route(&stops);
        assert!(fitted.starts_with("SFO → JFK → LIS"));
        assert!(fitted.ends_with(" → … → SFO"));
        assert!(fits(ROUTE, &fitted));
    }

    #[test]
    fn hundreds_of_stops_still_fit() {
        let stops: Vec<String> = (0..300).map(|i| format!("Stop {i}")).collect();
        let fitted = route(&stops);
        assert!(fitted.starts_with("Stop 0 → Stop 1") && fitted.ends_with("→ Stop 299"));
        assert!(fits(ROUTE, &fitted));
    }

    #[test]
    fn single_stop() {
        assert_eq!(route(&names(&["Vieques"])), "Vieques");
    }

    #[test]
    fn people_that_fit_are_all_listed() {
        assert_eq!(people(&names(&["Alex", "Gio", "Sam"])), "Alex, Gio and Sam");
    }

    #[test]
    fn too_many_people_become_others() {
        let roster = names(&[
            "Alexandra", "Bartholomew", "Christopher", "Giovanni", "Josephine", "Maximilian", "Penelope", "Samantha",
            "Theodore",
        ]);
        let fitted = people(&roster);
        assert_eq!(fitted, "Alexandra, Bartholomew, Christopher, Giovanni and 5 others");
        assert!(fits(PEOPLE, &fitted));
    }

    #[test]
    fn layout_moves_down_when_the_title_wraps() {
        let summary = Summary {
            title: "A title long enough that it cannot possibly fit on a single line of the card".to_string(),
            dates: Some("Jul 11 – 18, 2026 · 8 days".to_string()),
            stops: names(&["A", "B"]),
            people: names(&["Alex"]),
            link: "tools.giodamelio.com/itinerary/3pwsf4hhwx5n6s".to_string(),
        };
        let baselines: Vec<f32> = lines(&summary).iter().map(|line| line.baseline).collect();
        assert_eq!(baselines, [140.0, 222.0, 312.0, 402.0, 512.0, 580.0]);
    }
}
