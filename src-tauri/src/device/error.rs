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
}

impl OrbitError {
    pub(super) fn from_reqwest(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            OrbitError::Timeout
        } else {
            OrbitError::Unreachable(err.to_string())
        }
    }
}
