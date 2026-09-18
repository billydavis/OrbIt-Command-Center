use std::sync::Mutex;

use crate::device::OrbitClient;

/// Shared app state. `device` is `None` until `connect_device` succeeds.
/// A `Mutex` is enough here — writes are infrequent (connect, apply,
/// settings changes) and always short-lived.
#[derive(Default)]
pub struct AppState {
    pub device: Mutex<Option<OrbitClient>>,
}
