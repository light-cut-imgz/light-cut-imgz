//! Menu natif : Fichier, Édition, Affichage et Aide, comme dans LightCutVidz et
//! LightCutSoundz.
//!
//! Les libellés vivent ici plutôt que côté web parce que la barre de menu est dessinée
//! par le système : le front ne peut pas la traduire lui-même. Changer de langue
//! reconstruit le menu — c'est la seule façon d'en modifier les libellés sous GTK.

use std::sync::Mutex;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Peint les menus GTK comme ceux de LightCutVidz et de LightCutSoundz (mesurés sur
/// leurs captures : la barre fait 29 px de haut et a le gris de la barre de titre ;
/// les entrées font 33 px de haut, en 15,7 px, avec 19 px de chaque côté ; une fenêtre
/// de menu a 10 px au-dessus et au-dessous), pour que les applications de la suite se
/// ressemblent. Ils restent sombres quel que soit le thème de la page : GTK les dessine
/// avec le thème du système. À appeler sur le thread principal.
#[cfg(target_os = "linux")]
pub fn style_menu_bar() {
    use gtk::prelude::CssProviderExt;
    let provider = gtk::CssProvider::new();
    // GTK réserve 25 px avant le texte d'une entrée et `muda` ramène la boîte d'un
    // sous-menu de -22 px. Les marges négatives ci-dessous placent chaque libellé à
    // 20 px du bord, comme dans LightCutVidz ; la priorité USER l'emporte sur la règle
    // propre à `muda`.
    let css = "\
        menubar { background-color: #2c2c2c; min-height: 29px; } \
        menubar > menuitem { min-height: 29px; padding-top: 0; padding-bottom: 0; } \
        menubar > menuitem label { color: #f7f7f7; } \
        .csd.popup decoration { box-shadow: 0 1px 2px transparent, 0 0 0 1px transparent; } \
        menu { padding: 10px 0; border: none; border-radius: 8px; box-shadow: none; background-color: #1d1d1d; } \
        menu menuitem { min-height: 33px; padding: 0 19px 0 0; margin-left: -5px; font-size: 15.7px; } \
        menu menuitem:hover { background-color: #3a3a3a; } \
        menu menuitem > box { margin: 0 0 0 -25px; } \
        menu menuitem > box > image { min-width: 0; margin: 0 0 0 3px; } \
        menu menuitem label { color: #f7f7f7; } \
        menu menuitem check { min-width: 16px; min-height: 16px; margin-left: 16px; margin-right: 12px; border: 2px solid #f7f7f7; border-radius: 50%; background-color: transparent; background-image: none; box-shadow: none; -gtk-icon-source: none; } \
        menu menuitem check:checked { border-color: #6366f1; background-image: radial-gradient(circle, #6366f1 38%, transparent 42%); } \
        menu menuitem:disabled label { color: #929292; } \
        menu separator { margin: 8px 0; }";
    if provider.load_from_data(css.as_bytes()).is_err() {
        return;
    }
    if let Some(screen) = gtk::gdk::Screen::default() {
        gtk::StyleContext::add_provider_for_screen(
            &screen,
            &provider,
            gtk::STYLE_PROVIDER_PRIORITY_USER,
        );
    }
}

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

/// Thème de couleurs choisi dans Affichage ▸ Thème.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

impl Theme {
    /// Tout ce qui n'est pas `light` ou `dark` suit le système.
    pub fn parse(raw: &str) -> Self {
        match raw {
            "light" => Theme::Light,
            "dark" => Theme::Dark,
            _ => Theme::System,
        }
    }

    pub fn window_theme(self) -> Option<tauri::Theme> {
        match self {
            Theme::System => None,
            Theme::Light => Some(tauri::Theme::Light),
            Theme::Dark => Some(tauri::Theme::Dark),
        }
    }
}

/// Ce que le menu montre en plus de ses entrées fixes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MenuPrefs {
    pub lang: Lang,
    pub theme: Theme,
    pub can_undo: bool,
    pub can_redo: bool,
    /// Une image est ouverte : sans elle, l'historique n'a rien à montrer.
    pub has_image: bool,
    /// Taille de la grille, en pixels : celle qui est cochée dans Affichage.
    pub grid_size: u32,
    /// Chemins des fichiers récents, du plus récent au plus ancien.
    pub recent: Vec<String>,
}

