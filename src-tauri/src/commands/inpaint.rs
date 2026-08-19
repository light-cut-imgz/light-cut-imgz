use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, Rgba, RgbaImage};
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

// 7×7 patch (half = 3), 200 random candidates per unknown pixel
const HALF: i32 = 3;
const CANDIDATES: usize = 200;

/// Exemplar-based inpainting: fill the masked region by copying pixels from
/// the best-matching patch found elsewhere in the known region.
///
/// `mask_b64` — base64-encoded alpha mask (1 byte per pixel, non-zero = fill).
#[tauri::command]
pub fn inpaint_image(
    state: State<'_, AppState>,
    tab_id: String,
    mask_b64: String,
    mask_width: u32,
    mask_height: u32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?.clone();

    let iw = img.width();
    let ih = img.height();

    if mask_width != iw || mask_height != ih {
        return Err(format!(
            "Mask {mask_width}×{mask_height} doesn't match image {iw}×{ih}"
        ));
    }

    let mask_bytes = STANDARD.decode(&mask_b64).map_err(|e| e.to_string())?;
    if mask_bytes.len() != (iw * ih) as usize {
        return Err(format!(
            "Expected {} mask bytes, got {}",
            iw * ih,
            mask_bytes.len()
        ));
    }

    let mut unknown: Vec<bool> = mask_bytes.iter().map(|&b| b > 10).collect();

    if !unknown.iter().any(|&u| u) {
        let img = history.current().ok_or("State error")?;
        return build_meta(img, "png", history.can_undo(), history.can_redo());
    }

    let rgba = img.to_rgba8();
    let result = do_inpaint(&rgba, &mut unknown, iw, ih);

    history.push(DynamicImage::ImageRgba8(result));
    let img = history.current().ok_or("State error after inpaint")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

// ── core algorithm ─────────────────────────────────────────────────────────────

fn do_inpaint(rgba: &RgbaImage, unknown: &mut [bool], w: u32, h: u32) -> RgbaImage {
    let mut out = rgba.clone();
    let mut rng: u64 = 0x00c0_ffee_dead_beef;

    let max_passes = (w + h) as usize;

    for _ in 0..max_passes {
        // Collect boundary: unknown pixels that have at least one known neighbor
        let mut boundary: Vec<(u32, u32, u8)> = Vec::new();
        for y in 0..h {
            for x in 0..w {
                if !unknown[(y * w + x) as usize] {
                    continue;
                }
                let kn = known_neighbor_count(x, y, w, h, unknown);
                if kn > 0 {
                    boundary.push((x, y, kn));
                }
            }
        }

        if boundary.is_empty() {
            break;
        }

        // Most-constrained first (most known neighbours)
        boundary.sort_unstable_by_key(|b| std::cmp::Reverse(b.2));

        let mut progress = false;
        for (x, y, _) in boundary {
            let idx = (y * w + x) as usize;
            if !unknown[idx] {
                continue;
            }

            let px = match find_best_patch(&out, unknown, x, y, w, h, &mut rng) {
                Some((bx, by)) => *out.get_pixel(bx, by),
                None => {
                    avg_known_neighbors(&out, unknown, x, y, w, h).unwrap_or(Rgba([0, 0, 0, 255]))
                }
            };

            out.put_pixel(x, y, px);
            unknown[idx] = false;
            progress = true;
        }

        if !progress || !unknown.iter().any(|&u| u) {
            break;
        }
    }

    out
}

fn known_neighbor_count(x: u32, y: u32, w: u32, h: u32, unknown: &[bool]) -> u8 {
    let mut count = 0u8;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0
                && nx < w as i32
                && ny >= 0
                && ny < h as i32
                && !unknown[(ny as u32 * w + nx as u32) as usize]
            {
                count += 1;
            }
        }
    }
    count
}

fn find_best_patch(
    img: &RgbaImage,
    unknown: &[bool],
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    rng: &mut u64,
) -> Option<(u32, u32)> {
    let ctx = SsdCtx { img, unknown, w, h };
    let mut best_ssd = u64::MAX;
    let mut best: Option<(u32, u32)> = None;

    for _ in 0..CANDIDATES {
        // Xorshift64 — fast deterministic PRNG
        *rng ^= *rng << 13;
        *rng ^= *rng >> 7;
        *rng ^= *rng << 17;
        let cx = (*rng % w as u64) as u32;
        let cy = ((*rng >> 32) % h as u64) as u32;

        if unknown[(cy * w + cx) as usize] {
            continue;
        }

        let ssd = patch_ssd(&ctx, x, y, cx, cy);
        if ssd < best_ssd {
            best_ssd = ssd;
            best = Some((cx, cy));
            if ssd == 0 {
                break;
            }
        }
    }

    best
}

