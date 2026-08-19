use image::DynamicImage;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub mod commands;
pub mod menu;

#[cfg(test)]
pub mod test_support;

pub struct AppHistory {
    pub entries: Vec<DynamicImage>,
    pub index: Option<usize>,
    pub source_path: Option<PathBuf>,
}

impl Default for AppHistory {
    fn default() -> Self {
        Self::new()
    }
}

impl AppHistory {
    pub fn new() -> Self {
        AppHistory {
            entries: Vec::new(),
            index: None,
            source_path: None,
        }
    }

    pub fn current(&self) -> Option<&DynamicImage> {
        self.index.map(|i| &self.entries[i])
    }

    pub fn push(&mut self, image: DynamicImage) {
        if let Some(i) = self.index {
            self.entries.truncate(i + 1);
        }
        self.entries.push(image);
        self.index = Some(self.entries.len() - 1);
    }

    pub fn open(&mut self, image: DynamicImage) {
        self.entries.clear();
        self.index = None;
        self.push(image);
    }

    pub fn undo(&mut self) -> Option<&DynamicImage> {
        let i = self.index?;
        if i == 0 {
            return None;
        }
        self.index = Some(i - 1);
        Some(&self.entries[i - 1])
    }

    pub fn redo(&mut self) -> Option<&DynamicImage> {
        let i = self.index?;
        if i + 1 >= self.entries.len() {
            return None;
        }
        self.index = Some(i + 1);
        Some(&self.entries[i + 1])
    }

    pub fn can_undo(&self) -> bool {
        self.index.map(|i| i > 0).unwrap_or(false)
    }

    pub fn can_redo(&self) -> bool {
        self.index
            .map(|i| i + 1 < self.entries.len())
            .unwrap_or(false)
    }
}

pub struct AppState(pub Mutex<HashMap<String, AppHistory>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState(Mutex::new(HashMap::new())))
        .setup(|app| {
            // En anglais au démarrage ; le front rappelle `set_menu_language` avec la
            // langue retenue dès qu'il est prêt.
            menu::install(app.handle(), menu::Lang::default())?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::open::open_images,
            commands::open::open_images_by_paths,
            commands::exif::get_exif,
            commands::exif::strip_exif,
            commands::transform::canvas_resize_image,
            commands::transform::crop_image,
            commands::transform::flip_image,
            commands::transform::resize_image,
            commands::transform::rotate_image,
            commands::export::export_image,
            commands::history::undo_image,
            commands::history::redo_image,
            commands::history::reset_to_original,
            menu::set_menu_language,
            commands::tabs::close_tab,
            commands::tabs::close_all_tabs,
            commands::tabs::close_other_tabs,
            commands::adjustments::adjust_brightness_contrast,
            commands::adjustments::adjust_exposure,
            commands::adjustments::adjust_hue_saturation,
            commands::adjustments::adjust_vibrance,
            commands::adjustments::adjust_levels,
            commands::adjustments::adjust_curves,
            commands::adjustments::adjust_white_balance,
            commands::adjustments::adjust_sharpen,
            commands::adjustments::adjust_denoise,
            commands::filters::filter_grayscale,
            commands::filters::filter_sepia,
            commands::filters::filter_invert,
            commands::filters::filter_vignette,
            commands::filters::filter_grain,
            commands::filters::filter_pixelate,
            commands::filters::filter_posterize,
            commands::filters::filter_duotone,
            commands::filters::filter_sketch,
            commands::filters::filter_lomo,
            commands::filters::filter_vintage,
            commands::filters::filter_cool,
            commands::filters::filter_warm,
            commands::filters::filter_fade,
            commands::filters::filter_drama,
            commands::filters::filter_cross_process,
            commands::filters::filter_blur_gaussian,
            commands::filters::filter_blur_motion,
            commands::filters::filter_blur_radial,
            commands::inpaint::inpaint_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba, RgbaImage};

    fn img(w: u32, h: u32) -> DynamicImage {
        let mut i = RgbaImage::new(w, h);
        for p in i.pixels_mut() {
            *p = Rgba([0, 0, 0, 255]);
        }
        DynamicImage::ImageRgba8(i)
    }

    #[test]
    fn history_starts_empty() {
        let h = AppHistory::new();
        assert!(h.current().is_none());
        assert!(!h.can_undo());
        assert!(!h.can_redo());
    }

    #[test]
    fn push_sets_current() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        assert!(h.current().is_some());
        assert!(!h.can_undo());
        assert!(!h.can_redo());
    }

    #[test]
    fn undo_redo_navigate() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.push(img(30, 30));

        assert!(h.can_undo());
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 30);

        h.undo();
        assert_eq!(h.current().unwrap().width(), 20);
        assert!(h.can_undo());
        assert!(h.can_redo());

        h.undo();
        assert_eq!(h.current().unwrap().width(), 10);
        assert!(!h.can_undo());
        assert!(h.can_redo());

        h.redo();
        assert_eq!(h.current().unwrap().width(), 20);
    }

    #[test]
    fn push_truncates_redo_stack() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.undo();
        h.push(img(50, 50));
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 50);
    }

    #[test]
    fn open_resets_history() {
        let mut h = AppHistory::new();
        h.push(img(10, 10));
        h.push(img(20, 20));
        h.open(img(99, 99));
        assert!(!h.can_undo());
        assert!(!h.can_redo());
        assert_eq!(h.current().unwrap().width(), 99);
    }
}
