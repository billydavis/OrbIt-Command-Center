use serde::{Deserialize, Serialize};

/// One screen's current config, as returned by GET /screens and /screens/{n},
/// and echoed back by both POST endpoints after a successful write.
///
/// `params` is kept as raw JSON rather than a typed-per-control struct: the
/// spec (docs/orbit-api.md) explicitly says the control enum "is expected to
/// grow," and read-back for `analogClock`/`custom` is documented as lossy
/// (colors come back as raw RGB565 ints, rich `custom` slots report only
/// `elementCount`) — a strict typed shape would either reject those valid
/// responses or silently drop data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenSlot {
    pub screen: u8,
    pub control: String,
    pub params: serde_json::Value,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: u64,
}

/// GET /api/v1/system — the core info-orbs web service's device status
/// (outside the OrbIt API, so not in docs/orbit-api.md; firmware source:
/// `WebService::fillSystemInfo`). Only on firmware that includes the core
/// web service; older builds 404. Every field is `default` so a firmware
/// build that adds, drops or renames one doesn't fail the heartbeat.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SystemInfo {
    /// e.g. "info-orbs.local"
    pub hostname: String,
    pub ip: String,
    pub mac: String,
    pub ssid: String,
    /// WiFi signal strength in dBm (negative; closer to 0 is stronger).
    pub rssi: i32,
    pub uptime_seconds: u64,
    pub free_heap: u64,
    pub min_free_heap: u64,
    /// Compile timestamp, e.g. "Sep 20 2026 14:03:11".
    pub firmware_built: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct ScreensResponse {
    pub screens: Vec<ScreenSlot>,
}

/// Outgoing body for POST /screens/{n} — no `screen` field, it's in the URL.
/// `Deserialize` too: this crosses the Tauri command boundary from the
/// frontend before being re-serialized to send to the device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenSlotInput {
    pub control: String,
    pub params: serde_json::Value,
}

/// One entry of the outgoing bulk POST /screens body.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BulkScreenSlotInput {
    pub screen: u8,
    pub control: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct BulkScreensRequest {
    pub screens: Vec<BulkScreenSlotInput>,
}

/// The device's own error body shape: `{ "error": "..." }`.
#[derive(Debug, Deserialize)]
pub(super) struct DeviceErrorBody {
    pub error: String,
}

/// `params.action` values for the `countdown` control (docs/orbit-api.md,
/// "countdown control" section) — action/state-driven rather than a
/// full-state POST like every other control.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action")]
pub enum CountdownAction {
    #[serde(rename = "set")]
    Set {
        #[serde(rename = "durationSeconds")]
        duration_seconds: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        color: Option<String>,
    },
    #[serde(rename = "pause")]
    Pause,
    #[serde(rename = "resume")]
    Resume,
    #[serde(rename = "restart")]
    Restart,
    #[serde(rename = "stop")]
    Stop,
}
