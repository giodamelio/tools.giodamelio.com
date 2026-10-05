//! Renders every sample trip in `card::samples` to PNG files, to look at while working on the card:
//!
//!     cargo run --release --example cards -- [output directory]
//!
//! The directory defaults to `cards/` here, which is ignored. Run it inside `nix develop`, which sets
//! `CARD_FONTS_DIR`.
//!
//! The time printed is per render with the glyph cache already full, as the Worker serves a card after its
//! startup warm-up. It is native code, so only compare it with other runs of this example.

use std::path::PathBuf;
use std::time::Instant;

const TIMED_RENDERS: u32 = 100;

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| "cards".to_string()));
    std::fs::create_dir_all(&dir).unwrap_or_else(|err| panic!("cannot create {}: {err}", dir.display()));

    for (name, summary) in itinerary_preview::samples() {
        let png = itinerary_preview::render(&summary);
        let started = Instant::now();
        for _ in 0..TIMED_RENDERS {
            itinerary_preview::render(&summary);
        }
        let per_render = started.elapsed().as_secs_f64() * 1000.0 / TIMED_RENDERS as f64;
        let path = dir.join(format!("{name}.png"));
        std::fs::write(&path, &png).unwrap_or_else(|err| panic!("cannot write {}: {err}", path.display()));
        println!("{:<44} {:>4} KB  {per_render:>6.2} ms", path.display(), png.len() / 1024);
    }
}
