use image::imageops;
use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn crop_image(
    state: State<'_, AppState>,
    tab_id: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    if x + width > img.width() || y + height > img.height() {
        return Err(format!(
            "Crop rect ({x},{y},{width},{height}) exceeds image bounds ({}x{})",
            img.width(),
            img.height()
        ));
    }

    let cropped = img.crop_imm(x, y, width, height);
    history.push(cropped);
    let img = history.current().ok_or("State error after crop")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn canvas_resize_image(
    state: State<'_, AppState>,
    tab_id: String,
    width: u32,
    height: u32,
    anchor: String,
    fill: [u8; 4],
) -> Result<ImageMeta, String> {
    if width == 0 || height == 0 {
        return Err("Width and height must be greater than 0".to_string());
    }

    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    let orig_w = img.width();
    let orig_h = img.height();

    if width < orig_w || height < orig_h {
        return Err(format!(
            "Canvas size ({width}×{height}) must be >= image size ({orig_w}×{orig_h})"
        ));
    }

    let (off_x, off_y) = match anchor.as_str() {
        "top-left" => (0, 0),
        "top-center" => ((width - orig_w) / 2, 0),
        "top-right" => (width - orig_w, 0),
        "middle-left" => (0, (height - orig_h) / 2),
        "center" => ((width - orig_w) / 2, (height - orig_h) / 2),
        "middle-right" => (width - orig_w, (height - orig_h) / 2),
        "bottom-left" => (0, height - orig_h),
        "bottom-center" => ((width - orig_w) / 2, height - orig_h),
        "bottom-right" => (width - orig_w, height - orig_h),
        other => return Err(format!("Unknown anchor: {other}")),
    };

    let mut canvas = image::RgbaImage::from_pixel(width, height, image::Rgba(fill));
    image::imageops::overlay(&mut canvas, &img.to_rgba8(), off_x as i64, off_y as i64);

    history.push(image::DynamicImage::ImageRgba8(canvas));
    let img = history.current().ok_or("State error after canvas resize")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn resize_image(
    state: State<'_, AppState>,
    tab_id: String,
    width: u32,
    height: u32,
) -> Result<ImageMeta, String> {
    if width == 0 || height == 0 {
        return Err("Width and height must be greater than 0".to_string());
    }

    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let resized = img.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
    history.push(resized);
    let img = history.current().ok_or("State error after resize")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn flip_image(
    state: State<'_, AppState>,
    tab_id: String,
    direction: String,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let flipped = match direction.as_str() {
        "horizontal" => img.fliph(),
        "vertical" => img.flipv(),
        other => return Err(format!("Unknown flip direction: {other}")),
    };

    history.push(flipped);
    let img = history.current().ok_or("State error after flip")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[tauri::command]
pub fn rotate_image(
    state: State<'_, AppState>,
    tab_id: String,
    degrees: f64,
) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    let rotated = match degrees {
        d if (d - 90.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate90(&img.to_rgba8()))
        }
        d if (d - 180.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate180(&img.to_rgba8()))
        }
        d if (d - 270.0).abs() < f64::EPSILON || (d + 90.0).abs() < f64::EPSILON => {
            image::DynamicImage::ImageRgba8(imageops::rotate270(&img.to_rgba8()))
        }
        d => {
            use imageproc::geometric_transformations::{rotate_about_center, Interpolation};
            let rgba = img.to_rgba8();
            let rad = d.to_radians() as f32;
            let rotated = rotate_about_center(
                &rgba,
                rad,
                Interpolation::Bilinear,
                image::Rgba([0, 0, 0, 0]),
            );
            image::DynamicImage::ImageRgba8(rotated)
        }
    };

    history.push(rotated);
    let img = history.current().ok_or("State error after rotate")?;
    let meta = build_meta(img, "png", history.can_undo(), history.can_redo())?;
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{checker, gradient, solid, Harness, TAB};

    // ── crop ─────────────────────────────────────────────────────────────────

    #[test]
    fn crop_keeps_the_requested_rectangle() {
        let h = Harness::with_image(gradient(10, 10));
        let expected = h.pixel(4, 2);

        let meta = crop_image(h.state(), TAB.into(), 4, 2, 3, 5).unwrap();

        assert_eq!((meta.width, meta.height), (3, 5));
        assert_eq!(h.pixel(0, 0), expected);
        assert_eq!(h.history_len(), 2);
    }

    #[test]
    fn a_crop_flush_with_the_edge_is_allowed() {
        let h = Harness::with_image(solid(10, 10, [1, 2, 3]));

        let meta = crop_image(h.state(), TAB.into(), 5, 5, 5, 5).unwrap();

        assert_eq!((meta.width, meta.height), (5, 5));
    }

    #[test]
    fn a_crop_past_the_edge_is_refused() {
        let h = Harness::with_image(solid(10, 10, [1, 2, 3]));

        let err = crop_image(h.state(), TAB.into(), 5, 0, 6, 5).unwrap_err();

        assert!(err.contains("exceeds image bounds"), "{err}");
        assert_eq!(h.history_len(), 1); // rien n'a été empilé
    }

    #[test]
    fn crop_needs_a_tab_and_an_image() {
        assert_eq!(
            crop_image(Harness::empty().state(), TAB.into(), 0, 0, 1, 1).unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            crop_image(Harness::without_image().state(), TAB.into(), 0, 0, 1, 1).unwrap_err(),
            "No image loaded"
        );
    }

    // ── canvas resize ────────────────────────────────────────────────────────

    /// Position du coin haut-gauche de l'image d'origine dans le nouveau canevas,
    /// repérée par la seule zone non remplie.
    fn origin_offset(h: &Harness, fill: [u8; 4]) -> (u32, u32) {
        let img = h.current();
        for y in 0..img.height() {
            for x in 0..img.width() {
                if img.get_pixel(x, y).0 != fill {
                    return (x, y);
                }
            }
        }
        panic!("image d'origine introuvable dans le canevas");
    }

    #[test]
    fn canvas_resize_places_the_image_at_each_anchor() {
        let fill = [0, 0, 0, 255];
        // Image 2×2 dans un canevas 6×6 : marges de 4 px, centre à 2.
        let cases = [
            ("top-left", (0, 0)),
            ("top-center", (2, 0)),
            ("top-right", (4, 0)),
            ("middle-left", (0, 2)),
            ("center", (2, 2)),
            ("middle-right", (4, 2)),
            ("bottom-left", (0, 4)),
            ("bottom-center", (2, 4)),
            ("bottom-right", (4, 4)),
        ];
        for (anchor, expected) in cases {
            let h = Harness::with_image(solid(2, 2, [255, 255, 255]));
            let meta =
                canvas_resize_image(h.state(), TAB.into(), 6, 6, anchor.into(), fill).unwrap();
            assert_eq!((meta.width, meta.height), (6, 6), "{anchor}");
            assert_eq!(origin_offset(&h, fill), expected, "ancre {anchor}");
        }
    }

    #[test]
    fn canvas_resize_paints_the_margin_with_the_fill_colour() {
        let h = Harness::with_image(solid(2, 2, [255, 255, 255]));

        canvas_resize_image(
            h.state(),
            TAB.into(),
            4,
            4,
            "top-left".into(),
            [9, 8, 7, 255],
        )
        .unwrap();

        assert_eq!(h.pixel(3, 3), [9, 8, 7, 255]);
        assert_eq!(h.pixel(0, 0), [255, 255, 255, 255]);
    }

    #[test]
    fn canvas_resize_rejects_a_zero_dimension() {
        let h = Harness::with_image(solid(2, 2, [1, 1, 1]));

        assert!(canvas_resize_image(h.state(), TAB.into(), 0, 4, "center".into(), [0; 4]).is_err());
        assert!(canvas_resize_image(h.state(), TAB.into(), 4, 0, "center".into(), [0; 4]).is_err());
    }

    #[test]
    fn canvas_resize_refuses_to_shrink() {
        let h = Harness::with_image(solid(8, 8, [1, 1, 1]));

        let err =
            canvas_resize_image(h.state(), TAB.into(), 4, 8, "center".into(), [0; 4]).unwrap_err();

        assert!(err.contains("must be >= image size"), "{err}");
    }

    #[test]
    fn canvas_resize_rejects_an_unknown_anchor() {
        let h = Harness::with_image(solid(2, 2, [1, 1, 1]));

        let err =
            canvas_resize_image(h.state(), TAB.into(), 4, 4, "middle".into(), [0; 4]).unwrap_err();

        assert_eq!(err, "Unknown anchor: middle");
    }

    #[test]
    fn canvas_resize_needs_a_tab_and_an_image() {
        assert_eq!(
            canvas_resize_image(
                Harness::empty().state(),
                TAB.into(),
                4,
                4,
                "center".into(),
                [0; 4]
            )
            .unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            canvas_resize_image(
                Harness::without_image().state(),
                TAB.into(),
                4,
                4,
                "center".into(),
                [0; 4]
            )
            .unwrap_err(),
            "No image loaded"
        );
    }

    // ── resize ───────────────────────────────────────────────────────────────

    #[test]
    fn resize_scales_to_the_exact_size() {
        let h = Harness::with_image(solid(8, 4, [30, 60, 90]));

        let meta = resize_image(h.state(), TAB.into(), 20, 5).unwrap();

        assert_eq!((meta.width, meta.height), (20, 5));
        // Une image unie reste unie après ré-échantillonnage.
        assert_eq!(h.pixel(10, 2), [30, 60, 90, 255]);
    }

    #[test]
    fn resize_rejects_a_zero_dimension() {
        let h = Harness::with_image(solid(4, 4, [1, 1, 1]));

        assert!(resize_image(h.state(), TAB.into(), 0, 4).is_err());
        assert!(resize_image(h.state(), TAB.into(), 4, 0).is_err());
        assert_eq!(h.history_len(), 1);
    }

    #[test]
    fn resize_needs_a_tab_and_an_image() {
        assert_eq!(
            resize_image(Harness::empty().state(), TAB.into(), 2, 2).unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            resize_image(Harness::without_image().state(), TAB.into(), 2, 2).unwrap_err(),
            "No image loaded"
        );
    }

    // ── flip ─────────────────────────────────────────────────────────────────

    #[test]
    fn flipping_horizontally_mirrors_the_columns() {
        let h = Harness::with_image(gradient(4, 1));
        let left = h.pixel(0, 0);
        let right = h.pixel(3, 0);

        flip_image(h.state(), TAB.into(), "horizontal".into()).unwrap();

        assert_eq!(h.pixel(0, 0), right);
        assert_eq!(h.pixel(3, 0), left);
    }

    #[test]
    fn flipping_vertically_mirrors_the_rows() {
        let h = Harness::with_image(checker(2, 2, [0, 0, 0], [255, 255, 255]));
        let top = h.pixel(0, 0);

        flip_image(h.state(), TAB.into(), "vertical".into()).unwrap();

        assert_ne!(h.pixel(0, 0), top);
        assert_eq!(h.pixel(0, 1), top);
    }

    #[test]
    fn flipping_twice_restores_the_original() {
        let h = Harness::with_image(gradient(5, 3));
        let before = h.current();

        flip_image(h.state(), TAB.into(), "horizontal".into()).unwrap();
        flip_image(h.state(), TAB.into(), "horizontal".into()).unwrap();

        assert_eq!(h.current(), before);
    }

    #[test]
    fn flip_rejects_an_unknown_direction() {
        let h = Harness::with_image(solid(2, 2, [1, 1, 1]));

        assert_eq!(
            flip_image(h.state(), TAB.into(), "diagonal".into()).unwrap_err(),
            "Unknown flip direction: diagonal"
        );
    }

    #[test]
    fn flip_needs_a_tab_and_an_image() {
        assert_eq!(
            flip_image(Harness::empty().state(), TAB.into(), "horizontal".into()).unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            flip_image(
                Harness::without_image().state(),
                TAB.into(),
                "horizontal".into()
            )
            .unwrap_err(),
            "No image loaded"
        );
    }

    // ── rotate ───────────────────────────────────────────────────────────────

    #[test]
    fn rotating_90_degrees_swaps_the_dimensions() {
        let h = Harness::with_image(solid(6, 3, [10, 20, 30]));

        let meta = rotate_image(h.state(), TAB.into(), 90.0).unwrap();

        assert_eq!((meta.width, meta.height), (3, 6));
    }

    #[test]
    fn rotating_180_degrees_keeps_the_dimensions() {
        let h = Harness::with_image(gradient(4, 2));
        let left = h.pixel(0, 0);

        let meta = rotate_image(h.state(), TAB.into(), 180.0).unwrap();

        assert_eq!((meta.width, meta.height), (4, 2));
        assert_eq!(h.pixel(3, 1), left);
    }

    #[test]
    fn rotating_270_degrees_swaps_the_dimensions() {
        let h = Harness::with_image(solid(6, 3, [10, 20, 30]));

        let meta = rotate_image(h.state(), TAB.into(), 270.0).unwrap();

        assert_eq!((meta.width, meta.height), (3, 6));
    }

    #[test]
    fn minus_ninety_is_the_same_as_270() {
        let a = Harness::with_image(gradient(5, 3));
        let b = Harness::with_image(gradient(5, 3));

        rotate_image(a.state(), TAB.into(), -90.0).unwrap();
        rotate_image(b.state(), TAB.into(), 270.0).unwrap();

        assert_eq!(a.current(), b.current());
    }

    #[test]
    fn four_quarter_turns_restore_the_original() {
        let h = Harness::with_image(gradient(4, 3));
        let before = h.current();

        for _ in 0..4 {
            rotate_image(h.state(), TAB.into(), 90.0).unwrap();
        }

        assert_eq!(h.current(), before);
    }

    #[test]
    fn an_arbitrary_angle_goes_through_the_interpolating_path() {
        let h = Harness::with_image(solid(9, 9, [200, 100, 50]));

        let meta = rotate_image(h.state(), TAB.into(), 45.0).unwrap();

        // La rotation libre garde le cadre et remplit les coins en transparent.
        assert_eq!((meta.width, meta.height), (9, 9));
        assert_eq!(h.pixel(0, 0)[3], 0);
        assert_eq!(h.pixel(4, 4), [200, 100, 50, 255]);
    }

    #[test]
    fn rotate_needs_a_tab_and_an_image() {
        assert_eq!(
            rotate_image(Harness::empty().state(), TAB.into(), 90.0).unwrap_err(),
            "Tab not found"
        );
        assert_eq!(
            rotate_image(Harness::without_image().state(), TAB.into(), 90.0).unwrap_err(),
            "No image loaded"
        );
    }
}
