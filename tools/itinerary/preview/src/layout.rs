use crate::glyphs::Rgb;
use crate::route::{Mode, Route};
use crate::shape::{self, clusters, pen_before, total, Font, Line};
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

const TITLE: (Font, f32) = (Font::Bold, 72.0);
const DATES: (Font, f32) = (Font::Regular, 40.0);
const ROUTE: (Font, f32) = (Font::Bold, 40.0);
const PEOPLE: (Font, f32) = (Font::Regular, 36.0);
const LINK: (Font, f32) = (Font::Regular, 28.0);

/// Every text style on the card, for the warm-up to rasterise ahead of time.
pub const STYLES: [(Font, f32); 5] = [TITLE, DATES, ROUTE, PEOPLE, LINK];

/// The transport icons between stops, and the space either side of each.
pub const ICON: (Font, f32) = (Font::Icons, 36.0);
const ICON_SPACE: f32 = 10.0;
/// How far the icons' baseline sits below the route's, to centre them on the stop names.
const ICON_DROP: f32 = 6.0;

/// Where the lines above the link sit. A two-line title needs more height, which comes out of the gaps
/// between lines rather than the space above the title.
struct Spacing {
    title_baseline: f32,
    title_leading: f32,
    line_gap: f32,
    people_gap: f32,
}

const ONE_LINE_TITLE: Spacing = Spacing { title_baseline: 200.0, title_leading: 0.0, line_gap: 90.0, people_gap: 110.0 };
const TWO_LINE_TITLE: Spacing = Spacing { title_baseline: 168.0, title_leading: 78.0, line_gap: 82.0, people_gap: 100.0 };

const LINK_BASELINE: f32 = 580.0;

const ELLIPSIS: &str = "…";

/// The fewest characters of a shortened stop worth showing; with less, the stop is hidden behind `…`.
const SHORTENED_STOP_CHARS: usize = 4;

/// More characters than any line on the card can show. Routes and rosters can run to hundreds of entries;
/// nothing past this is shaped.
const SHAPED_CHARS: usize = 120;

/// The card's text, fitted to the content width.
pub fn lines(summary: &Summary) -> Vec<Line> {
    let line = |(font, size): (Font, f32), baseline: f32, color: Rgb, text: String| Line {
        font,
        size,
        x: MARGIN,
        baseline,
        align_end: false,
        color,
        text,
    };

    let title = title(&summary.title);
    let spacing = if title.len() == 1 { ONE_LINE_TITLE } else { TWO_LINE_TITLE };
    let title_baseline = |i: usize| spacing.title_baseline + spacing.title_leading * i as f32;
    let last_title = title_baseline(title.len() - 1);
    let mut lines: Vec<Line> = title
        .into_iter()
        .enumerate()
        .map(|(i, text)| line(TITLE, title_baseline(i), FOREGROUND, text))
        .collect();

    if let Some(dates) = &summary.dates {
        lines.push(line(DATES, last_title + spacing.line_gap, MUTED, truncate(DATES, dates)));
    }
    let route_baseline = last_title + 2.0 * spacing.line_gap;
    if !summary.route.stops.is_empty() {
        lines.extend(route_line(&summary.route, route_baseline));
    }
    if !summary.people.is_empty() {
        lines.push(line(PEOPLE, route_baseline + spacing.people_gap, FOREGROUND, people(&summary.people)));
    }
    lines.push(Line {
        x: MARGIN + CONTENT_WIDTH,
        align_end: true,
        ..line(LINK, LINK_BASELINE, MUTED, truncate(LINK, &summary.link))
    });
    lines
}

/// The longest prefix of `text` that fits the content width with an ellipsis after it, or `text` itself
/// when it fits.
fn truncate(style: (Font, f32), text: &str) -> String {
    truncate_to(style, text, CONTENT_WIDTH)
}

