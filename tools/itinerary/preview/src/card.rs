use tiny_skia::{Color, Paint, Pixmap, Rect, Transform};

use crate::glyphs::{Rgb, SUBPIXEL_STEPS};
use crate::layout::{self, ACCENT, ACCENT_BAR_WIDTH, BACKGROUND, HEIGHT, ICON, STYLES, WIDTH};
use crate::route::{Mode, Route};
use crate::shape::{self, Line};
use crate::summary::{alphabetical, Summary};

/// The card as a PNG.
pub fn render(summary: &Summary) -> Vec<u8> {
    let mut pixmap = Pixmap::new(WIDTH, HEIGHT).expect("card size is non-zero");
    pixmap.fill(Color::from_rgba8(BACKGROUND.0, BACKGROUND.1, BACKGROUND.2, 0xff));

    let mut accent = Paint::default();
    accent.set_color_rgba8(ACCENT.0, ACCENT.1, ACCENT.2, 0xff);
    let bar = Rect::from_xywh(0.0, 0.0, ACCENT_BAR_WIDTH, HEIGHT as f32).expect("accent bar is non-empty");
    pixmap.fill_rect(bar, &accent, Transform::identity(), None);

    for line in layout::lines(summary) {
        shape::draw(&line, &mut pixmap);
    }
    encode(&pixmap)
}

/// fdeflate's ultra-fast mode with the Up filter, the fastest pairing measured on Workers. Set the filter
/// after the compression: `set_compression` would replace it.
fn encode(pixmap: &Pixmap) -> Vec<u8> {
    let mut png = Vec::new();
    let mut encoder = png::Encoder::new(&mut png, pixmap.width(), pixmap.height());
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_deflate_compression(png::DeflateCompression::FdeflateUltraFast);
    encoder.set_filter(png::Filter::Up);
    // tiny-skia stores premultiplied RGBA; the background is opaque, so that equals straight RGBA.
    encoder
        .write_header()
        .and_then(|mut writer| writer.write_image_data(pixmap.data()))
        .expect("encoding into a Vec cannot fail");
    png
}

/// Rasterises printable ASCII in every style and every transport icon, at every subpixel offset, then
/// renders the sample cards. Run during isolate startup, it keeps lazy wasm compilation and glyph rasterising out of
/// the first request, which otherwise costs 60–130 ms of CPU.
pub fn warm() {
    let ascii: String = (' '..='~').collect();
    let icons: String = Mode::ALL.iter().map(|mode| mode.icon()).collect();
    let styles = STYLES.iter().map(|&style| (style, &ascii)).chain([(ICON, &icons)]);
    let mut scratch = Pixmap::new(WIDTH, HEIGHT).expect("card size is non-zero");
    for ((font, size), text) in styles {
        for step in 0..SUBPIXEL_STEPS {
            let line = Line {
                font,
                size,
                x: step as f32 / SUBPIXEL_STEPS as f32,
                baseline: size,
                align_end: false,
                color: Rgb(0xff, 0xff, 0xff),
                text: text.clone(),
            };
            shape::draw(&line, &mut scratch);
        }
    }
    for (_, summary) in samples() {
        render(&summary);
    }
}