impl Default for MenuPrefs {
    fn default() -> Self {
        MenuPrefs {
            lang: Lang::default(),
            theme: Theme::default(),
            can_undo: false,
            can_redo: false,
            has_image: false,
            grid_size: DEFAULT_GRID_SIZE,
            recent: Vec::new(),
        }
    }
}

/// Les tailles de grille que propose Affichage ▸ Taille de la grille.
pub const GRID_SIZES: [u32; 4] = [10, 25, 50, 100];
pub const DEFAULT_GRID_SIZE: u32 = 50;

/// Les préférences avec lesquelles le menu est dessiné en ce moment.
#[derive(Default)]
pub struct MenuState(pub Mutex<MenuPrefs>);

/// Libellé d'une entrée de menu.
pub fn label(lang: Lang, key: &'static str) -> &'static str {
    match (key, lang) {
        ("file", Lang::En) => "File",
        ("file", Lang::Fr) => "Fichier",
        ("open", Lang::En) => "Open image…",
        ("open", Lang::Fr) => "Ouvrir une image…",
        ("open-recent", Lang::En) => "Open recent",
        ("open-recent", Lang::Fr) => "Ouvrir récent",
        ("clear-recent", Lang::En) => "Clear recent",
        ("clear-recent", Lang::Fr) => "Effacer les récents",
        ("close-tab", Lang::En) => "Close Tab",
        ("close-tab", Lang::Fr) => "Fermer l'onglet",
        ("close-others", Lang::En) => "Close Other Tabs",
        ("close-others", Lang::Fr) => "Fermer les autres onglets",
        ("close-all", Lang::En) => "Close All",
        ("close-all", Lang::Fr) => "Tout fermer",
        ("quit", Lang::En) => "Quit",
        ("quit", Lang::Fr) => "Quitter",
        ("edit", Lang::En) => "Edit",
        ("edit", Lang::Fr) => "Édition",
        ("undo", Lang::En) => "Undo",
        ("undo", Lang::Fr) => "Annuler",
        ("redo", Lang::En) => "Redo",
        ("redo", Lang::Fr) => "Rétablir",
        ("toggle-history", Lang::En) => "Show/Hide History",
        ("toggle-history", Lang::Fr) => "Afficher/masquer l'historique",
        ("grid-size", Lang::En) => "Grid size",
        ("grid-size", Lang::Fr) => "Taille de la grille",
        ("view", Lang::En) => "View",
        ("view", Lang::Fr) => "Affichage",
        ("fullscreen", Lang::En) => "Toggle Full Screen",
        ("fullscreen", Lang::Fr) => "Basculer en plein écran",
        ("theme", Lang::En) => "Theme",
        ("theme", Lang::Fr) => "Thème",
        ("theme-system", Lang::En) => "Follow the system",
        ("theme-system", Lang::Fr) => "Suivre le système",
        ("theme-light", Lang::En) => "Light",
        ("theme-light", Lang::Fr) => "Clair",
        ("theme-dark", Lang::En) => "Dark",
        ("theme-dark", Lang::Fr) => "Sombre",
        ("help", Lang::En) => "Help",
        ("help", Lang::Fr) => "Aide",
        ("about", Lang::En) => "About LightCutImgz",
        ("about", Lang::Fr) => "À propos de LightCutImgz",
        ("changelog", Lang::En) => "What's New",
        ("changelog", Lang::Fr) => "Nouveautés",
        ("check-updates", Lang::En) => "Check for Updates…",
        ("check-updates", Lang::Fr) => "Rechercher les mises à jour…",
        ("language", Lang::En) => "Language",
        ("language", Lang::Fr) => "Langue",
        ("hide", Lang::En) => "Hide LightCutImgz",
        ("hide", Lang::Fr) => "Masquer LightCutImgz",
        ("hide-others", Lang::En) => "Hide Others",
        ("hide-others", Lang::Fr) => "Masquer les autres",
        ("show-all", Lang::En) => "Show All",
        ("show-all", Lang::Fr) => "Tout afficher",
        ("cut", Lang::En) => "Cut",
        ("cut", Lang::Fr) => "Couper",
        ("copy", Lang::En) => "Copy",
        ("copy", Lang::Fr) => "Copier",
        ("paste", Lang::En) => "Paste",
        ("paste", Lang::Fr) => "Coller",
        ("select-all", Lang::En) => "Select All",
        ("select-all", Lang::Fr) => "Tout sélectionner",
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
    /// Ouvre la n-ième entrée de la liste des récents.
    OpenRecent(usize),
    ToggleFullscreen,
    /// Choisit une taille de grille, en pixels.
    SetGrid(u32),
    /// Entrée inconnue : rien à faire.
    Ignore,
}

pub const fn emit(event: &'static str) -> MenuAction {
    MenuAction::Emit { event, payload: "" }
}

pub fn menu_action(id: &str) -> MenuAction {
    match id {
        "file-open" => emit("menu-open"),
        "recent-clear" => emit("menu-clear-recent"),
        "file-close-tab" => emit("menu-close-tab"),
        "file-close-others" => emit("menu-close-others"),
        "file-close-all" => emit("menu-close-all"),
        // Quitter passe par la fermeture de la fenêtre, qui prévient des
        // modifications non exportées : c'est le front qui la demande.
        "file-quit" => emit("menu-quit"),
        "edit-undo" => emit("menu-undo"),
        "edit-redo" => emit("menu-redo"),
        "edit-toggle-history" => emit("menu-toggle-history"),
        "view-fullscreen" => MenuAction::ToggleFullscreen,
        "theme-system" => MenuAction::Emit {
            event: "menu-set-theme",
            payload: "system",
        },
        "theme-light" => MenuAction::Emit {
            event: "menu-set-theme",
            payload: "light",
        },
        "theme-dark" => MenuAction::Emit {
            event: "menu-set-theme",
            payload: "dark",
        },
        "changelog" => emit("menu-changelog"),
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
        _ => match id
            .strip_prefix("grid-")
            .and_then(|n| n.parse::<u32>().ok())
            .filter(|n| GRID_SIZES.contains(n))
        {
            Some(n) => MenuAction::SetGrid(n),
            None => match id.strip_prefix("recent-").and_then(|n| n.parse().ok()) {
                Some(n) => MenuAction::OpenRecent(n),
                None => MenuAction::Ignore,
            },
        },
    }
}

/// Nom affiché d'un fichier récent : le dernier élément de son chemin.
fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// (Re)construit la barre de menu dans la langue et avec les préférences données et
/// l'installe sur l'application. Les mêmes entrées, dans le même ordre, que le menu
/// de LightCutVidz.
pub fn install<R: Runtime>(app: &AppHandle<R>, prefs: &MenuPrefs) -> tauri::Result<()> {
    let lang = prefs.lang;
    let open = MenuItemBuilder::with_id("file-open", label(lang, "open"))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("file-close-tab", label(lang, "close-tab"))
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let close_others =
        MenuItemBuilder::with_id("file-close-others", label(lang, "close-others")).build(app)?;
    let close_all =
        MenuItemBuilder::with_id("file-close-all", label(lang, "close-all")).build(app)?;
    let quit = MenuItemBuilder::with_id("file-quit", label(lang, "quit"))
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let mut recent_menu =
        SubmenuBuilder::new(app, label(lang, "open-recent")).enabled(!prefs.recent.is_empty());
    for (i, path) in prefs.recent.iter().enumerate() {
        recent_menu = recent_menu
            .item(&MenuItemBuilder::with_id(format!("recent-{i}"), file_name(path)).build(app)?);
    }
    let recent_menu = recent_menu
        .separator()
        .item(&MenuItemBuilder::with_id("recent-clear", label(lang, "clear-recent")).build(app)?)
        .build()?;

    let file = SubmenuBuilder::new(app, label(lang, "file"))
        .item(&open)
        .item(&recent_menu)
        .separator()
        .item(&close_tab)
        .item(&close_others)
        .item(&close_all)
        .separator();

    let redo_accel = if cfg!(target_os = "macos") {
        "Cmd+Shift+Z"
    } else {
        "Ctrl+Y"
    };
    let undo = MenuItemBuilder::with_id("edit-undo", label(lang, "undo"))
        .accelerator("CmdOrCtrl+Z")
        .enabled(prefs.can_undo)
        .build(app)?;
    let redo = MenuItemBuilder::with_id("edit-redo", label(lang, "redo"))
        .accelerator(redo_accel)
        .enabled(prefs.can_redo)
        .build(app)?;
    let toggle_history =
        MenuItemBuilder::with_id("edit-toggle-history", label(lang, "toggle-history"))
            .enabled(prefs.has_image)
            .build(app)?;
    let edit = SubmenuBuilder::new(app, label(lang, "edit"))
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&toggle_history);

    let fullscreen_accel = if cfg!(target_os = "macos") {
        "Ctrl+Cmd+F"
    } else {
        "F11"
    };
    let fullscreen = MenuItemBuilder::with_id("view-fullscreen", label(lang, "fullscreen"))
        .accelerator(fullscreen_accel)
        .build(app)?;
    let mut theme = SubmenuBuilder::new(app, label(lang, "theme"));
    for (id, key, value) in [
        ("theme-system", "theme-system", Theme::System),
        ("theme-light", "theme-light", Theme::Light),
        ("theme-dark", "theme-dark", Theme::Dark),
    ] {
        theme = theme.item(
            &CheckMenuItemBuilder::with_id(id, label(lang, key))
                .checked(prefs.theme == value)
                .build(app)?,
        );
    }
    let mut grid = SubmenuBuilder::new(app, label(lang, "grid-size"));
    for size in GRID_SIZES {
        grid = grid.item(
            &CheckMenuItemBuilder::with_id(format!("grid-{size}"), format!("{size} px"))
                .checked(prefs.grid_size == size)
                .build(app)?,
        );
    }
    let view = SubmenuBuilder::new(app, label(lang, "view"))
        .item(&fullscreen)
        .item(&theme.build()?)
        .item(&grid.build()?);

    let about = MenuItemBuilder::with_id("about", label(lang, "about")).build(app)?;
    let changelog = MenuItemBuilder::with_id("changelog", label(lang, "changelog")).build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("check-updates", label(lang, "check-updates")).build(app)?;
    let lang_en = CheckMenuItemBuilder::with_id("lang-en", "English")
        .checked(lang == Lang::En)
        .build(app)?;
    let lang_fr = CheckMenuItemBuilder::with_id("lang-fr", "Français")
        .checked(lang == Lang::Fr)
        .build(app)?;
    let language = SubmenuBuilder::new(app, label(lang, "language"))
        .item(&lang_en)
        .item(&lang_fr)
        .build()?;
    let help = SubmenuBuilder::new(app, label(lang, "help"))
        .item(&about)
        .item(&changelog)
        .separator()
        .item(&check_updates)
        .separator()
        .item(&language)
        .build()?;

    // Sur macOS, le premier sous-menu est celui de l'application, et les champs de
    // saisie n'ont ni copier ni coller tant qu'un menu Édition ne les déclare pas.
    #[cfg(target_os = "macos")]
    let menu = {
        use tauri::menu::PredefinedMenuItem as P;
        let t = |key| Some(label(lang, key));
        let app_menu = SubmenuBuilder::new(app, "LightCutImgz")
            .item(&about)
            .separator()
            .item(&P::hide(app, t("hide"))?)
            .item(&P::hide_others(app, t("hide-others"))?)
            .item(&P::show_all(app, t("show-all"))?)
            .separator()
            .item(&quit)
            .build()?;
        let edit = edit
            .separator()
            .item(&P::cut(app, t("cut"))?)
            .item(&P::copy(app, t("copy"))?)
            .item(&P::paste(app, t("paste"))?)
            .item(&P::select_all(app, t("select-all"))?)
            .build()?;
        MenuBuilder::new(app)
            .item(&app_menu)
            .item(&file.build()?)
            .item(&edit)
            .item(&view.build()?)
            .item(&help)
            .build()?
    };
    #[cfg(not(target_os = "macos"))]
    let menu = {
        let file = file.item(&quit).build()?;
        MenuBuilder::new(app)
            .item(&file)
            .item(&edit.build()?)
            .item(&view.build()?)
            .item(&help)
            .build()?
    };

    app.set_menu(menu)?;
    Ok(())
}

/// Redessine le menu avec les préférences courantes. Toujours sur le thread
/// principal : macOS refuse de construire un menu ailleurs.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(state) = handle.try_state::<MenuState>() else {
            return;
        };
        let prefs = state.0.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Err(e) = install(&handle, &prefs) {
            eprintln!("Cannot redraw the menu: {e}");
        }
    });
}

