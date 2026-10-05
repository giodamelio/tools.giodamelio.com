use std::cell::RefCell;
use std::collections::HashMap;

use skrifa::outline::{DrawSettings, OutlinePen};
use skrifa::prelude::{LocationRef, Size};
use skrifa::{FontRef, MetadataProvider};
use tiny_skia::{FillRule, Mask, PathBuilder, Pixmap, Transform};

/// Pen positions snap to quarter pixels horizontally. Vertically they snap to whole pixels: every line on the
/// card sits on its own whole-pixel baseline.
pub const SUBPIXEL_STEPS: u8 = 4;

#[derive(Clone, Copy)]
pub struct Rgb(pub u8, pub u8, pub u8);

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    face: u8,
    glyph: u32,
    size_bits: u32,
    subpixel: u8,
}

struct Glyph {
    /// `None` for glyphs with no outline, such as a space.
    mask: Option<Mask>,
    left: i32,
    top: i32,
}

thread_local! {
    // Rasterising a glyph costs more than shaping and encoding a whole card, so each one is rasterised once
    // per isolate and blended from here after that.
    static CACHE: RefCell<HashMap<Key, Glyph>> = RefCell::new(HashMap::new());
}

/// A glyph to draw: its outline in `face`, at `size` pixels per em, with its origin at (`x`, `y`).
pub struct Placement<'a> {
    pub face: u8,
    pub font: &'a FontRef<'static>,
    pub units_per_em: f32,
    pub glyph: u32,
    pub size: f32,
    pub x: f32,
    pub y: f32,
}

/// Blends one glyph onto `pixmap` in `color`, rasterising it first if this isolate has not seen it yet.
pub fn draw(placement: &Placement, color: Rgb, pixmap: &mut Pixmap) {
    let pen_x = placement.x.floor();
    let pen_y = placement.y.round();
    let key = Key {
        face: placement.face,
        glyph: placement.glyph,
        size_bits: placement.size.to_bits(),
        subpixel: ((placement.x - pen_x) * SUBPIXEL_STEPS as f32) as u8,
    };
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let glyph = cache.entry(key).or_insert_with(|| rasterise(placement, key.subpixel));
        if let Some(mask) = &glyph.mask {
            blend(pixmap, mask, pen_x as i32 + glyph.left, pen_y as i32 + glyph.top, color);
        }
    })
}

fn rasterise(placement: &Placement, subpixel: u8) -> Glyph {
    let empty = Glyph { mask: None, left: 0, top: 0 };
    let Some(path) = outline(placement.font, placement.glyph) else {
        return empty;
    };
    // Font units have y pointing up; the canvas has it pointing down.
    let scale = placement.size / placement.units_per_em;
    let offset = subpixel as f32 / SUBPIXEL_STEPS as f32;
    let transform = Transform::from_row(scale, 0.0, 0.0, -scale, offset, 0.0);
    let Some(bounds) = path.clone().transform(transform).map(|p| p.bounds()) else {
        return empty;
    };
    let left = bounds.left().floor() as i32;
    let top = bounds.top().floor() as i32;
    let width = (bounds.right().ceil() as i32 - left) as u32;
    let height = (bounds.bottom().ceil() as i32 - top) as u32;
    let Some(mut mask) = Mask::new(width, height) else {
        return empty;
    };
    mask.fill_path(&path, FillRule::Winding, true, transform.post_translate(-left as f32, -top as f32));
    Glyph { mask: Some(mask), left, top }
}

fn outline(font: &FontRef, glyph: u32) -> Option<tiny_skia::Path> {
    let outline = font.outline_glyphs().get(skrifa::GlyphId::new(glyph))?;
    let mut pen = Pen(PathBuilder::new());
    let settings = DrawSettings::unhinted(Size::unscaled(), LocationRef::default());
    outline.draw(settings, &mut pen).ok()?;
    pen.0.finish()
}

struct Pen(PathBuilder);

impl OutlinePen for Pen {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.move_to(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.0.line_to(x, y);
    }
    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        self.0.quad_to(cx0, cy0, x, y);
    }
    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        self.0.cubic_to(cx0, cy0, cx1, cy1, x, y);
    }
    fn close(&mut self) {
        self.0.close();
    }
}

/// Source-over of a flat colour through a coverage mask. The card's background is opaque, so the destination
/// alpha stays at 255 and its premultiplied channels equal the straight ones.
fn blend(pixmap: &mut Pixmap, mask: &Mask, x: i32, y: i32, color: Rgb) {
    let (canvas_width, canvas_height) = (pixmap.width() as i32, pixmap.height() as i32);
    let mask_width = mask.width() as i32;
    let source = [color.0 as u32, color.1 as u32, color.2 as u32];
    let coverage = mask.data();
    let pixels = pixmap.data_mut();
    for my in 0..mask.height() as i32 {
        let py = y + my;
        if !(0..canvas_height).contains(&py) {
            continue;
        }
        for mx in 0..mask_width {
            let px = x + mx;
            if !(0..canvas_width).contains(&px) {
                continue;
            }
            let alpha = coverage[(my * mask_width + mx) as usize] as u32;
            if alpha == 0 {
                continue;
            }
            let i = ((py * canvas_width + px) * 4) as usize;
            for (channel, &value) in source.iter().enumerate() {
                let under = pixels[i + channel] as u32;
                pixels[i + channel] = ((value * alpha + under * (255 - alpha) + 127) / 255) as u8;
            }
        }
    }
}

#[cfg(test)]
pub fn cached() -> usize {
    CACHE.with(|cache| cache.borrow().len())
}
