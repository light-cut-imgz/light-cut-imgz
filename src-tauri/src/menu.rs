//! Menu natif : Fichier (ouvrir, onglets, langue, mise à jour, à propos) et Édition.
//!
//! Les libellés vivent ici plutôt que côté web parce que la barre de menu est dessinée
//! par le système : le front ne peut pas la traduire lui-même. Changer de langue
//! reconstruit le menu — c'est la seule façon d'en modifier les libellés sous GTK.

use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

/// Langue de l'interface. Anglais par défaut, comme partout ailleurs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Lang {
    #[default]
    En,
    Fr,
}

impl Lang {
    /// Tout ce qui n'est pas explicitement `fr` retombe sur l'anglais : le front
    /// envoie une chaîne libre, et une valeur inconnue ne doit pas casser le menu.
    pub fn parse(raw: &str) -> Self {
        if raw == "fr" {
            Lang::Fr
        } else {
            Lang::En
        }
    }
}

/// Libellé d'une entrée de menu.
pub fn label(lang: Lang, key: &'static str) -> &'static str {
    match (key, lang) {
        ("file", Lang::En) => "File",
        ("file", Lang::Fr) => "Fichier",
        ("open", Lang::En) => "Open…",
        ("open", Lang::Fr) => "Ouvrir…",
        ("close-tab", Lang::En) => "Close Tab",
        ("close-tab", Lang::Fr) => "Fermer l'onglet",
        ("close-others", Lang::En) => "Close Other Tabs",
        ("close-others", Lang::Fr) => "Fermer les autres onglets",
        ("close-all", Lang::En) => "Close All",
        ("close-all", Lang::Fr) => "Tout fermer",
        ("language", Lang::En) => "Language",
        ("language", Lang::Fr) => "Langue",
        ("check-updates", Lang::En) => "Check for Updates…",
        ("check-updates", Lang::Fr) => "Rechercher les mises à jour…",
        ("about", Lang::En) => "About light-cut-imgz",
        ("about", Lang::Fr) => "À propos de light-cut-imgz",
        ("edit", Lang::En) => "Edit",
        ("edit", Lang::Fr) => "Édition",
        ("undo", Lang::En) => "Undo",
        ("undo", Lang::Fr) => "Annuler",
        ("redo", Lang::En) => "Redo",
        ("redo", Lang::Fr) => "Rétablir",
        ("toggle-history", Lang::En) => "Show/Hide History",
        ("toggle-history", Lang::Fr) => "Afficher/masquer l'historique",
        _ => key,
    }
}

/// Ce qu'une entrée de menu déclenche. Séparé de la construction du menu pour que la
/// table de correspondance soit vérifiable sans lancer l'application.
#[derive(Debug, PartialEq, Eq)]
pub enum MenuAction {
    /// Événement poussé vers le front, avec sa charge utile (vide = `()` côté JS).
    Emit {
        event: &'static str,
        payload: &'static str,
    },
    /// Entrée inconnue : rien à faire.
    Ignore,
}

pub const fn emit(event: &'static str) -> MenuAction {
    MenuAction::Emit { event, payload: "" }
}

pub fn menu_action(id: &str) -> MenuAction {
    match id {
        "file-open" => emit("menu-open"),
        "file-close-tab" => emit("menu-close-tab"),
        "file-close-others" => emit("menu-close-others"),
        "file-close-all" => emit("menu-close-all"),
        "edit-undo" => emit("menu-undo"),
        "edit-redo" => emit("menu-redo"),
        "edit-toggle-history" => emit("menu-toggle-history"),
        "about" => MenuAction::Emit {
            event: "show-about",
            payload: env!("CARGO_PKG_VERSION"),
        },
        "lang-en" => MenuAction::Emit {
            event: "menu-set-language",
            payload: "en",
        },
        "lang-fr" => MenuAction::Emit {
            event: "menu-set-language",
            payload: "fr",
        },
        "check-updates" => emit("menu-check-updates"),
        _ => MenuAction::Ignore,
    }
}

/// (Re)construit la barre de menu dans `lang` et l'installe sur l'application.
pub fn install<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<()> {
    let open_item = MenuItemBuilder::with_id("file-open", label(lang, "open")).build(app)?;
    let close_tab_item =
        MenuItemBuilder::with_id("file-close-tab", label(lang, "close-tab")).build(app)?;
    let close_others_item =
        MenuItemBuilder::with_id("file-close-others", label(lang, "close-others")).build(app)?;
    let close_all_item =
        MenuItemBuilder::with_id("file-close-all", label(lang, "close-all")).build(app)?;
    let check_updates_item =
        MenuItemBuilder::with_id("check-updates", label(lang, "check-updates")).build(app)?;
    let about_item = MenuItemBuilder::with_id("about", label(lang, "about")).build(app)?;
    let lang_en_item = CheckMenuItemBuilder::with_id("lang-en", "English")
        .checked(lang == Lang::En)
        .build(app)?;
    let lang_fr_item = CheckMenuItemBuilder::with_id("lang-fr", "Français")
        .checked(lang == Lang::Fr)
        .build(app)?;
    let lang_submenu = SubmenuBuilder::new(app, label(lang, "language"))
        .item(&lang_en_item)
        .item(&lang_fr_item)
        .build()?;
    let file_submenu = SubmenuBuilder::new(app, label(lang, "file"))
        .item(&open_item)
        .separator()
        .item(&close_tab_item)
        .item(&close_others_item)
        .item(&close_all_item)
        .separator()
        .item(&lang_submenu)
        .separator()
        .item(&check_updates_item)
        .item(&about_item)
        .build()?;

    let undo_item = MenuItemBuilder::with_id("edit-undo", label(lang, "undo")).build(app)?;
    let redo_item = MenuItemBuilder::with_id("edit-redo", label(lang, "redo")).build(app)?;
    let toggle_history_item =
        MenuItemBuilder::with_id("edit-toggle-history", label(lang, "toggle-history"))
            .build(app)?;
    let edit_submenu = SubmenuBuilder::new(app, label(lang, "edit"))
        .item(&undo_item)
        .item(&redo_item)
        .separator()
        .item(&toggle_history_item)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&file_submenu)
        .item(&edit_submenu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

/// Applique l'action d'une entrée de menu.
pub fn handle<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match menu_action(id) {
        MenuAction::Emit { event, payload } => {
            app.emit(event, payload).ok();
        }
        MenuAction::Ignore => {}
    }
}

/// Redessine le menu dans la langue demandée. Appelée par le front au démarrage avec
/// la langue retenue, puis à chaque changement.
#[tauri::command]
pub fn set_menu_language(app: AppHandle, lang: String) -> Result<(), String> {
    install(&app, Lang::parse(&lang)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── langue ───────────────────────────────────────────────────────────────

    #[test]
    fn the_menu_speaks_english_unless_told_otherwise() {
        assert_eq!(Lang::default(), Lang::En);
    }

    #[test]
    fn french_is_recognised() {
        assert_eq!(Lang::parse("fr"), Lang::Fr);
    }

    #[test]
    fn a_language_the_app_does_not_speak_falls_back_to_english() {
        assert_eq!(Lang::parse("klingon"), Lang::En);
        assert_eq!(Lang::parse(""), Lang::En);
    }

    #[test]
    fn each_code_the_menu_sends_is_understood_when_it_comes_back() {
        assert_eq!(Lang::parse("en"), Lang::En);
        assert_eq!(Lang::parse("fr"), Lang::Fr);
    }

    // ── libellés ─────────────────────────────────────────────────────────────

    const KEYS: [&str; 12] = [
        "file",
        "open",
        "close-tab",
        "close-others",
        "close-all",
        "language",
        "check-updates",
        "about",
        "edit",
        "undo",
        "redo",
        "toggle-history",
    ];

    #[test]
    fn every_entry_is_written_in_both_languages() {
        for key in KEYS {
            for lang in [Lang::En, Lang::Fr] {
                // Une clé sans traduction ressort telle quelle : c'est ce qu'il ne
                // faut pas voir dans la barre de menu.
                assert_ne!(label(lang, key), key, "{key} manque en {lang:?}");
            }
        }
    }

    #[test]
    fn the_two_languages_say_different_things() {
        for key in KEYS {
            assert_ne!(label(Lang::En, key), label(Lang::Fr, key), "{key}");
        }
    }

    #[test]
    fn an_unknown_key_is_returned_as_is_rather_than_panicking() {
        assert_eq!(label(Lang::Fr, "nope"), "nope");
    }

    // ── actions ──────────────────────────────────────────────────────────────

    #[test]
    fn each_file_menu_entry_emits_its_event() {
        assert_eq!(menu_action("file-open"), emit("menu-open"));
        assert_eq!(menu_action("file-close-tab"), emit("menu-close-tab"));
        assert_eq!(menu_action("file-close-others"), emit("menu-close-others"));
        assert_eq!(menu_action("file-close-all"), emit("menu-close-all"));
    }

    #[test]
    fn each_edit_menu_entry_emits_its_event() {
        assert_eq!(menu_action("edit-undo"), emit("menu-undo"));
        assert_eq!(menu_action("edit-redo"), emit("menu-redo"));
        assert_eq!(
            menu_action("edit-toggle-history"),
            emit("menu-toggle-history")
        );
    }

    #[test]
    fn about_carries_the_crate_version() {
        assert_eq!(
            menu_action("about"),
            MenuAction::Emit {
                event: "show-about",
                payload: env!("CARGO_PKG_VERSION"),
            }
        );
    }

    #[test]
    fn the_language_entries_carry_their_locale() {
        for (id, lang) in [("lang-en", "en"), ("lang-fr", "fr")] {
            assert_eq!(
                menu_action(id),
                MenuAction::Emit {
                    event: "menu-set-language",
                    payload: lang,
                }
            );
        }
    }

    #[test]
    fn checking_for_updates_is_handed_to_the_front() {
        // Le front installe la mise à jour et relance ; le menu ne fait que
        // déclencher. Avant, cette entrée ouvrait la page des versions.
        assert_eq!(menu_action("check-updates"), emit("menu-check-updates"));
    }

    #[test]
    fn no_two_entries_share_an_event_and_payload() {
        // Deux entrées qui émettraient la même chose seraient indiscernables côté front.
        let ids = [
            "file-open",
            "file-close-tab",
            "file-close-others",
            "file-close-all",
            "edit-undo",
            "edit-redo",
            "edit-toggle-history",
            "about",
            "lang-en",
            "lang-fr",
            "check-updates",
        ];
        let mut seen = std::collections::HashSet::new();
        for id in ids {
            let action = menu_action(id);
            assert!(seen.insert(format!("{action:?}")), "doublon pour {id}");
        }
    }

    #[test]
    fn an_unknown_entry_does_nothing() {
        assert_eq!(menu_action("does-not-exist"), MenuAction::Ignore);
        assert_eq!(menu_action(""), MenuAction::Ignore);
    }

    // ── construction ─────────────────────────────────────────────────────────

    // muda refuse de construire un menu hors du thread principal sous macOS, et
    // `cargo test` donne un thread à chaque test. La construction n'est donc
    // vérifiable que sur les autres plateformes ; la table des libellés et celle
    // des actions, elles, sont testées partout.
    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn the_menu_can_be_built_in_either_language() {
        let app = tauri::test::mock_app();
        for lang in [Lang::En, Lang::Fr] {
            install(app.handle(), lang).unwrap();
        }
    }

    // muda refuse de construire un menu hors du thread principal sous macOS, et
    // `cargo test` donne un thread à chaque test. La construction n'est donc
    // vérifiable que sur les autres plateformes ; la table des libellés et celle
    // des actions, elles, sont testées partout.
    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn switching_language_redraws_the_menu_rather_than_failing() {
        let app = tauri::test::mock_app();
        install(app.handle(), Lang::En).unwrap();

        install(app.handle(), Lang::Fr).unwrap();
    }
}
