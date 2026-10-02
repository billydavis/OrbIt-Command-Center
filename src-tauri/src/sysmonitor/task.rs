use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::time;

use super::collector::Collector;
use super::gpu;
use crate::device::{OrbitClient, ScreenSlotInput};
use crate::state::AppState;

const TICK_INTERVAL: Duration = Duration::from_secs(5);

/// Spawns the background loop as a Tokio task. Runs for the lifetime of the
/// app (there's no explicit stop — every tick is already cheap/idle when
/// there's no device connected or no sysMonitor screen, so a dedicated
/// start/stop lifecycle isn't worth the extra state to manage in v1).
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut collector = Collector::new();
        let mut interval = time::interval(TICK_INTERVAL);
        loop {
            interval.tick().await;
            run_tick(&app, &mut collector).await;
        }
    });
}

async fn run_tick(app: &AppHandle, collector: &mut Collector) {
    let state = app.state::<AppState>();

    let client = { state.device.lock().expect("device state mutex poisoned").clone() };
    let Some(client) = client else { return };

    // Only reads AppState's cached layout (kept in sync by commands.rs on
    // every successful device call) — deliberately never issues its own
    // GET /screens, so an idle app with no sysMonitor slot generates zero
    // device traffic from this loop. Each screen's current `center` choice
    // (docs/orbit-api.md: params.center picks what the middle of the screen
    // shows) is captured here too — POST replaces a slot's entire params,
    // so if this tick's push didn't re-send it, the user's choice would get
    // silently clobbered back to "auto" every ~5s.
    let sysmonitor_screens: Vec<u8> = {
        let layout = state.last_layout.lock().expect("layout mutex poisoned");
        match layout.as_ref() {
            Some(screens) => {
                screens.iter().filter(|s| s.control == "sysMonitor").map(|s| s.screen).collect()
            }
            None => return,
        }
    };
    if sysmonitor_screens.is_empty() {
        return;
    }

    let base_params = build_base_params(collector).await;

    for screen in sysmonitor_screens {
        // Sampling above takes a while (the GPU reading shells out), and a
        // push is a full write of the slot, so check again, under the write
        // lock, that this screen is still sysMonitor. Otherwise an Apply
        // that changed it in the meantime would be overwritten here and the
        // screen would flip back to sysMonitor for good.
        let _writing = state.device_writes.lock().await;
        let Some(center) = sysmonitor_center(&state, screen) else { continue };
        let mut params = base_params.clone();
        if let Some(center_value) = center {
            params["center"] = serde_json::Value::String(center_value);
        }
        push_to_screen(app, &state, &client, screen, params).await;
    }
}

/// `None` if `screen` isn't (or is no longer) a sysMonitor; otherwise its
/// `center` choice, if it has one.
///
/// An empty string is treated the same as "not set" (so it's simply omitted
/// from the next push) rather than forwarded as-is: the device will happily
/// echo back a stale/legacy `"center": ""` via GET, but rejects that same
/// value with a 400 if POSTed — "" isn't one of the documented center values
/// (cpu/cpuTemp/gpu/gpuTemp/ram/ssdTemp/none), so blindly round-tripping
/// whatever was last seen breaks the very first tick after connecting to a
/// device with that legacy state.
fn sysmonitor_center(state: &AppState, screen: u8) -> Option<Option<String>> {
    let layout = state.last_layout.lock().expect("layout mutex poisoned");
    let slot = layout.as_ref()?.iter().find(|s| s.screen == screen && s.control == "sysMonitor")?;
    Some(
        slot.params
            .get("center")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
    )
}

async fn build_base_params(collector: &mut Collector) -> serde_json::Value {
    let cpu_ram = collector.sample();
    let mut params = serde_json::json!({
        "cpu": cpu_ram.cpu_percent.round(),
        "ram": cpu_ram.ram_percent.round(),
        "ramTotal": (cpu_ram.ram_total_gb * 10.0).round() / 10.0,
    });

    // Best-effort: GPU fields are simply omitted (not zeroed) when
    // unavailable, matching the API's "all params optional, default 0" —
    // an omitted field reads differently from an explicit misleading 0%.
    if let Some(g) = gpu::sample().await {
        params["gpu"] = serde_json::json!(g.gpu_percent.round());
        params["gpuTemp"] = serde_json::json!(g.gpu_temp_c.round());
    }

    params
}

async fn push_to_screen(
    app: &AppHandle,
    state: &AppState,
    client: &OrbitClient,
    screen: u8,
    params: serde_json::Value,
) {
    let slot = ScreenSlotInput { control: "sysMonitor".to_string(), params };
    match client.post_screen(screen, slot).await {
        Ok(updated) => {
            state.patch_layout_slot(updated.clone());
            let _ = app.emit("sysmonitor://tick", &updated);
        }
        Err(err) => {
            let _ = app.emit("device-error", &err);
        }
    }
}
