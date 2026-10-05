//! Renders every sample trip in `card::samples` to PNG files, to look at while working on the card:
//!
//!     cargo run --release --example cards -- [output directory]
//!
//! The directory defaults to `cards/` here, which is ignored. Run it inside `nix develop`, which sets
//! `CARD_FONTS_DIR`.

use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| "cards".to_string()));
    std::fs::create_dir_all(&dir).unwrap_or_else(|err| panic!("cannot create {}: {err}", dir.display()));

    for (name, summary) in itinerary_preview::samples() {
        let started = Instant::now();
        let png = itinerary_preview::render(&summary);
        let elapsed = started.elapsed();
        let path = dir.join(format!("{name}.png"));
        std::fs::write(&path, &png).unwrap_or_else(|err| panic!("cannot write {}: {err}", path.display()));
        println!("{:<44} {:>4} KB  {:>6.2} ms", path.display(), png.len() / 1024, elapsed.as_secs_f64() * 1000.0);
    }
}