fn update<R: Runtime>(app: &AppHandle<R>, change: impl FnOnce(&mut MenuPrefs)) {
    change(
        &mut app
            .state::<MenuState>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner()),
    );
    refresh(app);
}

/// Applique l'action d'une entrée de menu.
pub fn handle<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match menu_action(id) {
        MenuAction::Emit { event, payload } => {
            app.emit(event, payload).ok();
        }
        MenuAction::OpenRecent(n) => {
            let path = app
                .state::<MenuState>()
                .0
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .recent
                .get(n)
                .cloned();
            if let Some(path) = path {
                app.emit("menu-open-recent", path).ok();
            }
        }
        MenuAction::SetGrid(size) => {
            app.emit("menu-set-grid", size).ok();
        }
        MenuAction::ToggleFullscreen => {
            if let Some(w) = app.get_webview_window("main") {
                let on = w.is_fullscreen().unwrap_or(false);
                let _ = w.set_fullscreen(!on);
            }
        }
        MenuAction::Ignore => {}
    }
}

/// Redessine le menu dans la langue demandée. Appelée par le front au démarrage avec
/// la langue retenue, puis à chaque changement.
#[tauri::command]
pub fn set_menu_language(app: AppHandle, lang: String) {
    update(&app, |p| p.lang = Lang::parse(&lang));
}