/// The longest prefix of `text` no wider than `room` with an ellipsis after it, or `text` itself when it
/// fits.
fn truncate_to((font, size): (Font, f32), text: &str, room: f32) -> String {
    if shape::width(font, size, text) <= room {
        return text.to_string();
    }
    let ends: Vec<usize> = text.char_indices().map(|(i, _)| i).skip(1).collect();
    let cut = |end: usize| format!("{}{ELLIPSIS}", text[..end].trim_end());
    let fits = |end: usize| shape::width(font, size, &cut(end)) <= room;
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
fn truncate_words(style @ (font, size): (Font, f32), text: &str) -> String {
    let shaped = clusters(font, size, text);
    if total(&shaped) <= CONTENT_WIDTH {
        return text.to_string();
    }
    let room = CONTENT_WIDTH - shape::width(font, size, ELLIPSIS);
    match last_space_within(text, &shaped, room) {
        Some(at) => format!("{}{ELLIPSIS}", text[..at].trim_end()),
        None => truncate(style, text),
    }
}

/// One line, or two split at the last space that lets the first fit, with the second cut after a whole word.
fn title(text: &str) -> Vec<String> {
    let (font, size) = TITLE;
    let shaped = clusters(font, size, text);
    if total(&shaped) <= CONTENT_WIDTH {
        return vec![text.to_string()];
    }
    match last_space_within(text, &shaped, CONTENT_WIDTH) {
        Some(at) => vec![text[..at].to_string(), truncate_words(TITLE, text[at..].trim_start())],
        None => vec![truncate(TITLE, text)],
    }
}

/// One element of the route line.
enum Piece {
    /// A stop, `width` wide, with the leg that arrives at it.
    Stop { arriving: Option<Mode>, text: String, width: f32 },
    /// Stops left out because they do not fit.
    Hidden,
}

/// Every stop with the icon for each leg between them. When that is too wide: as many stops from the start
/// as fit, then `…`, the last leg's icon and the last stop. When only one stop would be left out, it is
/// shortened instead, so every leg keeps its icon; if too little of it would be left, it is left out after
/// all.
fn route_line(route: &Route, baseline: f32) -> Vec<Line> {
    let (font, size) = ROUTE;
    let (last, rest) = route.stops.split_last().expect("route has at least one stop");
    let name = |x: f32, text: String| Line { font, size, x, baseline, align_end: false, color: ACCENT, text };
    if rest.is_empty() {
        return vec![name(MARGIN, truncate(ROUTE, last))];
    }

    let icon_width = |mode: Mode| shape::width(ICON.0, ICON.1, &mode.icon().to_string());
    let gap = |mode: Mode| 2.0 * ICON_SPACE + icon_width(mode);
    let arriving = |i: usize| (i > 0).then(|| route.modes[i - 1]);

    let mut chars = last.chars().count();
    let considered = rest
        .iter()
        .take_while(|stop| {
            chars += stop.chars().count() + 3;
            chars <= SHAPED_CHARS
        })
        .count()
        .max(1);
    let widths: Vec<f32> = rest[..considered].iter().map(|stop| shape::width(font, size, stop)).collect();
    let last_width = shape::width(font, size, last);
    let last_mode = *route.modes.last().expect("a route of two stops has a leg");

    // Each stop's right edge, measured from the start of the line, when the route is drawn in full.
    let mut ends = Vec::with_capacity(considered);
    let mut pen = 0.0;
    for (i, width) in widths.iter().enumerate() {
        pen += arriving(i).map_or(0.0, gap) + width;
        ends.push(pen);
    }
    let stop = |i: usize| Piece::Stop { arriving: arriving(i), text: rest[i].clone(), width: widths[i] };

    let mut pieces: Vec<Piece> = Vec::new();
    if considered == rest.len() && pen + gap(last_mode) + last_width <= CONTENT_WIDTH {
        pieces.extend((0..rest.len()).map(stop));
    } else {
        let tail = ICON_SPACE + shape::width(font, size, ELLIPSIS) + gap(last_mode) + last_width;
        let fitting = ends.iter().take_while(|&&end| end + tail <= CONTENT_WIDTH).count();
        if fitting == 0 {
            return vec![name(MARGIN, truncate(ROUTE, &format!("{} {ELLIPSIS} {last}", rest[0])))];
        }
        pieces.extend((0..fitting).map(stop));

        let room = CONTENT_WIDTH - ends[fitting - 1] - gap(route.modes[fitting - 1]) - gap(last_mode) - last_width;
        let shortened = (fitting == rest.len() - 1)
            .then(|| truncate_to(ROUTE, &rest[fitting], room))
            .filter(|text| text.trim_end_matches(ELLIPSIS).chars().count() >= SHORTENED_STOP_CHARS);
        pieces.push(match shortened {
            Some(text) => {
                let width = shape::width(font, size, &text);
                Piece::Stop { arriving: Some(route.modes[fitting - 1]), text, width }
            }
            None => Piece::Hidden,
        });
    }
    pieces.push(Piece::Stop { arriving: Some(last_mode), text: last.clone(), width: last_width });

    let mut lines = Vec::new();
    let mut x = MARGIN;
    for piece in pieces {
        match piece {
            Piece::Stop { arriving, text, width } => {
                if let Some(mode) = arriving {
                    lines.push(Line {
                        font: ICON.0,
                        size: ICON.1,
                        x: x + ICON_SPACE,
                        baseline: baseline + ICON_DROP,
                        align_end: false,
                        color: MUTED,
                        text: mode.icon().to_string(),
                    });
                    x += gap(mode);
                }
                lines.push(name(x, text));
                x += width;
            }
            Piece::Hidden => {
                x += ICON_SPACE;
                lines.push(name(x, ELLIPSIS.to_string()));
                x += shape::width(font, size, ELLIPSIS);
            }
        }
    }
    lines
}

/// Everyone, or as many as fit followed by `and N others`. `people` is already in alphabetical order.
fn people(people: &[String]) -> String {
    let (font, size) = PEOPLE;
    let everyone = listed(people, 0);
    if people.len() == 1 {
        return truncate(PEOPLE, &everyone);
    }
    if everyone.chars().count() <= SHAPED_CHARS && shape::width(font, size, &everyone) <= CONTENT_WIDTH {
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
    let shaped = clusters(font, size, &joined);

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
        if pen_before(&shaped, name_ends[keep - 1]) + shape::width(font, size, &suffix) <= CONTENT_WIDTH {
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

    fn fits(style: (Font, f32), text: &str) -> bool {
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

    fn route(stops: &[&str], modes: &[Mode]) -> Route {
        Route { stops: names(stops), modes: modes.to_vec() }
    }

    /// The route's pieces as text, with each icon written as its mode.
    fn describe(pieces: &[Line]) -> String {
        let words: Vec<String> = pieces
            .iter()
            .map(|piece| match Mode::ALL.iter().find(|mode| piece.text == mode.icon().to_string()) {
                Some(mode) => format!("[{mode:?}]"),
                None => piece.text.clone(),
            })
            .collect();
        words.join(" ")
    }

    fn right_edge(pieces: &[Line]) -> f32 {
        let last = pieces.last().unwrap();
        last.x + shape::width(last.font, last.size, &last.text)
    }

    #[test]
    fn route_that_fits_is_shown_whole() {
        let pieces = route_line(&route(&["Seattle", "Portland", "Bend"], &[Mode::Train, Mode::Car]), 380.0);
        assert_eq!(describe(&pieces), "Seattle [Train] Portland [Car] Bend");
        assert!(right_edge(&pieces) <= MARGIN + CONTENT_WIDTH);
    }

    #[test]
    fn long_route_keeps_the_start_and_the_last_stop() {
        let stops = ["San Francisco", "New York", "Lisbon", "Porto", "Coimbra", "Sintra", "Évora", "Faro", "Seville", "Madrid", "San Francisco"];
        let modes = [Mode::Flight, Mode::Flight, Mode::Train, Mode::Train, Mode::Bus, Mode::Bus, Mode::Car, Mode::Car, Mode::Train, Mode::Flight];
        let pieces = route_line(&route(&stops, &modes), 380.0);
        let text = describe(&pieces);
        assert!(text.starts_with("San Francisco [Flight] New York "), "{text}");
        assert!(text.ends_with(" … [Flight] San Francisco"), "{text}");
        assert!(right_edge(&pieces) <= MARGIN + CONTENT_WIDTH);
    }

    #[test]
    fn the_icon_after_the_ellipsis_is_the_last_leg() {
        let stops = ["Lisbon", "Porto", "Coimbra", "Sintra", "Évora", "Faro", "Seville", "Granada", "Madrid", "Barcelona", "Valencia", "Vigo"];
        let mut modes = vec![Mode::Train; stops.len() - 2];
        modes.push(Mode::Boat);
        let text = describe(&route_line(&route(&stops, &modes), 380.0));
        assert!(text.starts_with("Lisbon [Train] Porto"), "{text}");
        assert!(text.ends_with(" … [Boat] Vigo"), "{text}");
    }

    #[test]
    fn each_icon_is_the_leg_into_the_stop_after_it() {
        let text = describe(&route_line(&route(&["Seattle", "Portland", "Bend"], &[Mode::Train, Mode::Car]), 380.0));
        assert_eq!(text, "Seattle [Train] Portland [Car] Bend");
    }

    #[test]
    fn a_single_stop_that_does_not_fit_is_shortened() {
        let stops = ["Seattle King Street", "Portland Union Station", "Seattle"];
        let pieces = route_line(&route(&stops, &[Mode::Train, Mode::Flight]), 380.0);
        let text = describe(&pieces);
        assert!(text.starts_with("Seattle King Street [Train] Portland"), "{text}");
        assert!(text.ends_with("… [Flight] Seattle") && !text.contains(" … "), "{text}");
        assert!(right_edge(&pieces) <= MARGIN + CONTENT_WIDTH);
    }

    #[test]
    fn hundreds_of_stops_still_fit() {
        let stops: Vec<String> = (0..300).map(|i| format!("Stop {i}")).collect();
        let pieces = route_line(&Route { stops, modes: vec![Mode::Train; 299] }, 380.0);
        let text = describe(&pieces);
        assert!(text.starts_with("Stop 0 [Train] Stop 1") && text.ends_with("… [Train] Stop 299"), "{text}");
        assert!(right_edge(&pieces) <= MARGIN + CONTENT_WIDTH);
    }

    #[test]
    fn single_stop() {
        assert_eq!(describe(&route_line(&route(&["Vieques"], &[]), 380.0)), "Vieques");
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
    fn a_wrapped_title_tightens_the_lines_below_it() {
        let summary = Summary {
            title: "A title long enough that it cannot possibly fit on a single line of the card".to_string(),
            dates: Some("Jul 11 – 18, 2026 · 8 days".to_string()),
            route: route(&["A", "B"], &[Mode::Car]),
            people: names(&["Alex"]),
            link: "tools.giodamelio.com/itinerary/3pwsf4hhwx5n6s".to_string(),
        };
        let baselines: Vec<f32> = lines(&summary).iter().map(|line| line.baseline).collect();
        assert_eq!(baselines, [168.0, 246.0, 328.0, 410.0, 410.0 + ICON_DROP, 410.0, 510.0, 580.0]);
    }
}
