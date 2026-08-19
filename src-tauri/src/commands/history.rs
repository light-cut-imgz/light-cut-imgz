use tauri::State;

use super::open::{build_meta, ImageMeta};
use crate::AppState;

#[tauri::command]
pub fn undo_image(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if !history.can_undo() {
        return Err("Nothing to undo".to_string());
    }
    let img = history.undo().ok_or("Undo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[tauri::command]
pub fn redo_image(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if !history.can_redo() {
        return Err("Nothing to redo".to_string());
    }
    let img = history.redo().ok_or("Redo failed")?.clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[tauri::command]
pub fn reset_to_original(state: State<'_, AppState>, tab_id: String) -> Result<ImageMeta, String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let history = map.get_mut(&tab_id).ok_or("Tab not found")?;
    if history.entries.is_empty() {
        return Err("No history".to_string());
    }
    history.index = Some(0);
    let img = history.entries[0].clone();
    let can_undo = history.can_undo();
    let can_redo = history.can_redo();
    build_meta(&img, "png", can_undo, can_redo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{solid, Harness, TAB};
    use crate::AppHistory;

    /// Historique à trois états : 4×4, puis 5×5, puis 6×6.
    fn three_steps() -> Harness {
        let mut h = AppHistory::new();
        h.open(solid(4, 4, [1, 1, 1]));
        h.push(solid(5, 5, [2, 2, 2]));
        h.push(solid(6, 6, [3, 3, 3]));
        Harness::with_history(h)
    }

    #[test]
    fn undo_steps_back_one_entry() {
        let h = three_steps();

        let meta = undo_image(h.state(), TAB.into()).unwrap();

        assert_eq!(meta.width, 5);
        assert!(meta.can_undo);
        assert!(meta.can_redo);
    }

    #[test]
    fn undo_stops_at_the_first_entry() {
        let h = three_steps();

        undo_image(h.state(), TAB.into()).unwrap();
        let meta = undo_image(h.state(), TAB.into()).unwrap();

        assert_eq!(meta.width, 4);
        assert!(!meta.can_undo);
        assert_eq!(
            undo_image(h.state(), TAB.into()).unwrap_err(),
            "Nothing to undo"
        );
    }

    #[test]
    fn redo_steps_forward_again() {
        let h = three_steps();
        undo_image(h.state(), TAB.into()).unwrap();

        let meta = redo_image(h.state(), TAB.into()).unwrap();

        assert_eq!(meta.width, 6);
        assert!(!meta.can_redo);
    }

    #[test]
    fn redo_needs_something_to_replay() {
        let h = three_steps();

        assert_eq!(
            redo_image(h.state(), TAB.into()).unwrap_err(),
            "Nothing to redo"
        );
    }

    #[test]
    fn reset_jumps_back_to_the_opened_image() {
        let h = three_steps();

        let meta = reset_to_original(h.state(), TAB.into()).unwrap();

        assert_eq!(meta.width, 4);
        assert!(!meta.can_undo);
        assert!(meta.can_redo); // les étapes suivantes restent rejouables
    }

    #[test]
    fn reset_needs_a_non_empty_history() {
        assert_eq!(
            reset_to_original(Harness::without_image().state(), TAB.into()).unwrap_err(),
            "No history"
        );
    }

    #[test]
    fn every_history_command_rejects_an_unknown_tab() {
        let h = Harness::empty();

        for err in [
            undo_image(h.state(), TAB.into()).unwrap_err(),
            redo_image(h.state(), TAB.into()).unwrap_err(),
            reset_to_original(h.state(), TAB.into()).unwrap_err(),
        ] {
            assert_eq!(err, "Tab not found");
        }
    }
}
