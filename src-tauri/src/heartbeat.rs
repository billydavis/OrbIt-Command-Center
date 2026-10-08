use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tokio::time;

use crate::device::{OrbitClient, OrbitError, SystemInfo};
use crate::state::AppState;

/// How often the connected device is probed. Without this, an idle app only
/// notices a vanished device the next time the user does something — a
/// reboot or power-off would go unseen indefinitely.
const PROBE_INTERVAL: Duration = Duration::from_secs(5);

/// Consecutive failed probes before the device counts as gone. The device
/// goes quiet for seconds at a time while it fetches weather or a ticker
/// (one request per weather location, back to back), and that shouldn't
/// bounce the user to the connect screen. Four in a row is about 40s of
/// silence from a device that's on the network but not answering, or about
/// 20s from one that's off it (those probes fail at the connect timeout).
const FAILURES_BEFORE_LOST: u32 = 4;

/// Emitted with the last probe's `OrbitError` when the device counts as
/// gone and the connection has been dropped. Nothing else decides that: a
/// command or background push that gets no answer is just a failed request.
pub const LOST_EVENT: &str = "device://lost";

/// Emitted with a `SystemInfo` after every successful probe on firmware
/// that has GET /api/v1/system.
pub const SYSTEM_EVENT: &str = "device://system";

/// Emitted (no payload) once per connection when the firmware turns out not
/// to have GET /api/v1/system, so the UI can say so instead of waiting.
pub const SYSTEM_UNSUPPORTED_EVENT: &str = "device://system-unsupported";

/// Emitted with the new `SystemInfo` when the device's uptime went
/// backwards between probes — it restarted quickly enough that the probes
/// never saw it go missing.
pub const REBOOTED_EVENT: &str = "device://rebooted";

/// What the heartbeat remembers between probes, all about one connection:
/// reset whenever the connected device changes.
#[derive(Default)]
struct Tracker {
    /// `base_url` of the client these fields describe.
    device: Option<String>,
    failures: u32,
    /// Set once GET /api/v1/system 404s, so older firmware isn't asked for it
    /// again every tick — probes fall back to GET /orbit/api/v1/screens.
    system_unsupported: bool,
    last_uptime: Option<u64>,
}

/// Spawns the heartbeat as a Tokio task for the lifetime of the app. Idle
/// (no traffic at all) while no device is connected.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = time::interval(PROBE_INTERVAL);
        // A probe that runs long (request timeout) shouldn't be followed by
        // a burst of catch-up probes.
        interval.set_missed_tick_behavior(time::MissedTickBehavior::Delay);
        let mut tracker = Tracker::default();
        loop {
            interval.tick().await;
            probe(&app, &mut tracker).await;
        }
    });
}

async fn probe(app: &AppHandle, tracker: &mut Tracker) {
    let state = app.state::<AppState>();
    let client = { state.device.lock().expect("device state mutex poisoned").clone() };
    let Some(client) = client else {
        *tracker = Tracker::default();
        return;
    };
    if tracker.device.as_deref() != Some(client.base_url()) {
        *tracker = Tracker { device: Some(client.base_url().to_string()), ..Tracker::default() };
    }

    let result = if tracker.system_unsupported {
        client.get_screens().await.map(|_| None)
    } else {
        match client.get_system().await {
            Err(OrbitError::DeviceRejected { status: 404, .. }) => {
                tracker.system_unsupported = true;
                let _ = app.emit(SYSTEM_UNSUPPORTED_EVENT, ());
                client.get_screens().await.map(|_| None)
            }
            other => other.map(Some),
        }
    };

    match result {
        Ok(info) => {
            tracker.failures = 0;
            if let Some(info) = info {
                on_system_info(app, &state, &client, tracker, info).await;
            }
        }
        // Any HTTP response at all — even an error status or an unparseable
        // body — means the device is on the network and answering, which is
        // all a liveness check cares about. Only no-response counts.
        Err(OrbitError::DeviceRejected { .. } | OrbitError::Decode(_)) => tracker.failures = 0,
        Err(err) => {
            tracker.failures += 1;
            if tracker.failures >= FAILURES_BEFORE_LOST {
                mark_lost(app, &state, &client, err);
                *tracker = Tracker::default();
            }
        }
    }
}

async fn on_system_info(
    app: &AppHandle,
    state: &AppState,
    client: &OrbitClient,
    tracker: &mut Tracker,
    info: SystemInfo,
) {
    // Uptime going backwards means a restart. (The firmware's uptime is
    // 32-bit millis()/1000, so it also wraps after ~49.7 days — that reads as
    // a restart too, which is harmless: the handling below is idempotent.)
    let rebooted = tracker.last_uptime.is_some_and(|prev| info.uptime_seconds < prev);
    tracker.last_uptime = Some(info.uptime_seconds);

    if rebooted {
        // The device restored its layout from flash, but anything transient
        // (a running countdown, a ticker's last price) reset — refresh the
        // cached layout the sysMonitor loop reads. Best-effort: if this fails
        // the next successful device call resyncs it anyway.
        if let Ok(screens) = client.get_screens().await {
            state.set_layout(screens);
        }
        let _ = app.emit(REBOOTED_EVENT, &info);
    }
    let _ = app.emit(SYSTEM_EVENT, &info);
}

/// Drops the connection and tells the frontend, which goes back to the
/// connect screen in its "lost" state.
fn mark_lost(app: &AppHandle, state: &AppState, client: &OrbitClient, err: OrbitError) {
    // Only tear down the connection this probe was actually about: the user
    // may have disconnected or connected to another device mid-request.
    {
        let mut device = state.device.lock().expect("device state mutex poisoned");
        if device.as_ref().map(|d| d.base_url()) != Some(client.base_url()) {
            return;
        }
        *device = None;
    }
    *state.last_layout.lock().expect("layout mutex poisoned") = None;
    let _ = app.emit(LOST_EVENT, &err);
}
