use exif::In;
use img_parts::ImageEXIF;
use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::AppState;

#[derive(Serialize, Debug)]
pub struct ExifField {
    pub tag: String,
    pub value: String,
}

#[tauri::command]
pub async fn get_exif(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<Vec<ExifField>, String> {
    let source_path = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let history = map.get(&tab_id).ok_or("Tab not found")?;
        history.source_path.clone()
    };

    let Some(path) = source_path else {
        return Ok(vec![]);
    };

    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = std::io::BufReader::new(file);
    let reader = exif::Reader::new();

    let exif_data = match reader.read_from_container(&mut buf) {
        Ok(data) => data,
        Err(_) => return Ok(vec![]),
    };

    let fields = exif_data
        .fields()
        .filter(|f| f.ifd_num == In::PRIMARY)
        .map(|f| ExifField {
            tag: f.tag.to_string(),
            value: f.display_value().with_unit(&exif_data).to_string(),
        })
        .collect();

    Ok(fields)
}

/// Extension normalisée d'un chemin source (`jpeg` -> `jpg`), pour le filtre du sélecteur
/// de fichier et pour décider de la stratégie de nettoyage.
pub fn filter_extension(ext: &str) -> &str {
    if ext == "jpg" || ext == "jpeg" {
        "jpg"
    } else {
        ext
    }
}

pub fn source_extension(source_path: Option<&std::path::Path>) -> String {
    source_path
        .and_then(|p| p.extension())
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default()
}

