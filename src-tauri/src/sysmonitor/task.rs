use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::time;

use super::collector::{Collector, CpuRamSample};
use super::gpu::{self, GpuSample};
use crate::device::{OrbitClient, ScreenSlotInput};
use crate::feeds::FeedHints;
use crate::state::AppState;

const TICK_INTERVAL: Duration = Duration::from_secs(5);

// The same readings a sysMonitor screen gets, published one by one as feeds
// (feeds/registry.rs) so any of them can drive a screen of its own.
const FEED_CPU: &str = "sys.cpu";
const FEED_RAM: &str = "sys.ram";
const FEED_GPU: &str = "sys.gpu";
const FEED_GPU_TEMP: &str = "sys.gpuTemp";

/// Spawns the background loop as a Tokio task. Runs for the lifetime of the
/// app (there's no explicit stop — every tick is already cheap/idle when
/// there's no device connected or no sysMonitor screen, so a dedicated
/// start/stop lifecycle isn't worth the extra state to manage in v1).
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut collector = Collector::new();

        // One GPU reading up front, so the GPU feeds are there to be picked
        // on machines that have one — after this they're only sampled while
        // something is actually showing them (see run_tick).
        if let Some(sample) = gpu::sample().await {
            publish_gpu(&app.state::<AppState>(), &sample);
        }

        let mut interval = time::interval(TICK_INTERVAL);
        loop {
            interval.tick().await;
            run_tick(&app, &mut collector).await;
        }
    });
}

async fn run_tick(app: &AppHandle, collector: &mut Collector) {
    let state = app.state::<AppState>();

    // CPU/RAM are cheap to read, so their feeds stay live whether or not a
    // device is connected or anything is showing them.
    let cpu_ram = collector.sample();
    publish_cpu_ram(&state, &cpu_ram);

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

    // The GPU reading shells out, so it's skipped unless a screen wants it:
    // a sysMonitor, or one bound to a GPU feed.
    let gpu_wanted = !sysmonitor_screens.is_empty()
        || state.bindings.references_any(&[FEED_GPU, FEED_GPU_TEMP]);
    let gpu = if gpu_wanted { gpu::sample().await } else { None };
    if let Some(sample) = &gpu {
        publish_gpu(&state, sample);
    }

    if sysmonitor_screens.is_empty() {
        return;
    }

    let base_params = build_base_params(&cpu_ram, gpu.as_ref());

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

fn publish_cpu_ram(state: &AppState, sample: &CpuRamSample) {
    state.feeds.publish_builtin(FEED_CPU, sample.cpu_percent.round() as f64, percent_hints("CPU"));
    state.feeds.publish_builtin(FEED_RAM, sample.ram_percent.round() as f64, percent_hints("RAM"));
}

fn publish_gpu(state: &AppState, sample: &GpuSample) {
    state.feeds.publish_builtin(FEED_GPU, sample.gpu_percent.round() as f64, percent_hints("GPU"));
    // Not 0-100: the device's gauge puts a "%" after the value for exactly
    // that range, which would be wrong on a temperature.
    state.feeds.publish_builtin(
        FEED_GPU_TEMP,
        sample.gpu_temp_c.round() as f64,
        FeedHints { label: Some("GPU C".to_string()), min: Some(0.0), max: Some(110.0) },
    );
}

fn percent_hints(label: &str) -> FeedHints {
    FeedHints { label: Some(label.to_string()), min: Some(0.0), max: Some(100.0) }
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

fn build_base_params(cpu_ram: &CpuRamSample, gpu: Option<&GpuSample>) -> serde_json::Value {
    let mut params = serde_json::json!({
        "cpu": cpu_ram.cpu_percent.round(),
        "ram": cpu_ram.ram_percent.round(),
        "ramTotal": (cpu_ram.ram_total_gb * 10.0).round() / 10.0,
    });

    // Best-effort: GPU fields are simply omitted (not zeroed) when
    // unavailable, matching the API's "all params optional, default 0" —
    // an omitted field reads differently from an explicit misleading 0%.
    if let Some(g) = gpu {
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
        // A device that didn't answer is the heartbeat's to report, once
        // it's sure; the next tick pushes fresh readings anyway.
        Err(err) if err.is_no_response() => {}
        Err(err) => {
            let _ = app.emit("device-error", &err);
        }
    }
}
