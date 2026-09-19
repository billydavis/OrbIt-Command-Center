use std::fs;
use std::path::Path;

use serde::{de::DeserializeOwned, Serialize};

/// Reads a JSON file, returning `T::default()` if it doesn't exist yet or
/// fails to parse (e.g. a corrupt file from a crashed write) rather than
/// erroring — matches the device firmware's own "corrupt layout is logged
/// and ignored" tolerance (docs/orbit-api.md, Persistence section) for the
/// same class of problem on the app side.
pub fn read_json<T: DeserializeOwned + Default>(path: &Path) -> T {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Writes `value` to `path` via write-to-temp-then-rename, so a crash or
/// power loss mid-write can't leave a half-written, corrupt file in place —
/// the rename is atomic on both Windows and POSIX filesystems.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp_path = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(&tmp_path, &bytes)?;
    fs::rename(&tmp_path, path)?;
    Ok(())
}