/// Écrit `img` (ou la source JPEG d'origine) dans `output`, sans bloc EXIF.
///
/// Séparé de la commande : celle-ci ne fait qu'ouvrir la boîte de dialogue, tout ce qui
/// suit le choix du fichier est ici et donc testable sans interface.
pub fn write_stripped(
    source_path: Option<&std::path::Path>,
    img: &image::DynamicImage,
    output: &std::path::Path,
) -> Result<(), String> {
    let ext = source_extension(source_path);

    if (ext == "jpg" || ext == "jpeg") && source_path.is_some() {
        // Retrait sans perte pour le JPEG : on réécrit le conteneur sans le segment EXIF.
        let data =
            std::fs::read(source_path.ok_or("No source path")?).map_err(|e| e.to_string())?;
        let mut jpeg = img_parts::jpeg::Jpeg::from_bytes(data.into()).map_err(|e| e.to_string())?;
        jpeg.set_exif(None);
        std::fs::write(output, jpeg.encoder().bytes()).map_err(|e| e.to_string())?;
    } else {
        // Ré-encodage : le cycle décodage/encodage perd déjà l'EXIF.
        img.save(output).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn strip_exif(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<bool, String> {
    let source_path = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let history = map.get(&tab_id).ok_or("Tab not found")?;
        history.source_path.clone()
    };

    let ext = source_extension(source_path.as_deref());
    let filter_ext = filter_extension(&ext);

    let save_path = app
        .dialog()
        .file()
        .add_filter("Image", &[filter_ext])
        .set_file_name(format!("stripped.{filter_ext}"))
        .blocking_save_file();

    let Some(save_path) = save_path else {
        return Ok(false);
    };
    let output = save_path.into_path().map_err(|e| e.to_string())?;

    let map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get(&tab_id).ok_or("Tab not found")?;
    let img = history.current().ok_or("No image loaded")?;
    write_stripped(source_path.as_deref(), img, &output)?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{solid, Harness, TAB};
    use crate::AppHistory;
    use image::GenericImageView;
    use std::path::PathBuf;

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    /// Onglet dont l'image provient d'un fichier réellement écrit sur disque.
    fn tab_from_file(ext: &str) -> (Harness, PathBuf) {
        let dir = std::env::temp_dir().join(format!("imgz-exif-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("pic.{ext}"));
        let img = solid(4, 4, [10, 20, 30]);
        img.save(&path).unwrap();

        let mut history = AppHistory::new();
        history.source_path = Some(path.clone());
        history.open(img);
        (Harness::with_history(history), path)
    }

    #[test]
    fn an_unknown_tab_is_rejected() {
        let h = Harness::empty();

        let err = block_on(get_exif(h.state(), TAB.into())).unwrap_err();

        assert_eq!(err, "Tab not found");
    }

    #[test]
    fn an_image_with_no_source_file_has_no_metadata() {
        // Cas d'un onglet créé en mémoire (jamais ouvert depuis le disque).
        let h = Harness::with_image(solid(2, 2, [1, 2, 3]));

        let fields = block_on(get_exif(h.state(), TAB.into())).unwrap();

        assert!(fields.is_empty());
    }

    #[test]
    fn a_vanished_source_file_surfaces_the_io_error() {
        let (h, path) = tab_from_file("png");
        std::fs::remove_file(&path).unwrap();

        assert!(block_on(get_exif(h.state(), TAB.into())).is_err());
    }

    #[test]
    fn a_file_without_an_exif_block_yields_no_fields() {
        let (h, _path) = tab_from_file("png");

        let fields = block_on(get_exif(h.state(), TAB.into())).unwrap();

        assert!(fields.is_empty());
    }

    #[test]
    fn the_primary_ifd_fields_are_reported_as_tag_value_pairs() {
        let (h, path) = tab_from_file("jpg");

        // On greffe un bloc EXIF minimal (TIFF little-endian, une entrée Orientation).
        let exif: Vec<u8> = vec![
            b'I', b'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // en-tête, IFD à l'offset 8
            0x01, 0x00, // une entrée
            0x12, 0x01, // tag 0x0112 = Orientation
            0x03, 0x00, // type SHORT
            0x01, 0x00, 0x00, 0x00, // count = 1
            0x01, 0x00, 0x00, 0x00, // valeur = 1 (normale)
            0x00, 0x00, 0x00, 0x00, // pas d'IFD suivant
        ];
        let data = std::fs::read(&path).unwrap();
        let mut jpeg = img_parts::jpeg::Jpeg::from_bytes(data.into()).unwrap();
        jpeg.set_exif(Some(exif.into()));
        std::fs::write(&path, jpeg.encoder().bytes()).unwrap();

        let fields = block_on(get_exif(h.state(), TAB.into())).unwrap();

        let orientation = fields
            .iter()
            .find(|f| f.tag == "Orientation")
            .unwrap_or_else(|| {
                panic!(
                    "tags lus : {:?}",
                    fields.iter().map(|f| &f.tag).collect::<Vec<_>>()
                )
            });
        assert!(!orientation.value.is_empty());
    }

    #[test]
    fn a_field_serialises_as_tag_and_value() {
        let field = ExifField {
            tag: "Make".into(),
            value: "Canon".into(),
        };

        let json = serde_json::to_string(&field).unwrap();

        assert_eq!(json, r#"{"tag":"Make","value":"Canon"}"#);
    }

    // ── retrait de l'EXIF ────────────────────────────────────────────────────

    #[test]
    fn the_jpeg_extensions_share_one_filter() {
        assert_eq!(filter_extension("jpg"), "jpg");
        assert_eq!(filter_extension("jpeg"), "jpg");
        assert_eq!(filter_extension("png"), "png");
        assert_eq!(filter_extension(""), "");
    }

    #[test]
    fn the_source_extension_is_lowercased() {
        assert_eq!(
            source_extension(Some(&PathBuf::from("/a/PIC.JPEG"))),
            "jpeg"
        );
        assert_eq!(source_extension(Some(&PathBuf::from("/a/pic"))), "");
        assert_eq!(source_extension(None), "");
    }

    #[test]
    fn stripping_a_jpeg_removes_its_exif_block_losslessly() {
        let (h, path) = tab_from_file("jpg");
        let exif: Vec<u8> = vec![
            b'I', b'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00,
            0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let data = std::fs::read(&path).unwrap();
        let mut jpeg = img_parts::jpeg::Jpeg::from_bytes(data.into()).unwrap();
        jpeg.set_exif(Some(exif.into()));
        std::fs::write(&path, jpeg.encoder().bytes()).unwrap();
        assert!(!block_on(get_exif(h.state(), TAB.into()))
            .unwrap()
            .is_empty());

        let output = path.with_file_name("stripped.jpg");
        let img = solid(4, 4, [10, 20, 30]);
        write_stripped(Some(&path), &img, &output).unwrap();

        let cleaned = std::fs::read(&output).unwrap();
        let jpeg = img_parts::jpeg::Jpeg::from_bytes(cleaned.into()).unwrap();
        assert!(jpeg.exif().is_none());
        // Sans perte : l'image reste décodable et de même taille.
        assert_eq!(image::open(&output).unwrap().width(), 4);
    }

    #[test]
    fn stripping_a_non_jpeg_re_encodes_the_current_image() {
        let (_h, path) = tab_from_file("png");
        let output = path.with_file_name("stripped.png");

        write_stripped(Some(&path), &solid(7, 3, [1, 2, 3]), &output).unwrap();

        // C'est bien l'image en mémoire (7×3) qui est écrite, pas la source (4×4).
        assert_eq!(image::open(&output).unwrap().dimensions(), (7, 3));
    }

    #[test]
    fn stripping_without_a_source_falls_back_to_re_encoding() {
        let dir = std::env::temp_dir().join(format!("imgz-exif-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let output = dir.join("out.png");

        write_stripped(None, &solid(5, 5, [9, 9, 9]), &output).unwrap();

        assert_eq!(image::open(&output).unwrap().width(), 5);
    }

    #[test]
    fn a_corrupt_jpeg_source_surfaces_the_error() {
        let dir = std::env::temp_dir().join(format!("imgz-exif-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("broken.jpg");
        std::fs::write(&source, b"pas un jpeg").unwrap();

        let err = write_stripped(Some(&source), &solid(2, 2, [0, 0, 0]), &dir.join("out.jpg"))
            .unwrap_err();

        assert!(!err.is_empty());
    }

    #[test]
    fn a_missing_jpeg_source_surfaces_the_error() {
        let dir = std::env::temp_dir().join(format!("imgz-exif-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        assert!(write_stripped(
            Some(&dir.join("absent.jpg")),
            &solid(2, 2, [0, 0, 0]),
            &dir.join("out.jpg")
        )
        .is_err());
    }

    #[test]
    fn an_unwritable_destination_surfaces_the_error() {
        assert!(write_stripped(
            None,
            &solid(2, 2, [0, 0, 0]),
            &PathBuf::from("/nowhere-at-all/out.png")
        )
        .is_err());
    }
}
