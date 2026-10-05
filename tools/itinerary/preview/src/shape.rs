use std::cell::OnceCell;

use harfrust::{script, Direction, FontRef, GlyphBuffer, ShapeOptions, ShapePlan, ShaperData, UnicodeBuffer};
use skrifa::prelude::{LocationRef, Size};
use skrifa::MetadataProvider;
use tiny_skia::Pixmap;

use crate::glyphs::{self, Placement, Rgb};

// Inter 4 instanced at its text optical size and subset to Latin by the fonts derivation in preview.nix.
static REGULAR: &[u8] = include_bytes!(concat!(env!("CARD_FONTS_DIR"), "/Inter-Regular.ttf"));
static BOLD: &[u8] = include_bytes!(concat!(env!("CARD_FONTS_DIR"), "/Inter-Bold.ttf"));
// Five Material Symbols, filled, for the route's transport icons.
static ICONS: &[u8] = include_bytes!(concat!(env!("CARD_FONTS_DIR"), "/Icons.ttf"));

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Font {
    Regular,
    Bold,
    Icons,
}

/// One line of text at a fixed position. `x` is the left edge, or the right edge when `align_end` is set.
pub struct Line {
    pub font: Font,
    pub size: f32,
    pub x: f32,
    pub baseline: f32,
    pub align_end: bool,
    pub color: Rgb,
    pub text: String,
}

struct Face {
    font: FontRef<'static>,
    outlines: skrifa::FontRef<'static>,
    shaper_data: ShaperData,
    // Building a plan is the expensive part of shaping; every line on the card shares this one.
    plan: ShapePlan,
    units_per_em: f32,
}

impl Face {
    fn new(bytes: &'static [u8]) -> Face {
        let font = FontRef::from_index(bytes, 0).expect("bundled font parses for shaping");
        let outlines = skrifa::FontRef::new(bytes).expect("bundled font parses for outlines");
        let shaper_data = ShaperData::new(&font);
        let plan = ShapePlan::new(
            &shaper_data.shaper(&font).build(),
            Direction::LeftToRight,
            Some(script::LATIN),
            None,
            &[],
        );
        let units_per_em = outlines.metrics(Size::unscaled(), LocationRef::default()).units_per_em as f32;
        Face { font, outlines, shaper_data, plan, units_per_em }
    }

    fn shape(&self, text: &str) -> GlyphBuffer {
        let mut buffer = UnicodeBuffer::new();
        buffer.push_str(text);
        buffer.set_direction(Direction::LeftToRight);
        buffer.set_script(script::LATIN);
        let shaper = self.shaper_data.shaper(&self.font).build();
        shaper.shape(buffer, ShapeOptions::new().plan(Some(&self.plan)))
    }
}

thread_local! {
    static FACES: OnceCell<[Face; 3]> = const { OnceCell::new() };
}

fn with_face<T>(font: Font, f: impl FnOnce(&Face) -> T) -> T {
    FACES.with(|faces| {
        f(&faces.get_or_init(|| [Face::new(REGULAR), Face::new(BOLD), Face::new(ICONS)])[font as usize])
    })
}

/// Advance width of `text` in pixels.
pub fn width(font: Font, size: f32, text: &str) -> f32 {
    with_face(font, |face| {
        let units: i32 = face.shape(text).glyph_positions().iter().map(|p| p.x_advance).sum();
        units as f32 * size / face.units_per_em
    })
}

/// For each glyph, the byte offset where its cluster starts in `text` and the pen position after it, in
/// pixels. One shaping pass gives the width of every prefix, which is what the fitting rules need.
pub fn clusters(font: Font, size: f32, text: &str) -> Vec<(usize, f32)> {
    with_face(font, |face| {
        let output = face.shape(text);
        let scale = size / face.units_per_em;
        let mut pen = 0.0;
        output
            .glyph_infos()
            .iter()
            .zip(output.glyph_positions())
            .map(|(info, position)| {
                pen += position.x_advance as f32 * scale;
                (info.cluster as usize, pen)
            })
            .collect()
    })
}

/// Width of everything in the shaped text before byte offset `byte`.
pub fn pen_before(clusters: &[(usize, f32)], byte: usize) -> f32 {
    clusters.iter().take_while(|&&(cluster, _)| cluster < byte).last().map_or(0.0, |&(_, pen)| pen)
}

/// Total advance of shaped text.
pub fn total(clusters: &[(usize, f32)]) -> f32 {
    clusters.last().map_or(0.0, |&(_, pen)| pen)
}

/// Shapes and draws `line`.
pub fn draw(line: &Line, pixmap: &mut Pixmap) {
    with_face(line.font, |face| {
        let output = face.shape(&line.text);
        let scale = line.size / face.units_per_em;
        let advance: i32 = output.glyph_positions().iter().map(|p| p.x_advance).sum();
        let mut pen = if line.align_end { line.x - advance as f32 * scale } else { line.x };
        for (info, position) in output.glyph_infos().iter().zip(output.glyph_positions()) {
            let placement = Placement {
                face: line.font as u8,
                font: &face.outlines,
                units_per_em: face.units_per_em,
                glyph: info.glyph_id,
                size: line.size,
                x: pen + position.x_offset as f32 * scale,
                y: line.baseline - position.y_offset as f32 * scale,
            };
            glyphs::draw(&placement, line.color, pixmap);
            pen += position.x_advance as f32 * scale;
        }
    })
}
