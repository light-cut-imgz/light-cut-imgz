use image::ImageFormat;
use std::io::BufWriter;
use std::path::Path;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

fn format_from_str(format: &str) -> Result<ImageFormat, String> {
    match format {
        "png" => Ok(ImageFormat::Png),
        "jpeg" | "jpg" => Ok(ImageFormat::Jpeg),
        "webp" => Ok(ImageFormat::WebP),
        "bmp" => Ok(ImageFormat::Bmp),
        "tiff" | "tif" => Ok(ImageFormat::Tiff),
        other => Err(format!("Unsupported format: {other}")),
    }
}

fn extension_for(fmt: ImageFormat) -> &'static str {
    match fmt {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Tiff => "tiff",
        _ => "bin",
    }
}

/// Écrit `img` à `path` dans le format demandé.
///
/// Séparé de la commande : celle-ci ne fait qu'ouvrir la boîte de dialogue, tout ce qui
/// suit le choix du fichier est ici et donc testable sans interface.
pub fn write_image(
    img: &image::DynamicImage,
    path: &Path,
    img_format: ImageFormat,
    quality: Option<u8>,
) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);

    match img_format {
        ImageFormat::Jpeg => {
            let q = quality.unwrap_or(90).clamp(1, 100);
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, q);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        ImageFormat::WebP => {
            let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut writer);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        _ => {
            img.write_to(&mut writer, img_format)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn export_image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
    format: String,
    quality: Option<u8>,
) -> Result<(), String> {
    let img_format = format_from_str(&format)?;
    let ext = extension_for(img_format);

    let path = app
        .dialog()
        .file()
        .add_filter("Image", &[ext])
        .set_file_name(format!("export.{ext}"))
        .blocking_save_file();

    let Some(path) = path else {
        return Ok(());
    };

    let path_buf = path.into_path().map_err(|e| e.to_string())?;

    let map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;

    write_image(img, &path_buf, img_format, quality)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_from_str_maps_known_formats() {
        assert!(matches!(format_from_str("png"), Ok(ImageFormat::Png)));
        assert!(matches!(format_from_str("jpeg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_str("jpg"), Ok(ImageFormat::Jpeg)));
        assert!(matches!(format_from_str("webp"), Ok(ImageFormat::WebP)));
        assert!(matches!(format_from_str("bmp"), Ok(ImageFormat::Bmp)));
        assert!(matches!(format_from_str("tiff"), Ok(ImageFormat::Tiff)));
        assert!(matches!(format_from_str("tif"), Ok(ImageFormat::Tiff)));
    }

    #[test]
    fn format_from_str_rejects_unknown() {
        assert!(format_from_str("gif").is_err());
        assert!(format_from_str("svg").is_err());
        assert!(format_from_str("").is_err());
    }
    #[test]
    fn maps_every_supported_format_name() {
        assert_eq!(format_from_str("png").unwrap(), ImageFormat::Png);
        assert_eq!(format_from_str("jpeg").unwrap(), ImageFormat::Jpeg);
        assert_eq!(format_from_str("jpg").unwrap(), ImageFormat::Jpeg);
        assert_eq!(format_from_str("webp").unwrap(), ImageFormat::WebP);
        assert_eq!(format_from_str("bmp").unwrap(), ImageFormat::Bmp);
        assert_eq!(format_from_str("tiff").unwrap(), ImageFormat::Tiff);
        assert_eq!(format_from_str("tif").unwrap(), ImageFormat::Tiff);
    }

    #[test]
    fn rejects_an_unknown_format_by_name() {
        let err = format_from_str("gif").unwrap_err();
        assert!(err.contains("gif"), "unhelpful message: {err}");
    }

    #[test]
    fn is_case_sensitive_about_format_names() {
        assert!(format_from_str("PNG").is_err());
    }

    #[test]
    fn gives_every_format_its_canonical_extension() {
        assert_eq!(extension_for(ImageFormat::Png), "png");
        assert_eq!(extension_for(ImageFormat::Jpeg), "jpg");
        assert_eq!(extension_for(ImageFormat::WebP), "webp");
        assert_eq!(extension_for(ImageFormat::Bmp), "bmp");
        assert_eq!(extension_for(ImageFormat::Tiff), "tiff");
    }

    #[test]
    fn falls_back_to_bin_for_a_format_it_does_not_write() {
        assert_eq!(extension_for(ImageFormat::Gif), "bin");
    }

    #[test]
    fn every_accepted_name_round_trips_to_a_writable_extension() {
        for name in ["png", "jpeg", "webp", "bmp", "tiff"] {
            let fmt = format_from_str(name).unwrap();
            assert_ne!(extension_for(fmt), "bin", "{name} has no extension");
        }
    }

    // ── écriture sur disque ──────────────────────────────────────────────────

    use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
    use std::path::PathBuf;

    fn img(w: u32, h: u32) -> DynamicImage {
        let mut i = RgbaImage::new(w, h);
        for p in i.pixels_mut() {
            *p = Rgba([200, 100, 50, 255]);
        }
        DynamicImage::ImageRgba8(i)
    }

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("imgz-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn writes_every_supported_format_back_readable() {
        for name in ["png", "jpeg", "webp", "bmp", "tiff"] {
            let fmt = format_from_str(name).unwrap();
            let path = temp_path(&format!("out.{}", extension_for(fmt)));

            write_image(&img(6, 4), &path, fmt, None).unwrap();

            let read = image::open(&path).unwrap_or_else(|e| panic!("{name} illisible : {e}"));
            assert_eq!(read.dimensions(), (6, 4), "{name}");
        }
    }

    #[test]
    fn the_jpeg_quality_changes_the_file_size() {
        let low = temp_path("low.jpg");
        let high = temp_path("high.jpg");
        // Un dégradé : une image unie compresse pareil quelle que soit la qualité.
        let mut i = RgbaImage::new(64, 64);
        for (x, y, p) in i.enumerate_pixels_mut() {
            *p = Rgba([(x * 4) as u8, (y * 4) as u8, ((x + y) * 2) as u8, 255]);
        }
        let gradient = DynamicImage::ImageRgba8(i);

        write_image(&gradient, &low, ImageFormat::Jpeg, Some(5)).unwrap();
        write_image(&gradient, &high, ImageFormat::Jpeg, Some(100)).unwrap();

        let low_size = std::fs::metadata(&low).unwrap().len();
        let high_size = std::fs::metadata(&high).unwrap().len();
        assert!(
            low_size < high_size,
            "{low_size} devrait être < {high_size}"
        );
    }

    #[test]
    fn an_out_of_range_jpeg_quality_is_clamped() {
        let path = temp_path("clamped.jpg");

        write_image(&img(8, 8), &path, ImageFormat::Jpeg, Some(0)).unwrap();

        assert!(image::open(&path).is_ok());
    }

    #[test]
    fn the_jpeg_quality_defaults_when_unset() {
        let path = temp_path("default.jpg");

        write_image(&img(8, 8), &path, ImageFormat::Jpeg, None).unwrap();

        assert!(std::fs::metadata(&path).unwrap().len() > 0);
    }

    #[test]
    fn webp_is_written_losslessly() {
        let path = temp_path("out.webp");

        write_image(&img(4, 4), &path, ImageFormat::WebP, None).unwrap();

        let read = image::open(&path).unwrap().to_rgba8();
        assert_eq!(read.get_pixel(0, 0).0, [200, 100, 50, 255]);
    }

    #[test]
    fn an_unwritable_destination_surfaces_the_error() {
        let path = PathBuf::from("/nowhere-at-all/out.png");

        assert!(write_image(&img(2, 2), &path, ImageFormat::Png, None).is_err());
    }
}
