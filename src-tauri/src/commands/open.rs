use base64::Engine;
use image::ImageFormat;
use serde::Serialize;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{AppHistory, AppState};

#[derive(Serialize, Clone, Debug)]
pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub preview: String,
    pub can_undo: bool,
    pub can_redo: bool,
    pub filename: Option<String>,
    pub path: Option<String>,
}

#[derive(Serialize)]
pub struct OpenedImage {
    pub tab_id: String,
    pub meta: ImageMeta,
}

pub fn encode_preview(img: &image::DynamicImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/png;base64,{b64}"))
}

pub fn build_meta(
    img: &image::DynamicImage,
    format: &str,
    can_undo: bool,
    can_redo: bool,
) -> Result<ImageMeta, String> {
    Ok(ImageMeta {
        width: img.width(),
        height: img.height(),
        format: format.to_string(),
        preview: encode_preview(img)?,
        can_undo,
        can_redo,
        filename: None,
        path: None,
    })
}

fn load_image_from_path(path_buf: PathBuf) -> Result<(String, ImageMeta, AppHistory), String> {
    let filename = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    let path_str = path_buf.to_str().map(|s| s.to_string());

    let format = image::ImageReader::open(&path_buf)
        .map_err(|e| e.to_string())?
        .format()
        .map(|f| format!("{f:?}").to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    let img = image::open(&path_buf).map_err(|e| e.to_string())?;

    let mut meta = build_meta(&img, &format, false, false)?;
    meta.filename = filename;
    meta.path = path_str;

    let mut history = AppHistory::new();
    history.source_path = Some(path_buf);
    history.open(img);

    Ok((Uuid::new_v4().to_string(), meta, history))
}

fn batch_insert(
    loaded: Vec<(String, ImageMeta, AppHistory)>,
    state: &State<'_, AppState>,
) -> Result<Vec<OpenedImage>, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::with_capacity(loaded.len());
    for (tab_id, meta, history) in loaded {
        map.insert(tab_id.clone(), history);
        results.push(OpenedImage { tab_id, meta });
    }
    Ok(results)
}

#[tauri::command]
pub async fn open_images(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<OpenedImage>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        )
        .blocking_pick_files();

    let Some(paths) = files else {
        return Ok(vec![]);
    };

    let mut loaded = Vec::new();
    for path in paths {
        let path_buf = path.into_path().map_err(|e| e.to_string())?;
        loaded.push(load_image_from_path(path_buf)?);
    }

    batch_insert(loaded, &state)
}

