//! The app's own pictures: every one someone has added, kept so the app can
//! send it again to a board that's lost it (a new board, a wiped one, or
//! one that cleared it from its cache for room). Screens and profiles name
//! a picture by its hash, as the board does, so a picture is stored once
//! however many screens show it.
//!
//! On disk, in the app's data folder: `pictures/{hash}.{jpg|png|gif}`, the
//! files exactly as the board takes them, and `pictures/index.json`, their
//! names and details.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::prepare::{hash_of, valid_hash, PictureFormat, PrepareError, Prepared};
use crate::persistence::store::{read_json, write_json_atomic};

/// One picture in the library.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Picture {
    pub hash: String,
    /// What the person calls it; starts as the file's name.
    pub name: String,
    pub format: PictureFormat,
    pub bytes: u64,
    /// 1 for a still.
    pub frames: u32,
    pub added_at: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Index {
    #[serde(default)]
    pictures: Vec<Picture>,
}

/// Shown to the person as it is: serialized as its message.
#[derive(Debug, thiserror::Error)]
pub enum PictureError {
    #[error(transparent)]
    Prepare(#[from] PrepareError),
    #[error("The picture library couldn't be saved: {0}")]
    Io(String),
    #[error("That picture isn't in the library any more.")]
    NotFound(String),
    #[error("'{0}' isn't a picture name.")]
    BadHash(String),
}

impl Serialize for PictureError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

fn io(e: impl std::fmt::Display) -> PictureError {
    PictureError::Io(e.to_string())
}

// Two adds at once (several files dropped together) would otherwise each
// read the index, and the second write would lose the first's picture.
static INDEX: Mutex<()> = Mutex::new(());

pub struct Library {
    dir: PathBuf,
}

impl Library {
    pub fn for_app(app: &AppHandle) -> Result<Self, PictureError> {
        let dir = app.path().app_data_dir().map_err(io)?.join("pictures");
        Ok(Self::at(dir))
    }

