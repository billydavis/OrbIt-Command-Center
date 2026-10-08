use serde::Serialize;
use thiserror::Error;

/// Errors from talking to an OrbIt device. `Clone + Serialize` so a
/// `Result<_, OrbitError>` can cross the Tauri command boundary directly.
#[derive(Debug, Error, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum OrbitError {
    #[error("could not reach device: {0}")]
    Unreachable(String),

    #[error("request to device timed out")]
    Timeout,

    /// A non-2xx response with the device's own `{ "error": "..." }` body
    /// (docs/orbit-api.md, "Validation & error responses") parsed out.
    #[error("device rejected request ({status}): {message}")]
    DeviceRejected { status: u16, message: String },

    #[error("unexpected response from device: {0}")]
    Decode(String),

    #[error("no device configured")]
    NotConfigured,

    /// Local (non-device) failures that still need to surface through the
    /// same command boundary — e.g. apply_profile referencing an id that
    /// doesn't exist in profiles.json. Kept generic rather than growing
    /// OrbitError into a catch-all app error type.
    #[error("{0}")]
    Other(String),
}

impl OrbitError {
    /// No answer at all, as opposed to an answer the app didn't like. On its
    /// own this doesn't mean the device is gone (it may only be busy) —
    /// that's the heartbeat's call to make.
    pub fn is_no_response(&self) -> bool {
        matches!(self, OrbitError::Unreachable(_) | OrbitError::Timeout)
    }

    pub(super) fn from_reqwest(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            OrbitError::Timeout
        } else {
            OrbitError::Unreachable(err.to_string())
        }
    }
}