/// Applique le thème choisi dans Affichage ▸ Thème à la fenêtre (pour que
/// `prefers-color-scheme` de la page suive) et le coche dans le menu.
#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) {
    let theme = Theme::parse(&theme);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_theme(theme.window_theme());
    }
    update(&app, |p| p.theme = theme);
}

/// Dit au menu si Annuler et Rétablir ont quelque chose à faire.
#[tauri::command]
pub fn set_undo_redo(app: AppHandle, state: State<'_, MenuState>, can_undo: bool, can_redo: bool) {
    {
        let mut prefs = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if prefs.can_undo == can_undo && prefs.can_redo == can_redo {
            return;
        }
        prefs.can_undo = can_undo;
        prefs.can_redo = can_redo;
    }
    refresh(&app);
}

/// Dit au menu quelle taille de grille est choisie, pour la cocher dans Affichage.
#[tauri::command]
pub fn set_grid_size(app: AppHandle, state: State<'_, MenuState>, size: u32) {
    {
        let mut prefs = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if prefs.grid_size == size {
            return;
        }
        prefs.grid_size = size;
    }
    refresh(&app);
}

/// Dit au menu si une image est ouverte : les entrées qui n'ont de sens que sur une
/// image (l'historique) sont grisées sinon.
#[tauri::command]
pub fn set_has_image(app: AppHandle, state: State<'_, MenuState>, has_image: bool) {
    {
        let mut prefs = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if prefs.has_image == has_image {
            return;
        }
        prefs.has_image = has_image;
    }
    refresh(&app);
}

