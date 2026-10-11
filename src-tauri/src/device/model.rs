use serde::{Deserialize, Serialize};

/// One screen's current config, as returned by GET /screens and /screens/{n},
/// and echoed back by both POST endpoints after a successful write.
///
/// `params` is kept as raw JSON rather than a typed-per-control struct: the
/// spec (docs/orbit-api.md) explicitly says the control enum "is expected to
/// grow," so a strict typed shape would either reject valid responses from
/// newer firmware or silently drop data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenSlot {
    pub screen: u8,
    pub control: String,
    pub params: serde_json::Value,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: u64,
    /// On a `blank` screen only: the control its saved layout entry names,
    /// which this firmware was built without. The device keeps that entry
    /// (and brings the screen back under a build that has the control)
    /// until something is written to the screen.
    #[serde(rename = "savedControl", default, skip_serializing_if = "Option::is_none")]
    pub saved_control: Option<String>,
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
    /// The widget on screen now, by its `getName()` (e.g. "OrbIt"). `None`
    /// on firmware that doesn't report it here.
    pub widget: Option<String>,
}

/// What the connected firmware was built with, as the app uses it. Widgets,
/// OrbIt's controls and the screensaver's effects are build-time choices
/// there, and writing a control or effect that was left out is a 501. Put
/// together from GET /api/v1/capabilities (the whole device) or, on firmware
/// without that, GET /orbit/api/v1/capabilities (OrbIt alone) — see
/// `commands::get_capabilities`. Names are kept as the device gives them,
/// for the same reason `ScreenSlot::control` is: the lists are expected to grow.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Capabilities {
    pub controls: Vec<String>,
    /// Only present when `screensaver` is one of `controls`.
    pub screensaver_effects: Option<Vec<String>>,
    /// Every widget in the firmware, in the order Left and Right step
    /// through them. `None` when only OrbIt's own endpoint answered.
    pub widgets: Option<Vec<WidgetCapabilities>>,
}

/// One widget's entry in GET /api/v1/capabilities (firmware source:
/// `WebService::handleCapabilities` and each widget's
/// `describeCapabilities`). Only OrbIt's entry has `controls`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetCapabilities {
    /// The widget's `getName()`, e.g. "OrbIt" or "Clock".
    pub name: String,
    /// Whether it was the one on screen when the device answered.
    pub showing: bool,
    /// The clock's faces ("normal", "nixie", "custom"); other widgets have none.
    pub faces: Option<Vec<String>>,
    #[serde(skip_serializing)]
    pub controls: Option<Vec<String>>,
    #[serde(skip_serializing)]
    pub screensaver_effects: Option<Vec<String>>,
}

/// GET /api/v1/capabilities as the device sends it.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DeviceCapabilities {
    pub widgets: Vec<WidgetCapabilities>,
}

impl DeviceCapabilities {
    /// OrbIt's controls and effects lifted out of its widget entry, or
    /// `None` if no widget lists any controls.
    pub fn into_capabilities(self) -> Option<Capabilities> {
        let orbit = self.widgets.iter().find(|w| w.controls.is_some())?;
        Some(Capabilities {
            controls: orbit.controls.clone().unwrap_or_default(),
            screensaver_effects: orbit.screensaver_effects.clone(),
            widgets: Some(self.widgets),
        })
    }
}

/// One of the orb's three physical buttons, as the core web service names
/// them in POST /api/v1/buttons/{left|ok|right}.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OrbButton {
    Left,
    Ok,
    Right,
}

impl OrbButton {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Ok => "ok",
            Self::Right => "right",
        }
    }
}

/// How long the button is held, as the firmware tells presses apart
/// (`?press=`). Left and Right change widget on a short press only; every
/// other press goes to the widget that's showing.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PressLength {
    Short,
    Medium,
    Long,
}

impl PressLength {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Short => "short",
            Self::Medium => "medium",
            Self::Long => "long",
        }
    }
}

/// The reply to a button press (firmware source: `WebService::handleButton`).
/// `widget` is the one showing once the press has been handled, by its
/// `getName()` (e.g. "OrbIt", "Clock") — the only place the device says so.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ButtonPressed {
    pub button: String,
    pub press: String,
    pub widget: Option<String>,
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
        /// RGB565, like every other color param ("Colors" in docs/orbit-api.md).
        #[serde(skip_serializing_if = "Option::is_none")]
        color: Option<u16>,
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