    pub fn at(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn index_path(&self) -> PathBuf {
        self.dir.join("index.json")
    }

    fn file_path(&self, picture: &Picture) -> PathBuf {
        self.dir.join(format!("{}.{}", picture.hash, picture.format.extension()))
    }

    fn read_index(&self) -> Vec<Picture> {
        read_json::<Index>(&self.index_path()).pictures
    }

    fn write_index(&self, pictures: Vec<Picture>) -> Result<(), PictureError> {
        write_json_atomic(&self.index_path(), &Index { pictures }).map_err(io)
    }

    /// Every picture, in the order they were added.
    pub fn list(&self) -> Vec<Picture> {
        self.read_index()
    }

    /// Adds a prepared picture. One the library already has (the same file)
    /// is left as it is, name and all, and returned.
    pub fn add(&self, name: &str, prepared: Prepared) -> Result<Picture, PictureError> {
        let hash = hash_of(&prepared.file);
        let _index = INDEX.lock().unwrap_or_else(|e| e.into_inner());
        let mut pictures = self.read_index();
        if let Some(existing) = pictures.iter().find(|p| p.hash == hash) {
            return Ok(existing.clone());
        }
        let picture = Picture {
            hash,
            name: name.trim().to_string(),
            format: prepared.format,
            bytes: prepared.file.len() as u64,
            frames: prepared.frames as u32,
            added_at: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
        };
        fs::create_dir_all(&self.dir).map_err(io)?;
        // The file first: an index entry never names a file that isn't there.
        write_atomic(&self.file_path(&picture), &prepared.file)?;
        pictures.push(picture.clone());
        self.write_index(pictures)?;
        Ok(picture)
    }

    pub fn rename(&self, hash: &str, name: &str) -> Result<Picture, PictureError> {
        let _index = INDEX.lock().unwrap_or_else(|e| e.into_inner());
        let mut pictures = self.read_index();
        let picture = pictures
            .iter_mut()
            .find(|p| p.hash == hash)
            .ok_or_else(|| PictureError::NotFound(hash.to_string()))?;
        picture.name = name.trim().to_string();
        let renamed = picture.clone();
        self.write_index(pictures)?;
        Ok(renamed)
    }

    /// Takes a picture out of the library (not off the board).
    pub fn delete(&self, hash: &str) -> Result<(), PictureError> {
        let _index = INDEX.lock().unwrap_or_else(|e| e.into_inner());
        let mut pictures = self.read_index();
        let at = pictures
            .iter()
            .position(|p| p.hash == hash)
            .ok_or_else(|| PictureError::NotFound(hash.to_string()))?;
        let picture = pictures.remove(at);
        self.write_index(pictures)?;
        // The index first: a file left behind is only wasted space.
        let _ = fs::remove_file(self.file_path(&picture));
        Ok(())
    }

    /// A picture's file, exactly as the board takes it.
    pub fn read(&self, hash: &str) -> Result<Vec<u8>, PictureError> {
        if !valid_hash(hash) {
            return Err(PictureError::BadHash(hash.to_string()));
        }
        let picture = self
            .read_index()
            .into_iter()
            .find(|p| p.hash == hash)
            .ok_or_else(|| PictureError::NotFound(hash.to_string()))?;
        fs::read(self.file_path(&picture)).map_err(|_| PictureError::NotFound(hash.to_string()))
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), PictureError> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(io)?;
    fs::rename(&tmp, path).map_err(io)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_library() -> Library {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        Library::at(std::env::temp_dir().join(format!("orbit-pictures-test-{nanos}-{:?}", std::thread::current().id())))
    }

    fn prepared(content: &[u8]) -> Prepared {
        Prepared { file: content.to_vec(), format: PictureFormat::Png, frames: 1 }
    }

    #[test]
    fn add_stores_the_file_under_its_hash_and_lists_it() {
        let library = temp_library();
        let picture = library.add("  Beach ", prepared(b"one")).unwrap();
        assert_eq!(picture.hash, hash_of(b"one"));
        assert_eq!(picture.name, "Beach");
        assert_eq!(picture.bytes, 3);
        assert_eq!(library.list(), vec![picture.clone()]);
        assert_eq!(library.read(&picture.hash).unwrap(), b"one");
        assert!(library.dir.join(format!("{}.png", picture.hash)).exists());
        let _ = fs::remove_dir_all(&library.dir);
    }

    #[test]
    fn adding_the_same_file_twice_keeps_one() {
        let library = temp_library();
        let first = library.add("First", prepared(b"same")).unwrap();
        let again = library.add("Second", prepared(b"same")).unwrap();
        assert_eq!(again, first);
        assert_eq!(library.list().len(), 1);
        let _ = fs::remove_dir_all(&library.dir);
    }

    #[test]
    fn rename_and_delete() {
        let library = temp_library();
        let a = library.add("A", prepared(b"a")).unwrap();
        let b = library.add("B", prepared(b"b")).unwrap();
        assert_eq!(library.rename(&a.hash, "Alpha").unwrap().name, "Alpha");
        library.delete(&a.hash).unwrap();
        assert_eq!(library.list(), vec![b]);
        assert!(!library.dir.join(format!("{}.png", a.hash)).exists());
        assert!(matches!(library.read(&a.hash), Err(PictureError::NotFound(_))));
        assert!(matches!(library.delete(&a.hash), Err(PictureError::NotFound(_))));
        let _ = fs::remove_dir_all(&library.dir);
    }

    #[test]
    fn read_refuses_what_isnt_a_hash() {
        let library = temp_library();
        assert!(matches!(library.read("../index.json"), Err(PictureError::BadHash(_))));
    }

    #[test]
    fn errors_reach_the_frontend_as_their_message() {
        let json = serde_json::to_string(&PictureError::Prepare(PrepareError::TooBig)).unwrap();
        assert!(json.contains("won't fit in 1 MB"));
    }
}