/// Donne au menu la liste des fichiers récents, que le front tient à jour.
#[tauri::command]
pub fn set_recent_files(app: AppHandle, state: State<'_, MenuState>, files: Vec<String>) {
    {
        let mut prefs = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if prefs.recent == files {
            return;
        }
        prefs.recent = files;
    }
    refresh(&app);
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

    // ── thème ────────────────────────────────────────────────────────────────

    #[test]
    fn the_theme_follows_the_system_unless_told_otherwise() {
        assert_eq!(Theme::default(), Theme::System);
        assert_eq!(Theme::parse("neon"), Theme::System);
        assert_eq!(Theme::parse("light"), Theme::Light);
        assert_eq!(Theme::parse("dark"), Theme::Dark);
    }

    #[test]
    fn only_a_chosen_theme_is_forced_on_the_window() {
        assert_eq!(Theme::System.window_theme(), None);
        assert_eq!(Theme::Light.window_theme(), Some(tauri::Theme::Light));
        assert_eq!(Theme::Dark.window_theme(), Some(tauri::Theme::Dark));
    }

    // ── libellés ─────────────────────────────────────────────────────────────

    const KEYS: [&str; 33] = [
        "file",
        "open",
        "open-recent",
        "clear-recent",
        "close-tab",
        "close-others",
        "close-all",
        "quit",
        "edit",
        "undo",
        "redo",
        "toggle-history",
        "grid-size",
        "view",
        "fullscreen",
        "theme",
        "theme-system",
        "theme-light",
        "theme-dark",
        "help",
        "about",
        "changelog",
        "check-updates",
        "language",
        "hide",
        "hide-others",
        "show-all",
        "cut",
        "copy",
        "paste",
        "select-all",
        "recent-none",
        "window",
    ];

    #[test]
    fn every_entry_is_written_in_both_languages() {
        for key in KEYS
            .iter()
            .filter(|k| !matches!(**k, "recent-none" | "window"))
        {
            for lang in [Lang::En, Lang::Fr] {
                // Une clé sans traduction ressort telle quelle : c'est ce qu'il ne
                // faut pas voir dans la barre de menu.
                assert_ne!(label(lang, key), *key, "{key} manque en {lang:?}");
            }
        }
    }

    #[test]
    fn the_two_languages_say_different_things() {
        // « Edit »/« Édition » et les noms propres mis à part.
        for key in [
            "file",
            "open",
            "quit",
            "view",
            "help",
            "theme",
            "changelog",
            "language",
        ] {
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
        assert_eq!(menu_action("recent-clear"), emit("menu-clear-recent"));
        assert_eq!(menu_action("file-close-tab"), emit("menu-close-tab"));
        assert_eq!(menu_action("file-close-others"), emit("menu-close-others"));
        assert_eq!(menu_action("file-close-all"), emit("menu-close-all"));
        assert_eq!(menu_action("file-quit"), emit("menu-quit"));
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
    fn the_view_menu_toggles_the_full_screen_and_sets_the_theme() {
        assert_eq!(menu_action("view-fullscreen"), MenuAction::ToggleFullscreen);
        for (id, theme) in [
            ("theme-system", "system"),
            ("theme-light", "light"),
            ("theme-dark", "dark"),
        ] {
            assert_eq!(
                menu_action(id),
                MenuAction::Emit {
                    event: "menu-set-theme",
                    payload: theme,
                }
            );
        }
    }

    #[test]
    fn the_grid_entries_carry_their_size_and_unknown_sizes_do_nothing() {
        for size in GRID_SIZES {
            assert_eq!(
                menu_action(&format!("grid-{size}")),
                MenuAction::SetGrid(size)
            );
        }
        assert_eq!(menu_action("grid-7"), MenuAction::Ignore);
        assert_eq!(menu_action("grid-x"), MenuAction::Ignore);
    }

    #[test]
    fn the_grid_default_is_one_of_the_offered_sizes() {
        assert!(GRID_SIZES.contains(&DEFAULT_GRID_SIZE));
        assert_eq!(MenuPrefs::default().grid_size, DEFAULT_GRID_SIZE);
    }

    #[test]
    fn the_recent_entries_are_numbered_from_zero() {
        assert_eq!(menu_action("recent-0"), MenuAction::OpenRecent(0));
        assert_eq!(menu_action("recent-12"), MenuAction::OpenRecent(12));
        assert_eq!(menu_action("recent-x"), MenuAction::Ignore);
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
    fn the_help_menu_opens_the_changelog_and_checks_for_updates() {
        assert_eq!(menu_action("changelog"), emit("menu-changelog"));
        // Le front installe la mise à jour et relance ; le menu ne fait que déclencher.
        assert_eq!(menu_action("check-updates"), emit("menu-check-updates"));
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
    fn no_two_entries_share_an_event_and_payload() {
        // Deux entrées qui émettraient la même chose seraient indiscernables côté front.
        let ids = [
            "file-open",
            "recent-clear",
            "file-close-tab",
            "file-close-others",
            "file-close-all",
            "file-quit",
            "edit-undo",
            "edit-redo",
            "edit-toggle-history",
            "grid-10",
            "grid-25",
            "grid-50",
            "grid-100",
            "view-fullscreen",
            "theme-system",
            "theme-light",
            "theme-dark",
            "changelog",
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

    // ── fichiers récents ─────────────────────────────────────────────────────

    #[test]
    fn a_recent_file_is_shown_by_its_name() {
        assert_eq!(file_name("/home/me/Images/tron.jpg"), "tron.jpg");
        assert_eq!(file_name(r"C:\Users\me\tron.jpg"), "tron.jpg");
        assert_eq!(file_name("tron.jpg"), "tron.jpg");
    }

    // ── construction ─────────────────────────────────────────────────────────

    // muda refuse de construire un menu hors du thread principal sous macOS, et
    // `cargo test` donne un thread à chaque test. La construction n'est donc
    // vérifiable que sur les autres plateformes ; la table des libellés et celle
    // des actions, elles, sont testées partout.
    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn the_menu_can_be_built_in_either_language_and_theme() {
        let app = tauri::test::mock_app();
        for lang in [Lang::En, Lang::Fr] {
            for theme in [Theme::System, Theme::Light, Theme::Dark] {
                let prefs = MenuPrefs {
                    lang,
                    theme,
                    can_undo: true,
                    can_redo: false,
                    has_image: true,
                    grid_size: 25,
                    recent: vec!["/a/b.png".into(), "/a/c.jpg".into()],
                };
                install(app.handle(), &prefs).unwrap();
            }
        }
    }

    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn the_history_entry_is_disabled_without_an_image_and_enabled_with_one() {
        use tauri::menu::MenuItemKind;
        let app = tauri::test::mock_app();
        for (has_image, expected) in [(false, false), (true, true)] {
            let prefs = MenuPrefs {
                has_image,
                ..MenuPrefs::default()
            };
            install(app.handle(), &prefs).unwrap();
            let menu = app.handle().menu().unwrap();
            let entry = menu
                .items()
                .unwrap()
                .into_iter()
                .find_map(|kind| match kind {
                    MenuItemKind::Submenu(sub) => sub.get("edit-toggle-history"),
                    _ => None,
                })
                .expect("the history entry is missing");
            let MenuItemKind::MenuItem(item) = entry else {
                panic!("the history entry is not a plain entry");
            };
            assert_eq!(
                item.is_enabled().unwrap(),
                expected,
                "has_image = {has_image}"
            );
        }
    }

    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn the_menu_can_be_built_without_any_recent_file() {
        let app = tauri::test::mock_app();
        install(app.handle(), &MenuPrefs::default()).unwrap();
    }

    #[cfg_attr(target_os = "macos", ignore)]
    #[test]
    fn switching_language_redraws_the_menu_rather_than_failing() {
        let app = tauri::test::mock_app();
        let mut prefs = MenuPrefs::default();
        install(app.handle(), &prefs).unwrap();

        prefs.lang = Lang::Fr;
        install(app.handle(), &prefs).unwrap();
    }
}
