use image::{DynamicImage, Rgba};
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

// ── colour-space helpers ──────────────────────────────────────────────────────

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < 1e-6 {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if (max - r).abs() < 1e-6 {
        let mut h = (g - b) / d;
        if g < b {
            h += 6.0;
        }
        h / 6.0
    } else if (max - g).abs() < 1e-6 {
        ((b - r) / d + 2.0) / 6.0
    } else {
        ((r - g) / d + 4.0) / 6.0
    };
    (h, s, l)
}

fn hue_channel(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 0.5 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s < 1e-6 {
        return (l, l, l);
    }
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    (
        hue_channel(p, q, h + 1.0 / 3.0),
        hue_channel(p, q, h),
        hue_channel(p, q, h - 1.0 / 3.0),
    )
}

#[inline]
fn clamp_u8(v: f32) -> u8 {
    v.clamp(0.0, 255.0).round() as u8
}

// ── tone-curve LUT (Fritsch-Carlson monotone cubic spline) ────────────────────

fn build_curve_lut(raw_points: &[[f32; 2]]) -> [u8; 256] {
    let mut pts: Vec<[f32; 2]> = raw_points.to_vec();
    pts.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
    pts.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-4);

    if pts.first().map(|p| p[0]).unwrap_or(1.0) > 0.01 {
        pts.insert(0, [0.0, 0.0]);
    }
    if pts.last().map(|p| p[0]).unwrap_or(0.0) < 0.99 {
        pts.push([1.0, 1.0]);
    }

    let n = pts.len();
    if n < 2 {
        return core::array::from_fn(|i| i as u8);
    }

    // secant slopes
    let mut delta = vec![0.0f32; n - 1];
    for k in 0..n - 1 {
        let dx = pts[k + 1][0] - pts[k][0];
        delta[k] = if dx.abs() < 1e-9 {
            0.0
        } else {
            (pts[k + 1][1] - pts[k][1]) / dx
        };
    }

    // tangents
    let mut m = vec![0.0f32; n];
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for k in 1..n - 1 {
        m[k] = (delta[k - 1] + delta[k]) / 2.0;
    }

    // monotonicity
    for k in 0..n - 1 {
        if delta[k].abs() < 1e-9 {
            m[k] = 0.0;
            m[k + 1] = 0.0;
        } else {
            let alpha = m[k] / delta[k];
            let beta = m[k + 1] / delta[k];
            let sq = alpha * alpha + beta * beta;
            if sq > 9.0 {
                let t = 3.0 / sq.sqrt();
                m[k] = t * alpha * delta[k];
                m[k + 1] = t * beta * delta[k];
            }
        }
    }

    let mut lut = [0u8; 256];
    #[allow(clippy::needless_range_loop)]
    for i in 0..256usize {
        let x = i as f32 / 255.0;
        let k = pts
            .windows(2)
            .position(|w| x <= w[1][0])
            .unwrap_or(n - 2)
            .min(n - 2);

        let h = pts[k + 1][0] - pts[k][0];
        let t = if h.abs() < 1e-9 {
            0.0
        } else {
            ((x - pts[k][0]) / h).clamp(0.0, 1.0)
        };
        let t2 = t * t;
        let t3 = t2 * t;

        let y = (2.0 * t3 - 3.0 * t2 + 1.0) * pts[k][1]
            + (t3 - 2.0 * t2 + t) * h * m[k]
            + (-2.0 * t3 + 3.0 * t2) * pts[k + 1][1]
            + (t3 - t2) * h * m[k + 1];

        lut[i] = (y.clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    lut
}

// ── commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn adjust_brightness_contrast(
    state: State<'_, AppState>,
    tab_id: String,
    brightness: f32, // -100 … +100
    contrast: f32,   // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let c = contrast / 100.0 * 255.0;
    let factor = (259.0 * (c + 255.0)) / (255.0 * (259.0 - c));
    let bias = brightness / 100.0 * 255.0;

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            let v = (px[ch] as f32 - 128.0) * factor + 128.0 + bias;
            px[ch] = clamp_u8(v);
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_exposure(
    state: State<'_, AppState>,
    tab_id: String,
    exposure: f32, // -3 … +3 EV
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let factor = (2.0f32).powf(exposure);

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = clamp_u8(px[ch] as f32 * factor);
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_hue_saturation(
    state: State<'_, AppState>,
    tab_id: String,
    hue: f32,        // -180 … +180 degrees
    saturation: f32, // -100 … +100
    lightness: f32,  // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let hue_d = hue / 360.0;
    let sat_d = saturation / 100.0;
    let lit_d = lightness / 100.0;

    for px in rgba.pixels_mut() {
        let (h, s, l) = rgb_to_hsl(
            px[0] as f32 / 255.0,
            px[1] as f32 / 255.0,
            px[2] as f32 / 255.0,
        );
        let (nr, ng, nb) = hsl_to_rgb(
            (h + hue_d).rem_euclid(1.0),
            (s + sat_d).clamp(0.0, 1.0),
            (l + lit_d).clamp(0.0, 1.0),
        );
        px[0] = clamp_u8(nr * 255.0);
        px[1] = clamp_u8(ng * 255.0);
        px[2] = clamp_u8(nb * 255.0);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_vibrance(
    state: State<'_, AppState>,
    tab_id: String,
    vibrance: f32, // -100 … +100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let v = vibrance / 100.0;

    for px in rgba.pixels_mut() {
        let (h, s, l) = rgb_to_hsl(
            px[0] as f32 / 255.0,
            px[1] as f32 / 255.0,
            px[2] as f32 / 255.0,
        );
        // Apply more boost to less-saturated colours
        let new_s = (s + v * (1.0 - s)).clamp(0.0, 1.0);
        let (nr, ng, nb) = hsl_to_rgb(h, new_s, l);
        px[0] = clamp_u8(nr * 255.0);
        px[1] = clamp_u8(ng * 255.0);
        px[2] = clamp_u8(nb * 255.0);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_levels(
    state: State<'_, AppState>,
    tab_id: String,
    in_black: u8,  // 0–253
    in_white: u8,  // 2–255
    gamma: f32,    // 0.1–10.0 (1.0 = linear)
    out_black: u8, // 0–253
    out_white: u8, // 2–255
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let gamma_inv = 1.0 / gamma.clamp(0.01, 100.0);
    let in_range = (in_white as f32 - in_black as f32).max(1.0);
    let out_range = out_white as f32 - out_black as f32;

    let lut: [u8; 256] = core::array::from_fn(|i| {
        let normalized = ((i as f32 - in_black as f32) / in_range).clamp(0.0, 1.0);
        let gamma_out = normalized.powf(gamma_inv);
        clamp_u8(out_black as f32 + gamma_out * out_range)
    });

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = lut[px[ch] as usize];
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_curves(
    state: State<'_, AppState>,
    tab_id: String,
    points: Vec<[f32; 2]>, // control points in 0.0–1.0
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();
    let lut = build_curve_lut(&points);

    for px in rgba.pixels_mut() {
        for ch in 0..3 {
            px[ch] = lut[px[ch] as usize];
        }
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_white_balance(
    state: State<'_, AppState>,
    tab_id: String,
    temperature: f32, // -100 (cool) … +100 (warm)
    tint: f32,        // -100 (magenta) … +100 (green)
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let mut rgba = img.to_rgba8();

    let t = temperature / 100.0;
    let g = tint / 100.0;
    let r_mult = 1.0 + t * 0.20;
    let g_mult = 1.0 + g * 0.10;
    let b_mult = 1.0 - t * 0.20;

    for px in rgba.pixels_mut() {
        px[0] = clamp_u8(px[0] as f32 * r_mult);
        px[1] = clamp_u8(px[1] as f32 * g_mult);
        px[2] = clamp_u8(px[2] as f32 * b_mult);
    }

    history.push(DynamicImage::ImageRgba8(rgba));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_sharpen(
    state: State<'_, AppState>,
    tab_id: String,
    amount: f32,   // 0–200 (100 = standard unsharp mask)
    radius: f32,   // 0.1–5.0
    threshold: u8, // 0–255
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let rgba = img.to_rgba8();
    let blurred = image::imageops::blur(&rgba, radius.max(0.1));
    let factor = amount / 100.0;
    let w = rgba.width();
    let h_px = rgba.height();
    let mut result = rgba.clone();

    for y in 0..h_px {
        for x in 0..w {
            let orig = *rgba.get_pixel(x, y);
            let blur = *blurred.get_pixel(x, y);
            let mut out = [0u8; 4];
            for ch in 0..3 {
                let diff = orig[ch] as i32 - blur[ch] as i32;
                out[ch] = if diff.unsigned_abs() as u8 > threshold {
                    clamp_u8(orig[ch] as f32 + factor * diff as f32)
                } else {
                    orig[ch]
                };
            }
            out[3] = orig[3];
            result.put_pixel(x, y, Rgba(out));
        }
    }

    history.push(DynamicImage::ImageRgba8(result));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

#[tauri::command]
pub fn adjust_denoise(
    state: State<'_, AppState>,
    tab_id: String,
    strength: f32, // 0–100
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let sigma = (strength / 100.0 * 3.0).max(0.1);
    let blurred = image::imageops::blur(&img.to_rgba8(), sigma);

    history.push(DynamicImage::ImageRgba8(blurred));
    let img = history.current().ok_or("State error")?;
    build_meta(img, "png", history.can_undo(), history.can_redo())
}

// ── unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve_lut_is_identity_for_two_endpoints() {
        let pts = [[0.0f32, 0.0], [1.0, 1.0]];
        let lut = build_curve_lut(&pts);
        assert_eq!(lut[0], 0);
        assert_eq!(lut[255], 255);
        assert!((lut[128] as i32 - 128).abs() <= 2);
    }

    #[test]
    fn curve_lut_brightens_midtones() {
        let pts = [[0.0f32, 0.0], [0.5, 0.75], [1.0, 1.0]];
        let lut = build_curve_lut(&pts);
        assert!(
            lut[128] > 150,
            "midtone should be brighter, got {}",
            lut[128]
        );
    }

    #[test]
    fn rgb_hsl_round_trip() {
        let (r, g, b) = (0.8f32, 0.3, 0.5);
        let (h, s, l) = rgb_to_hsl(r, g, b);
        let (r2, g2, b2) = hsl_to_rgb(h, s, l);
        assert!((r - r2).abs() < 1e-4);
        assert!((g - g2).abs() < 1e-4);
        assert!((b - b2).abs() < 1e-4);
    }

    // ── colour-space helpers ─────────────────────────────────────────────────

    // The helpers work on channels normalised to 0..1, not on raw bytes.

    #[test]
    fn grey_has_no_hue_and_no_saturation() {
        let (h, s, l) = rgb_to_hsl(0.5, 0.5, 0.5);
        assert_eq!(h, 0.0);
        assert_eq!(s, 0.0);
        assert!((l - 0.5).abs() < 1e-3);
    }

    #[test]
    fn black_and_white_sit_at_the_ends_of_lightness() {
        assert!((rgb_to_hsl(0.0, 0.0, 0.0).2 - 0.0).abs() < 1e-6);
        assert!((rgb_to_hsl(1.0, 1.0, 1.0).2 - 1.0).abs() < 1e-6);
    }

    #[test]
    fn primaries_land_on_their_expected_hue() {
        let (hr, ..) = rgb_to_hsl(1.0, 0.0, 0.0);
        let (hg, ..) = rgb_to_hsl(0.0, 1.0, 0.0);
        let (hb, ..) = rgb_to_hsl(0.0, 0.0, 1.0);
        assert!(hr.abs() < 1e-3 || (hr - 1.0).abs() < 1e-3);
        assert!((hg - 1.0 / 3.0).abs() < 1e-3);
        assert!((hb - 2.0 / 3.0).abs() < 1e-3);
    }

    #[test]
    fn hsl_round_trips_back_to_the_original_colour() {
        for (r, g, b) in [
            (1.0, 0.5, 0.0),
            (0.04, 0.78, 0.35),
            (0.0, 0.0, 1.0),
            (0.78, 0.78, 0.78),
        ] {
            let (h, s, l) = rgb_to_hsl(r, g, b);
            let (r2, g2, b2) = hsl_to_rgb(h, s, l);
            assert!((r - r2).abs() < 1e-3, "r {r} -> {r2}");
            assert!((g - g2).abs() < 1e-3, "g {g} -> {g2}");
            assert!((b - b2).abs() < 1e-3, "b {b} -> {b2}");
        }
    }

    #[test]
    fn a_zero_saturation_colour_converts_back_to_grey() {
        let (r, g, b) = hsl_to_rgb(0.5, 0.0, 0.5);
        assert!((r - g).abs() < 1e-3);
        assert!((g - b).abs() < 1e-3);
    }

    #[test]
    fn hue_channel_wraps_below_zero_and_above_one() {
        // t is normalised into [0,1) before the piecewise ramp is applied.
        assert!((hue_channel(0.2, 0.8, -0.1) - hue_channel(0.2, 0.8, 0.9)).abs() < 1e-6);
        assert!((hue_channel(0.2, 0.8, 1.1) - hue_channel(0.2, 0.8, 0.1)).abs() < 1e-6);
    }

    #[test]
    fn clamp_u8_pins_values_to_the_byte_range() {
        assert_eq!(clamp_u8(-1.0), 0);
        assert_eq!(clamp_u8(300.0), 255);
        // This one rounds rather than truncating.
        assert_eq!(clamp_u8(12.7), 13);
        assert_eq!(clamp_u8(12.2), 12);
    }

    // ── curve LUT ────────────────────────────────────────────────────────────

    #[test]
    fn an_empty_curve_is_the_identity() {
        let lut = build_curve_lut(&[]);
        for (i, &v) in lut.iter().enumerate() {
            assert_eq!(v, i as u8, "identity broken at {i}");
        }
    }

    #[test]
    fn a_straight_curve_is_the_identity() {
        let lut = build_curve_lut(&[[0.0, 0.0], [1.0, 1.0]]);
        for i in [0usize, 64, 128, 192, 255] {
            assert!(
                (lut[i] as i32 - i as i32).abs() <= 1,
                "expected ~{i}, got {}",
                lut[i]
            );
        }
    }

    #[test]
    fn an_inverting_curve_flips_the_ramp() {
        let lut = build_curve_lut(&[[0.0, 1.0], [1.0, 0.0]]);
        assert!(lut[0] > 250);
        assert!(lut[255] < 5);
    }

    #[test]
    fn the_lut_never_leaves_the_byte_range() {
        let lut = build_curve_lut(&[[0.0, 0.0], [0.25, 1.0], [0.75, 0.0], [1.0, 1.0]]);
        // u8 cannot exceed the range; assert the curve is defined everywhere instead.
        assert_eq!(lut.len(), 256);
    }

    #[test]
    fn unsorted_control_points_are_ordered_first() {
        let sorted = build_curve_lut(&[[0.0, 0.0], [0.5, 0.8], [1.0, 1.0]]);
        let shuffled = build_curve_lut(&[[1.0, 1.0], [0.0, 0.0], [0.5, 0.8]]);
        assert_eq!(sorted, shuffled);
    }

    #[test]
    fn a_curve_missing_its_endpoints_gets_them_added() {
        // A single mid point still yields a full 0..255 mapping.
        let lut = build_curve_lut(&[[0.5, 0.5]]);
        assert!(lut[0] < 10);
        assert!(lut[255] > 245);
    }

    #[test]
    fn a_raised_midpoint_brightens_the_midtones() {
        let identity = build_curve_lut(&[[0.0, 0.0], [1.0, 1.0]]);
        let raised = build_curve_lut(&[[0.0, 0.0], [0.5, 0.75], [1.0, 1.0]]);
        assert!(raised[128] > identity[128]);
    }

    #[test]
    fn a_flat_curve_maps_everything_to_one_level() {
        let lut = build_curve_lut(&[[0.0, 0.5], [1.0, 0.5]]);
        assert!(lut.iter().all(|&v| (v as i32 - 127).abs() <= 2));
    }
}

// ── command tests ─────────────────────────────────────────────────────────────
//
// Exécutent les vraies commandes via l'app mock (`crate::test_support`).

#[cfg(test)]
mod command_tests {
    use super::*;
    use crate::test_support::{gradient, solid, solid_alpha, Harness, TAB};

    #[test]
    fn every_adjustment_reports_a_missing_image() {
        let h = Harness::without_image();
        let t = || TAB.to_string();
        let errs = vec![
            adjust_brightness_contrast(h.state(), t(), 0.0, 0.0).unwrap_err(),
            adjust_exposure(h.state(), t(), 1.0).unwrap_err(),
            adjust_hue_saturation(h.state(), t(), 0.0, 0.0, 0.0).unwrap_err(),
            adjust_vibrance(h.state(), t(), 50.0).unwrap_err(),
            adjust_levels(h.state(), t(), 0, 255, 1.0, 0, 255).unwrap_err(),
            adjust_curves(h.state(), t(), vec![]).unwrap_err(),
            adjust_white_balance(h.state(), t(), 0.0, 0.0).unwrap_err(),
            adjust_sharpen(h.state(), t(), 100.0, 1.0, 0).unwrap_err(),
            adjust_denoise(h.state(), t(), 50.0).unwrap_err(),
        ];
        assert_eq!(errs.len(), 9);
        assert!(errs.iter().all(|e| e == "No image loaded"), "{errs:?}");
    }

    #[test]
    fn every_adjustment_rejects_an_unknown_tab() {
        let h = Harness::empty();
        assert_eq!(
            adjust_exposure(h.state(), TAB.into(), 1.0).unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            adjust_denoise(h.state(), TAB.into(), 10.0).unwrap_err(),
            "Tab not found"
        );
    }

    #[test]
    fn adjustments_preserve_the_alpha_channel() {
        let h = Harness::with_image(solid_alpha(2, 2, [80, 90, 100, 42]));

        adjust_brightness_contrast(h.state(), TAB.into(), 30.0, 20.0).unwrap();

        assert_eq!(h.pixel(0, 0)[3], 42);
    }

    // ── brightness / contrast ────────────────────────────────────────────────

    #[test]
    fn neutral_brightness_and_contrast_leave_the_pixels_alone() {
        let h = Harness::with_image(solid(2, 2, [40, 128, 210]));

        let meta = adjust_brightness_contrast(h.state(), TAB.into(), 0.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [40, 128, 210, 255]);
        assert!(meta.can_undo);
    }

    #[test]
    fn positive_brightness_lifts_every_channel() {
        let h = Harness::with_image(solid(2, 2, [100, 100, 100]));

        // +50 % de 255 = +127,5 de biais, arrondi au supérieur par `clamp_u8`.
        adjust_brightness_contrast(h.state(), TAB.into(), 50.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0)[0], 228);
    }

    #[test]
    fn negative_brightness_clamps_at_black() {
        let h = Harness::with_image(solid(2, 2, [50, 50, 50]));

        adjust_brightness_contrast(h.state(), TAB.into(), -100.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn contrast_pushes_values_away_from_the_midpoint() {
        let dark = Harness::with_image(solid(2, 2, [80, 80, 80]));
        let bright = Harness::with_image(solid(2, 2, [180, 180, 180]));

        adjust_brightness_contrast(dark.state(), TAB.into(), 0.0, 50.0).unwrap();
        adjust_brightness_contrast(bright.state(), TAB.into(), 0.0, 50.0).unwrap();

        assert!(dark.pixel(0, 0)[0] < 80);
        assert!(bright.pixel(0, 0)[0] > 180);
        // Le point milieu ne bouge pas.
        let mid = Harness::with_image(solid(2, 2, [128, 128, 128]));
        adjust_brightness_contrast(mid.state(), TAB.into(), 0.0, 50.0).unwrap();
        assert_eq!(mid.pixel(0, 0)[0], 128);
    }

    #[test]
    fn negative_contrast_pulls_towards_the_midpoint() {
        let h = Harness::with_image(solid(2, 2, [20, 20, 20]));

        adjust_brightness_contrast(h.state(), TAB.into(), 0.0, -60.0).unwrap();

        assert!(h.pixel(0, 0)[0] > 20);
    }

    // ── exposure ─────────────────────────────────────────────────────────────

    #[test]
    fn one_ev_of_exposure_doubles_the_channels() {
        let h = Harness::with_image(solid(2, 2, [10, 50, 100]));

        adjust_exposure(h.state(), TAB.into(), 1.0).unwrap();

        assert_eq!(h.pixel(0, 0), [20, 100, 200, 255]);
    }

    #[test]
    fn minus_one_ev_halves_the_channels() {
        let h = Harness::with_image(solid(2, 2, [10, 50, 100]));

        adjust_exposure(h.state(), TAB.into(), -1.0).unwrap();

        assert_eq!(h.pixel(0, 0), [5, 25, 50, 255]);
    }

    #[test]
    fn exposure_clips_at_white() {
        let h = Harness::with_image(solid(2, 2, [200, 200, 200]));

        adjust_exposure(h.state(), TAB.into(), 3.0).unwrap();

        assert_eq!(h.pixel(0, 0), [255, 255, 255, 255]);
    }

    #[test]
    fn zero_ev_is_a_no_op() {
        let h = Harness::with_image(solid(2, 2, [33, 66, 99]));

        adjust_exposure(h.state(), TAB.into(), 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [33, 66, 99, 255]);
    }

    // ── hue / saturation / lightness ─────────────────────────────────────────

    #[test]
    fn a_neutral_hsl_adjustment_round_trips_the_colour() {
        let h = Harness::with_image(solid(2, 2, [200, 100, 40]));

        adjust_hue_saturation(h.state(), TAB.into(), 0.0, 0.0, 0.0).unwrap();

        let [r, g, b, _] = h.pixel(0, 0);
        assert!(
            (r as i32 - 200).abs() <= 1
                && (g as i32 - 100).abs() <= 1
                && (b as i32 - 40).abs() <= 1,
            "aller-retour HSL trop lossy : {r} {g} {b}"
        );
    }

    #[test]
    fn rotating_the_hue_by_120_degrees_cycles_the_primaries() {
        let h = Harness::with_image(solid(2, 2, [255, 0, 0]));

        adjust_hue_saturation(h.state(), TAB.into(), 120.0, 0.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [0, 255, 0, 255]);
    }

    #[test]
    fn the_hue_wraps_around_the_colour_wheel() {
        let h = Harness::with_image(solid(2, 2, [0, 255, 0]));

        // Le vert est à 120° ; -180° donne 300°, soit le magenta.
        adjust_hue_saturation(h.state(), TAB.into(), -180.0, 0.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [255, 0, 255, 255]);
    }

    #[test]
    fn fully_desaturating_produces_a_grey() {
        let h = Harness::with_image(solid(2, 2, [200, 40, 90]));

        adjust_hue_saturation(h.state(), TAB.into(), 0.0, -100.0, 0.0).unwrap();

        let [r, g, b, _] = h.pixel(0, 0);
        assert_eq!([r, g], [g, b], "attendu un gris, obtenu {r} {g} {b}");
    }

    #[test]
    fn lightness_can_drive_the_image_to_white_or_black() {
        let up = Harness::with_image(solid(2, 2, [120, 60, 30]));
        let down = Harness::with_image(solid(2, 2, [120, 60, 30]));

        adjust_hue_saturation(up.state(), TAB.into(), 0.0, 0.0, 100.0).unwrap();
        adjust_hue_saturation(down.state(), TAB.into(), 0.0, 0.0, -100.0).unwrap();

        assert_eq!(up.pixel(0, 0), [255, 255, 255, 255]);
        assert_eq!(down.pixel(0, 0), [0, 0, 0, 255]);
    }

    // ── vibrance ─────────────────────────────────────────────────────────────

    #[test]
    fn vibrance_boosts_a_dull_colour_more_than_a_vivid_one() {
        let dull = Harness::with_image(solid(2, 2, [140, 120, 120]));
        let vivid = Harness::with_image(solid(2, 2, [255, 0, 0]));
        let spread = |h: &Harness| {
            let [r, _, b, _] = h.pixel(0, 0);
            r as i32 - b as i32
        };
        let dull_before = spread(&dull);
        let vivid_before = spread(&vivid);

        adjust_vibrance(dull.state(), TAB.into(), 50.0).unwrap();
        adjust_vibrance(vivid.state(), TAB.into(), 50.0).unwrap();

        assert!(
            spread(&dull) > dull_before,
            "la couleur terne doit gagner en saturation"
        );
        // Déjà au maximum : la couleur vive ne bouge plus.
        assert_eq!(spread(&vivid), vivid_before);
    }

    #[test]
    fn negative_vibrance_washes_the_colour_out() {
        let h = Harness::with_image(solid(2, 2, [200, 60, 60]));
        let before = h.pixel(0, 0)[0] as i32 - h.pixel(0, 0)[2] as i32;

        adjust_vibrance(h.state(), TAB.into(), -100.0).unwrap();

        let after = h.pixel(0, 0)[0] as i32 - h.pixel(0, 0)[2] as i32;
        assert!(after < before);
    }

    // ── levels ───────────────────────────────────────────────────────────────

    #[test]
    fn identity_levels_leave_the_ramp_alone() {
        let h = Harness::with_image(gradient(16, 1));
        let before = h.current();

        adjust_levels(h.state(), TAB.into(), 0, 255, 1.0, 0, 255).unwrap();

        assert_eq!(h.current(), before);
    }

    #[test]
    fn the_input_black_point_crushes_the_shadows() {
        let h = Harness::with_image(solid(2, 2, [50, 200, 200]));

        adjust_levels(h.state(), TAB.into(), 100, 255, 1.0, 0, 255).unwrap();

        assert_eq!(h.pixel(0, 0)[0], 0); // sous le point noir
        assert!(h.pixel(0, 0)[1] > 0);
    }

    #[test]
    fn the_input_white_point_blows_out_the_highlights() {
        let h = Harness::with_image(solid(2, 2, [200, 200, 200]));

        adjust_levels(h.state(), TAB.into(), 0, 150, 1.0, 0, 255).unwrap();

        assert_eq!(h.pixel(0, 0)[0], 255);
    }

    #[test]
    fn the_output_range_compresses_the_result() {
        let h = Harness::with_image(gradient(4, 1));

        adjust_levels(h.state(), TAB.into(), 0, 255, 1.0, 40, 200).unwrap();

        assert_eq!(h.pixel(0, 0)[0], 40); // le noir monte
        assert_eq!(h.pixel(3, 0)[0], 200); // le blanc descend
    }

    #[test]
    fn a_gamma_above_one_brightens_the_midtones() {
        let h = Harness::with_image(solid(2, 2, [128, 128, 128]));

        adjust_levels(h.state(), TAB.into(), 0, 255, 2.0, 0, 255).unwrap();

        assert!(h.pixel(0, 0)[0] > 128);
    }

    #[test]
    fn a_degenerate_level_range_does_not_divide_by_zero() {
        let h = Harness::with_image(gradient(4, 1));

        // in_black == in_white, et un gamma nul : les deux sont bornés.
        adjust_levels(h.state(), TAB.into(), 128, 128, 0.0, 0, 255).unwrap();

        assert_eq!(h.history_len(), 2);
    }

    // ── curves ───────────────────────────────────────────────────────────────

    #[test]
    fn an_empty_curve_leaves_the_image_alone() {
        let h = Harness::with_image(gradient(8, 1));
        let before = h.current();

        adjust_curves(h.state(), TAB.into(), vec![]).unwrap();

        assert_eq!(h.current(), before);
    }

    #[test]
    fn an_inverting_curve_flips_the_image() {
        let h = Harness::with_image(solid(2, 2, [0, 128, 255]));

        adjust_curves(h.state(), TAB.into(), vec![[0.0, 1.0], [1.0, 0.0]]).unwrap();

        let [r, g, b, _] = h.pixel(0, 0);
        assert_eq!(r, 255);
        assert!((g as i32 - 127).abs() <= 1);
        assert_eq!(b, 0);
    }

    #[test]
    fn a_raised_midpoint_curve_brightens_the_midtones() {
        let h = Harness::with_image(solid(2, 2, [128, 128, 128]));

        adjust_curves(
            h.state(),
            TAB.into(),
            vec![[0.0, 0.0], [0.5, 0.75], [1.0, 1.0]],
        )
        .unwrap();

        assert!(h.pixel(0, 0)[0] > 150);
    }

    // ── white balance ────────────────────────────────────────────────────────

    #[test]
    fn a_warm_balance_boosts_red_and_cuts_blue() {
        let h = Harness::with_image(solid(2, 2, [100, 100, 100]));

        adjust_white_balance(h.state(), TAB.into(), 100.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [120, 100, 80, 255]);
    }

    #[test]
    fn a_cool_balance_does_the_opposite() {
        let h = Harness::with_image(solid(2, 2, [100, 100, 100]));

        adjust_white_balance(h.state(), TAB.into(), -100.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [80, 100, 120, 255]);
    }

    #[test]
    fn the_tint_moves_only_the_green_channel() {
        let h = Harness::with_image(solid(2, 2, [100, 100, 100]));

        adjust_white_balance(h.state(), TAB.into(), 0.0, 100.0).unwrap();

        assert_eq!(h.pixel(0, 0), [100, 110, 100, 255]);
    }

    #[test]
    fn a_neutral_white_balance_is_a_no_op() {
        let h = Harness::with_image(solid(2, 2, [77, 88, 99]));

        adjust_white_balance(h.state(), TAB.into(), 0.0, 0.0).unwrap();

        assert_eq!(h.pixel(0, 0), [77, 88, 99, 255]);
    }

    // ── sharpen ──────────────────────────────────────────────────────────────

    #[test]
    fn sharpening_leaves_a_flat_image_alone() {
        let h = Harness::with_image(solid(8, 8, [120, 120, 120]));

        adjust_sharpen(h.state(), TAB.into(), 150.0, 1.5, 0).unwrap();

        assert_eq!(h.pixel(4, 4), [120, 120, 120, 255]);
    }

    #[test]
    fn sharpening_accentuates_an_edge() {
        let h = Harness::with_image(gradient(16, 3));
        let before_dark = h.pixel(1, 1)[0];

        adjust_sharpen(h.state(), TAB.into(), 200.0, 2.0, 0).unwrap();

        assert_ne!(h.pixel(1, 1)[0], before_dark);
    }

    #[test]
    fn a_high_threshold_suppresses_the_sharpening() {
        let h = Harness::with_image(gradient(16, 3));
        let before = h.current();

        adjust_sharpen(h.state(), TAB.into(), 200.0, 2.0, 255).unwrap();

        assert_eq!(h.current(), before);
    }

    #[test]
    fn a_zero_radius_sharpen_is_still_valid() {
        let h = Harness::with_image(gradient(8, 2));

        adjust_sharpen(h.state(), TAB.into(), 100.0, 0.0, 0).unwrap();

        assert_eq!(h.history_len(), 2);
    }

    // ── denoise ──────────────────────────────────────────────────────────────

    #[test]
    fn denoising_smooths_a_noisy_image() {
        let h = Harness::with_image(crate::test_support::checker(
            8,
            8,
            [0, 0, 0],
            [255, 255, 255],
        ));

        adjust_denoise(h.state(), TAB.into(), 100.0).unwrap();

        let v = h.pixel(4, 4)[0];
        assert!((60..=195).contains(&v), "attendu un lissage, obtenu {v}");
    }

    #[test]
    fn a_zero_strength_denoise_barely_touches_the_image() {
        let h = Harness::with_image(solid(6, 6, [70, 80, 90]));

        let meta = adjust_denoise(h.state(), TAB.into(), 0.0).unwrap();

        assert_eq!((meta.width, meta.height), (6, 6));
        assert_eq!(h.pixel(3, 3), [70, 80, 90, 255]);
    }
}