/// Trips that exercise every layout rule. The warm-up renders all of them; `examples/cards.rs` writes them to
/// disk to look at. Legs are `[type, from, to, operator]`, and become a route the same way a stored trip's do.
pub fn samples() -> Vec<(&'static str, Summary)> {
    let strings = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<String>>();
    let summary = |title: &str, dates: Option<&str>, legs: &[[&str; 4]], people: &[&str], id: &str| Summary {
        title: title.to_string(),
        dates: dates.map(str::to_string),
        route: Route::from_legs(Some(&serde_json::to_string(legs).expect("legs serialise"))),
        people: alphabetical(strings(people)),
        link: format!("tools.giodamelio.com/itinerary/{id}"),
    };
    vec![
        (
            "demo",
            summary(
                "Puerto Rico, July",
                Some("Jul 11 – 18, 2026 · 8 days"),
                &[
                    ["flight", "Chicago O'Hare", "San Juan", "United"],
                    ["drive", "Old San Juan", "Ceiba ferry terminal", ""],
                    ["transit", "Ceiba", "Vieques", "Puerto Rico Ferry"],
                    ["transit", "Vieques", "Ceiba", "Puerto Rico Ferry"],
                    ["flight", "San Juan", "Chicago O'Hare", "United"],
                ],
                &["Alex", "Sam"],
                "3pwsf4hhwx5n6s",
            ),
        ),
        (
            "worst",
            summary(
                "Grandma Rosalind's 80th Birthday Extravaganza Across the Entire Iberian Peninsula and Back Again",
                Some("Oct 28 – Nov 14, 2026 · 18 days"),
                &[
                    ["flight", "SFO", "JFK", "United"],
                    ["flight", "JFK", "LIS", "TAP Air Portugal"],
                    ["transit", "Lisbon Santa Apolónia", "Porto Campanhã", "CP Alfa Pendular"],
                    ["transit", "Porto", "Coimbra", "Rede Expressos bus"],
                    ["drive", "Coimbra", "Sintra", ""],
                    ["drive", "Sintra", "Évora", ""],
                    ["transit", "Évora", "Faro", "FlixBus"],
                    ["transit", "Faro", "Seville", "Alsa bus"],
                    ["transit", "Seville", "Granada", "Renfe"],
                    ["transit", "Granada", "Madrid", "Renfe AVE"],
                    ["flight", "MAD", "BCN", "Iberia"],
                    ["flight", "BCN", "JFK", "Delta"],
                    ["flight", "JFK", "SFO", "United"],
                ],
                &[
                    "Alexandra", "Bartholomew", "Christopher", "Giovanni", "Josephine", "Maximilian", "Penelope",
                    "Samantha", "Theodore",
                ],
                "k7m3qxbn9fd2rt",
            ),
        ),
        (
            "short-route",
            summary(
                "Weekend in Portland",
                Some("Mar 6 – 8, 2027 · 3 days"),
                &[["transit", "Seattle King Street", "Portland Union Station", "Amtrak Cascades"], ["flight", "PDX", "SEA", "Alaska"]],
                &["Gio"],
                "b2c3d4f5g6h7j8",
            ),
        ),
        (
            "single-day",
            summary(
                "Ferry to Victoria",
                Some("Aug 2, 2026 · 1 day"),
                &[["transit", "Seattle", "Victoria", "Clipper ferry"]],
                &["Gio", "Sam"],
                "m9n8p7q6r5s4t3",
            ),
        ),
        (
            "new-year",
            summary(
                "New Year in Reykjavík",
                Some("Dec 29, 2026 – Jan 3, 2027 · 6 days"),
                &[
                    ["flight", "BOS", "KEF", "Icelandair"],
                    ["transit", "Keflavík Airport", "Reykjavík BSÍ", "Flybus"],
                    ["drive", "Reykjavík", "Vík", ""],
                    ["drive", "Vík", "Reykjavík", ""],
                    ["flight", "KEF", "BOS", "Icelandair"],
                ],
                &["Ægir", "Zoë", "Ólafur", "chloé"],
                "v2w3x4z5b6c7d8",
            ),
        ),
        ("empty", summary("Untitled trip", None, &[], &[], "z9z8z7z6z5z4z3")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::glyphs;

    #[test]
    fn cards_render_at_full_size_from_a_warm_cache() {
        warm();
        let cached = glyphs::cached();
        for (_, summary) in samples() {
            let png = render(&summary);
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
            assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), WIDTH);
            assert_eq!(u32::from_be_bytes(png[20..24].try_into().unwrap()), HEIGHT);
        }
        assert_eq!(glyphs::cached(), cached, "the warm-up covers every glyph on both sample cards");
    }
}
