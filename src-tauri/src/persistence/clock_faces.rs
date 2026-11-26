use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::profiles::ProfileError;
use super::store::{read_json, write_json_atomic};

/// A clock face designed in the app's builder, saved by name. What's kept
/// is the recipe (the builder's choices: dial, hands, colours, a photo),
/// not the picture made from it; the frontend draws the file the board
/// takes from the recipe whenever it needs one (lib/clockFaceRenderer.ts).
/// The board never sees the name, only the file and `id` as `clockFaceId`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClockFace {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    /// Opaque here: its shape belongs to the frontend's renderer.
    pub recipe: serde_json::Value,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ClockFacesFile {
    #[serde(default, rename = "clockFaces")]
    clock_faces: Vec<ClockFace>,
}

// Clock faces fail the same ways profiles do (a file that can't be written,
// an id that isn't there), so they share the error type.
pub type ClockFaceError = ProfileError;

fn clock_faces_path(app: &AppHandle) -> Result<PathBuf, ClockFaceError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("clock-faces.json"))
        .map_err(|e| ClockFaceError::Io(e.to_string()))
}

pub fn list(app: &AppHandle) -> Result<Vec<ClockFace>, ClockFaceError> {
    Ok(list_at(&clock_faces_path(app)?))
}

pub fn save(app: &AppHandle, name: String, recipe: serde_json::Value) -> Result<ClockFace, ClockFaceError> {
    save_at(&clock_faces_path(app)?, name, recipe)
}

/// Replaces a clock face's name and recipe, keeping its id (which screens
/// and profiles refer to it by) and its place in the list.
pub fn update(
    app: &AppHandle,
    id: &str,
    name: String,
    recipe: serde_json::Value,
) -> Result<ClockFace, ClockFaceError> {
    update_at(&clock_faces_path(app)?, id, name, recipe)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), ClockFaceError> {
    delete_at(&clock_faces_path(app)?, id)
}

fn list_at(path: &Path) -> Vec<ClockFace> {
    read_json::<ClockFacesFile>(path).clock_faces
}

fn save_all_at(path: &Path, clock_faces: &[ClockFace]) -> Result<(), ClockFaceError> {
    write_json_atomic(path, &ClockFacesFile { clock_faces: clock_faces.to_vec() })
        .map_err(|e| ClockFaceError::Io(e.to_string()))
}

fn save_at(path: &Path, name: String, recipe: serde_json::Value) -> Result<ClockFace, ClockFaceError> {
    let mut clock_faces = list_at(path);
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    // Two saved in the same millisecond would otherwise share an id.
    let mut id = format!("cf-{created_at}");
    let mut n = 1;
    while clock_faces.iter().any(|f| f.id == id) {
        n += 1;
        id = format!("cf-{created_at}-{n}");
    }
    let clock_face = ClockFace { id, name, created_at, recipe };
    clock_faces.push(clock_face.clone());
    save_all_at(path, &clock_faces)?;
    Ok(clock_face)
}

fn update_at(
    path: &Path,
    id: &str,
    name: String,
    recipe: serde_json::Value,
) -> Result<ClockFace, ClockFaceError> {
    let mut clock_faces = list_at(path);
    let clock_face = clock_faces
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| ClockFaceError::NotFound(id.to_string()))?;
    clock_face.name = name;
    clock_face.recipe = recipe;
    let updated = clock_face.clone();
    save_all_at(path, &clock_faces)?;
    Ok(updated)
}

fn delete_at(path: &Path, id: &str) -> Result<(), ClockFaceError> {
    let mut clock_faces = list_at(path);
    let before = clock_faces.len();
    clock_faces.retain(|f| f.id != id);
    if clock_faces.len() == before {
        return Err(ClockFaceError::NotFound(id.to_string()));
    }
    save_all_at(path, &clock_faces)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("orbit-clock-faces-test-{nanos}.json"))
    }

    fn recipe(dial: &str) -> serde_json::Value {
        serde_json::json!({ "dial": dial, "hands": "baton" })
    }

    #[test]
    fn save_then_list_round_trips() {
        let path = temp_path();
        let saved = save_at(&path, "Dress".to_string(), recipe("roman")).unwrap();
        assert!(saved.id.starts_with("cf-"));
        assert_eq!(list_at(&path), vec![saved]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn ids_stay_unique_when_saved_back_to_back() {
        let path = temp_path();
        let a = save_at(&path, "A".to_string(), recipe("dots")).unwrap();
        let b = save_at(&path, "B".to_string(), recipe("dots")).unwrap();
        assert_ne!(a.id, b.id);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn update_keeps_id_and_order() {
        let path = temp_path();
        let a = save_at(&path, "A".to_string(), recipe("dots")).unwrap();
        let b = save_at(&path, "B".to_string(), recipe("dots")).unwrap();
        let updated = update_at(&path, &a.id, "A2".to_string(), recipe("track")).unwrap();
        assert_eq!(updated.id, a.id);
        assert_eq!(updated.created_at, a.created_at);
        assert_eq!(updated.name, "A2");
        assert_eq!(updated.recipe, recipe("track"));
        assert_eq!(list_at(&path), vec![updated, b]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_ids_are_not_found() {
        let path = temp_path();
        assert!(matches!(update_at(&path, "nope", "X".to_string(), recipe("dots")), Err(ClockFaceError::NotFound(_))));
        assert!(matches!(delete_at(&path, "nope"), Err(ClockFaceError::NotFound(_))));
    }

    #[test]
    fn delete_removes_exactly_one() {
        let path = temp_path();
        let a = save_at(&path, "A".to_string(), recipe("dots")).unwrap();
        let b = save_at(&path, "B".to_string(), recipe("dots")).unwrap();
        delete_at(&path, &a.id).unwrap();
        assert_eq!(list_at(&path), vec![b]);
        let _ = std::fs::remove_file(&path);
    }
}