#[tauri::command]
pub async fn open_images_by_paths(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<OpenedImage>, String> {
    const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"];

    let mut loaded = Vec::new();
    for path_str in paths {
        let path_buf = PathBuf::from(&path_str);
        let ext = path_buf
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Ok(item) = load_image_from_path(path_buf) {
            loaded.push(item);
        }
    }

    if loaded.is_empty() {
        return Ok(vec![]);
    }

    batch_insert(loaded, &state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn solid_image(w: u32, h: u32) -> DynamicImage {
        let mut img = RgbaImage::new(w, h);
        for pixel in img.pixels_mut() {
            *pixel = Rgba([255, 0, 0, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn encode_preview_produces_data_url() {
        let img = solid_image(10, 10);
        let result = encode_preview(&img).unwrap();
        assert!(result.starts_with("data:image/png;base64,"));
        assert!(result.len() > 22);
    }

    #[test]
    fn build_meta_returns_correct_dimensions() {
        let img = solid_image(100, 80);
        let meta = build_meta(&img, "png", false, false).unwrap();
        assert_eq!(meta.width, 100);
        assert_eq!(meta.height, 80);
        assert_eq!(meta.format, "png");
        assert!(meta.preview.starts_with("data:image/png;base64,"));
        assert!(meta.filename.is_none());
        assert!(meta.path.is_none());
    }
    #[test]
    fn encodes_a_preview_as_a_png_data_url() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(2, 2));
        let preview = encode_preview(&img).unwrap();

        assert!(preview.starts_with("data:image/png;base64,"));
        assert!(preview.len() > "data:image/png;base64,".len());
    }

    #[test]
    fn meta_reports_the_image_dimensions_and_flags() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(7, 3));

        let meta = build_meta(&img, "png", true, false).unwrap();

        assert_eq!(meta.width, 7);
        assert_eq!(meta.height, 3);
        assert_eq!(meta.format, "png");
        assert!(meta.can_undo);
        assert!(!meta.can_redo);
    }

    #[test]
    fn meta_leaves_the_file_details_unset() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(1, 1));

        let meta = build_meta(&img, "jpeg", false, true).unwrap();

        assert!(meta.filename.is_none());
        assert!(meta.path.is_none());
        assert!(meta.can_redo);
    }

    #[test]
    fn meta_always_carries_a_preview() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(4, 4));
        let meta = build_meta(&img, "png", false, false).unwrap();
        assert!(meta.preview.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn meta_serialises_with_snake_case_undo_flags() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::new(1, 1));
        let meta = build_meta(&img, "png", true, true).unwrap();

        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("\"can_undo\":true"));
        assert!(json.contains("\"can_redo\":true"));
    }

    // ── chargement depuis le disque ──────────────────────────────────────────

    use crate::test_support::Harness;

    /// Écrit `img` dans un fichier temporaire unique et renvoie son chemin.
    fn temp_image(ext: &str, img: &DynamicImage) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("imgz-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("pic.{ext}"));
        img.save(&path).unwrap();
        path
    }

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    #[test]
    fn loading_a_file_fills_in_its_name_format_and_history() {
        let path = temp_image("png", &solid_image(6, 4));

        let (tab_id, meta, history) = load_image_from_path(path.clone()).unwrap();

        assert!(!tab_id.is_empty());
        assert_eq!((meta.width, meta.height), (6, 4));
        assert_eq!(meta.format, "png");
        assert_eq!(meta.filename.as_deref(), Some("pic.png"));
        assert_eq!(meta.path.as_deref(), path.to_str());
        assert!(!meta.can_undo && !meta.can_redo);
        assert_eq!(history.source_path, Some(path));
        assert_eq!(history.entries.len(), 1);
    }

    #[test]
    fn loading_a_missing_file_fails() {
        assert!(load_image_from_path(PathBuf::from("/nowhere/nope.png")).is_err());
    }

    #[test]
    fn loading_a_file_that_is_not_an_image_fails() {
        let dir = std::env::temp_dir().join(format!("imgz-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fake.png");
        std::fs::write(&path, b"pas une image").unwrap();

        assert!(load_image_from_path(path).is_err());
    }

    #[test]
    fn opening_by_path_creates_one_tab_per_image() {
        let h = Harness::empty();
        let a = temp_image("png", &solid_image(3, 3));
        let b = temp_image("bmp", &solid_image(5, 2));

        let opened = block_on(open_images_by_paths(
            h.state(),
            vec![
                a.to_str().unwrap().to_string(),
                b.to_str().unwrap().to_string(),
            ],
        ))
        .unwrap();

        assert_eq!(opened.len(), 2);
        assert_eq!(opened[0].meta.width, 3);
        assert_eq!(opened[1].meta.format, "bmp");
        let state = h.state();
        let map = state.0.lock().unwrap();
        assert_eq!(map.len(), 2);
        assert!(map.contains_key(&opened[0].tab_id));
    }

    #[test]
    fn opening_by_path_skips_unsupported_extensions() {
        let h = Harness::empty();
        let ok = temp_image("png", &solid_image(2, 2));

        let opened = block_on(open_images_by_paths(
            h.state(),
            vec![
                "/tmp/notes.txt".to_string(),
                "/tmp/movie.mp4".to_string(),
                "/tmp/no-extension".to_string(),
                ok.to_str().unwrap().to_string(),
            ],
        ))
        .unwrap();

        assert_eq!(opened.len(), 1);
    }

    #[test]
    fn the_extension_check_is_case_insensitive() {
        let h = Harness::empty();
        let path = temp_image("png", &solid_image(2, 2));
        let upper = path.with_file_name("PIC.PNG");
        std::fs::rename(&path, &upper).unwrap();

        let opened = block_on(open_images_by_paths(
            h.state(),
            vec![upper.to_str().unwrap().to_string()],
        ))
        .unwrap();

        assert_eq!(opened.len(), 1);
    }

    #[test]
    fn opening_by_path_ignores_files_that_fail_to_decode() {
        let h = Harness::empty();
        let dir = std::env::temp_dir().join(format!("imgz-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let broken = dir.join("broken.png");
        std::fs::write(&broken, b"xx").unwrap();

        let opened = block_on(open_images_by_paths(
            h.state(),
            vec![broken.to_str().unwrap().to_string()],
        ))
        .unwrap();

        assert!(opened.is_empty());
        assert!(h.state().0.lock().unwrap().is_empty());
    }

    #[test]
    fn opening_an_empty_list_yields_nothing() {
        let h = Harness::empty();

        let opened = block_on(open_images_by_paths(h.state(), vec![])).unwrap();

        assert!(opened.is_empty());
    }
}