struct SsdCtx<'a> {
    img: &'a RgbaImage,
    unknown: &'a [bool],
    w: u32,
    h: u32,
}

fn patch_ssd(ctx: &SsdCtx<'_>, ax: u32, ay: u32, bx: u32, by: u32) -> u64 {
    let SsdCtx { img, unknown, w, h } = ctx;
    let (w, h) = (*w, *h);
    let mut ssd = 0u64;
    let mut n = 0u64;

    for dy in -HALF..=HALF {
        for dx in -HALF..=HALF {
            let anx = ax as i32 + dx;
            let any = ay as i32 + dy;
            let bnx = bx as i32 + dx;
            let bny = by as i32 + dy;

            if anx < 0 || anx >= w as i32 || any < 0 || any >= h as i32 {
                continue;
            }
            if bnx < 0 || bnx >= w as i32 || bny < 0 || bny >= h as i32 {
                continue;
            }
            // Only compare over known pixels of the source patch
            if unknown[(any as u32 * w + anx as u32) as usize] {
                continue;
            }
            // Target candidate must also be known
            if unknown[(bny as u32 * w + bnx as u32) as usize] {
                continue;
            }

            let pa = img.get_pixel(anx as u32, any as u32);
            let pb = img.get_pixel(bnx as u32, bny as u32);
            for ch in 0..3usize {
                let d = pa[ch] as i64 - pb[ch] as i64;
                ssd += (d * d) as u64;
            }
            n += 1;
        }
    }

    ssd.checked_div(n).unwrap_or(u64::MAX)
}

fn avg_known_neighbors(
    img: &RgbaImage,
    unknown: &[bool],
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Option<Rgba<u8>> {
    let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                let idx = (ny as u32 * w + nx as u32) as usize;
                if !unknown[idx] {
                    let px = img.get_pixel(nx as u32, ny as u32);
                    r += px[0] as u32;
                    g += px[1] as u32;
                    b += px[2] as u32;
                    n += 1;
                }
            }
        }
    }
    (r.checked_div(n)).map(|r_avg| Rgba([r_avg as u8, (g / n) as u8, (b / n) as u8, 255]))
}

// ── tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn solid(r: u8, g: u8, b: u8, w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for px in img.pixels_mut() {
            *px = Rgba([r, g, b, 255]);
        }
        img
    }

    #[test]
    fn inpaint_no_mask_is_identity() {
        let rgba = solid(80, 120, 200, 10, 10);
        let mut unknown = vec![false; 100];
        let result = do_inpaint(&rgba, &mut unknown, 10, 10);
        assert_eq!(result.get_pixel(5, 5), rgba.get_pixel(5, 5));
    }

    #[test]
    fn inpaint_uniform_image_fills_correctly() {
        let w = 20u32;
        let h = 20u32;
        let mut rgba = solid(100, 150, 200, w, h);
        let mut unknown = vec![false; (w * h) as usize];
        // Punch a 4×4 hole in the middle
        for y in 8..12u32 {
            for x in 8..12u32 {
                rgba.put_pixel(x, y, Rgba([0, 0, 0, 255]));
                unknown[(y * w + x) as usize] = true;
            }
        }
        let result = do_inpaint(&rgba, &mut unknown, w, h);
        for y in 8..12u32 {
            for x in 8..12u32 {
                let px = result.get_pixel(x, y);
                assert_eq!(px[0], 100, "R at ({x},{y})");
                assert_eq!(px[1], 150, "G at ({x},{y})");
                assert_eq!(px[2], 200, "B at ({x},{y})");
            }
        }
    }

    #[test]
    fn patch_ssd_identical_patches_is_zero() {
        let rgba = solid(128, 128, 128, 20, 20);
        let unknown = vec![false; 400];
        let ctx = SsdCtx {
            img: &rgba,
            unknown: &unknown,
            w: 20,
            h: 20,
        };
        let ssd = patch_ssd(&ctx, 5, 5, 15, 15);
        assert_eq!(ssd, 0);
    }

    #[test]
    fn avg_known_neighbors_returns_none_when_all_unknown() {
        let rgba = solid(100, 100, 100, 5, 5);
        let unknown = vec![true; 25];
        let result = avg_known_neighbors(&rgba, &unknown, 2, 2, 5, 5);
        assert!(result.is_none());
    }

    // ── commande ─────────────────────────────────────────────────────────────

    use crate::test_support::{gradient, Harness, TAB};

    /// Masque base64 : un octet par pixel, 255 dans le rectangle donné.
    fn mask(w: u32, h: u32, rect: Option<(u32, u32, u32, u32)>) -> String {
        let mut bytes = vec![0u8; (w * h) as usize];
        if let Some((rx, ry, rw, rh)) = rect {
            for y in ry..ry + rh {
                for x in rx..rx + rw {
                    bytes[(y * w + x) as usize] = 255;
                }
            }
        }
        STANDARD.encode(bytes)
    }

    #[test]
    fn an_unknown_tab_is_rejected() {
        let h = Harness::empty();

        assert_eq!(
            inpaint_image(h.state(), TAB.into(), mask(2, 2, None), 2, 2).unwrap_err(),
            "Tab not found"
        );
    }

    #[test]
    fn a_tab_without_an_image_is_rejected() {
        let h = Harness::without_image();

        assert_eq!(
            inpaint_image(h.state(), TAB.into(), mask(2, 2, None), 2, 2).unwrap_err(),
            "No image loaded"
        );
    }

    #[test]
    fn a_mask_of_the_wrong_size_is_rejected() {
        let h = Harness::with_image(gradient(8, 8));

        let err = inpaint_image(h.state(), TAB.into(), mask(4, 4, None), 4, 4).unwrap_err();

        assert!(err.contains("doesn't match image"), "{err}");
    }

    #[test]
    fn a_mask_that_is_not_base64_is_rejected() {
        let h = Harness::with_image(gradient(4, 4));

        assert!(inpaint_image(h.state(), TAB.into(), "!!!pas du base64".into(), 4, 4).is_err());
    }

    #[test]
    fn a_mask_with_the_wrong_byte_count_is_rejected() {
        let h = Harness::with_image(gradient(4, 4));
        let short = STANDARD.encode(vec![0u8; 3]);

        let err = inpaint_image(h.state(), TAB.into(), short, 4, 4).unwrap_err();

        assert!(err.contains("Expected 16 mask bytes"), "{err}");
    }

    #[test]
    fn an_empty_mask_leaves_the_image_untouched() {
        let h = Harness::with_image(gradient(6, 6));
        let before = h.current();

        inpaint_image(h.state(), TAB.into(), mask(6, 6, None), 6, 6).unwrap();

        assert_eq!(h.current(), before);
        assert_eq!(h.history_len(), 1); // rien n'est empilé
    }

    #[test]
    fn a_masked_region_is_filled_and_pushed_to_the_history() {
        let h = Harness::with_image(gradient(16, 16));

        let meta = inpaint_image(
            h.state(),
            TAB.into(),
            mask(16, 16, Some((6, 6, 3, 3))),
            16,
            16,
        )
        .unwrap();

        assert_eq!((meta.width, meta.height), (16, 16));
        assert_eq!(h.history_len(), 2);
        // Le trou est rebouché par des pixels opaques venus d'ailleurs dans l'image.
        assert_eq!(h.pixel(7, 7)[3], 255);
    }

    #[test]
    fn a_fully_masked_image_still_terminates() {
        // Aucun pixel connu : `find_best_patch` échoue partout et le repli finit le travail.
        let h = Harness::with_image(gradient(6, 6));

        inpaint_image(h.state(), TAB.into(), mask(6, 6, Some((0, 0, 6, 6))), 6, 6).unwrap();

        assert_eq!(h.history_len(), 2);
    }

    #[test]
    fn a_mask_touching_the_border_is_handled() {
        let h = Harness::with_image(gradient(12, 12));

        inpaint_image(
            h.state(),
            TAB.into(),
            mask(12, 12, Some((0, 0, 2, 12))),
            12,
            12,
        )
        .unwrap();

        assert_eq!(h.pixel(0, 0)[3], 255);
    }

    #[test]
    fn faint_mask_values_are_treated_as_known() {
        // Le seuil est à 10 : une valeur en dessous ne doit rien effacer.
        let h = Harness::with_image(gradient(6, 6));
        let before = h.current();
        let faint = STANDARD.encode(vec![5u8; 36]);

        inpaint_image(h.state(), TAB.into(), faint, 6, 6).unwrap();

        assert_eq!(h.current(), before);
    }

    #[test]
    fn inpainting_is_deterministic() {
        let run = || {
            let h = Harness::with_image(gradient(14, 14));
            inpaint_image(
                h.state(),
                TAB.into(),
                mask(14, 14, Some((5, 5, 4, 4))),
                14,
                14,
            )
            .unwrap();
            h.current()
        };

        assert_eq!(run(), run());
    }
}
