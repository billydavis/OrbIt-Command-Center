use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::store::{read_json, write_json_atomic};
use crate::device::BulkScreenSlotInput;

/// A named, locally-saved layout — distinct from the device's own layout
/// persistence (NVS on the device itself). The device only knows about
/// "whatever the last bulk POST was"; profiles are purely an app-side
/// convenience for switching between saved layouts.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    /// countdown screens are never included — see save_profile's caller
    /// (commands.rs), which filters them out before this struct is built,
    /// matching decision #6: countdown isn't part of the uniform
    /// full-state-POST layout model this represents.
    pub slots: Vec<BulkScreenSlotInput>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ProfilesFile {
    #[serde(default)]
    profiles: Vec<Profile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ProfileError {
    Io(String),
    NotFound(String),
}

impl std::fmt::Display for ProfileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProfileError::Io(msg) => write!(f, "profile storage error: {msg}"),
            ProfileError::NotFound(id) => write!(f, "profile '{id}' not found"),
        }
    }
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, ProfileError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("profiles.json"))
        .map_err(|e| ProfileError::Io(e.to_string()))
}

pub fn list(app: &AppHandle) -> Result<Vec<Profile>, ProfileError> {
    Ok(list_at(&profiles_path(app)?))
}

pub fn save(app: &AppHandle, name: String, slots: Vec<BulkScreenSlotInput>) -> Result<Profile, ProfileError> {
    save_at(&profiles_path(app)?, name, slots)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), ProfileError> {
    delete_at(&profiles_path(app)?, id)
}

pub fn get(app: &AppHandle, id: &str) -> Result<Profile, ProfileError> {
    get_at(&profiles_path(app)?, id)
}

// --- path-parameterized core logic, kept separate from AppHandle/tauri's
// path resolution above so it can be unit-tested against a temp dir. ---

fn list_at(path: &Path) -> Vec<Profile> {
    read_json::<ProfilesFile>(path).profiles
}

fn save_all_at(path: &Path, profiles: &[Profile]) -> Result<(), ProfileError> {
    write_json_atomic(path, &ProfilesFile { profiles: profiles.to_vec() })
        .map_err(|e| ProfileError::Io(e.to_string()))
}

fn save_at(path: &Path, name: String, slots: Vec<BulkScreenSlotInput>) -> Result<Profile, ProfileError> {
    let mut profiles = list_at(path);
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let profile = Profile {
        id: format!("{created_at}"),
        name,
        created_at,
        slots,
    };
    profiles.push(profile.clone());
    save_all_at(path, &profiles)?;
    Ok(profile)
}

fn delete_at(path: &Path, id: &str) -> Result<(), ProfileError> {
    let mut profiles = list_at(path);
    let before = profiles.len();
    profiles.retain(|p| p.id != id);
    if profiles.len() == before {
        return Err(ProfileError::NotFound(id.to_string()));
    }
    save_all_at(path, &profiles)
}

fn get_at(path: &Path, id: &str) -> Result<Profile, ProfileError> {
    list_at(path)
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| ProfileError::NotFound(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_profiles_path() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("orbit-profiles-test-{}.json", uuid_like()));
        path
    }

    // Avoids pulling in the `uuid` crate for one test helper.
    fn uuid_like() -> u128 {
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    }

    fn sample_slots() -> Vec<BulkScreenSlotInput> {
        vec![BulkScreenSlotInput {
            screen: 0,
            control: "time".to_string(),
            params: serde_json::json!({ "showDate": true }),
        }]
    }

    #[test]
    fn save_then_list_round_trips() {
        let path = temp_profiles_path();
        let saved = save_at(&path, "Work".to_string(), sample_slots()).unwrap();
        let listed = list_at(&path);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], saved);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn get_missing_profile_is_not_found() {
        let path = temp_profiles_path();
        let err = get_at(&path, "does-not-exist").unwrap_err();
        assert!(matches!(err, ProfileError::NotFound(id) if id == "does-not-exist"));
    }

    #[test]
    fn delete_removes_exactly_one_profile() {
        let path = temp_profiles_path();
        let a = save_at(&path, "A".to_string(), sample_slots()).unwrap();
        let b = save_at(&path, "B".to_string(), sample_slots()).unwrap();

        delete_at(&path, &a.id).unwrap();

        let remaining = list_at(&path);
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, b.id);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn delete_missing_profile_errors() {
        let path = temp_profiles_path();
        save_at(&path, "A".to_string(), sample_slots()).unwrap();
        let err = delete_at(&path, "nope").unwrap_err();
        assert!(matches!(err, ProfileError::NotFound(_)));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn missing_file_reads_as_empty_list() {
        let path = temp_profiles_path();
        assert_eq!(list_at(&path).len(), 0);
    }
}
