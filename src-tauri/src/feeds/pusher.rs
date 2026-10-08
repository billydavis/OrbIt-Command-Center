use std::collections::HashMap;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use tokio::time;

use super::bindings;
use crate::device::ScreenSlotInput;
use crate::state::AppState;

/// How often bound screens are checked against their feeds. This is the
/// ceiling on how fast a screen follows a feed, however often its app pushes.
const TICK_INTERVAL: Duration = Duration::from_secs(1);

/// After a failed push, how long that screen is left alone — otherwise a
/// write the device keeps rejecting would raise an error every second.
const RETRY_AFTER_FAILURE: Duration = Duration::from_secs(10);

/// Emitted with the full feed list whenever any feed changed since the last
/// tick.
pub const FEEDS_CHANGED_EVENT: &str = "feeds://changed";

/// Spawns the loop that keeps bound screen params equal to their feeds, for
/// the lifetime of the app. Idle (no device traffic) while nothing is bound
/// or nothing changed.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = time::interval(TICK_INTERVAL);
        interval.set_missed_tick_behavior(time::MissedTickBehavior::Delay);
        let mut failed_at: HashMap<u8, Instant> = HashMap::new();
        loop {
            interval.tick().await;
            run_tick(&app, &mut failed_at).await;
        }
    });
}

async fn run_tick(app: &AppHandle, failed_at: &mut HashMap<u8, Instant>) {
    let state = app.state::<AppState>();

    if state.feeds.take_dirty() {
        let _ = app.emit(FEEDS_CHANGED_EVENT, state.feeds.list());
    }

    let client = { state.device.lock().expect("device state mutex poisoned").clone() };
    let Some(client) = client else { return };

    failed_at.retain(|_, at| at.elapsed() < RETRY_AFTER_FAILURE);

    for screen in state.bindings.all().into_keys() {
        if failed_at.contains_key(&screen) || pending_push(&state, screen).is_none() {
            continue;
        }
        // A push is a full write of the slot, so decide again under the write
        // lock: an Apply that landed since the check above may have changed
        // this screen's control or binding, and pushing the stale params
        // would undo it (same reasoning as sysmonitor/task.rs).
        let _writing = state.device_writes.lock().await;
        let Some((control, params)) = pending_push(&state, screen) else { continue };
        match client.post_screen(screen, ScreenSlotInput { control, params }).await {
            Ok(updated) => state.patch_layout_slot(updated),
            Err(err) => {
                failed_at.insert(screen, Instant::now());
                // A device that didn't answer is the heartbeat's to report,
                // once it's sure; the next push carries the reading anyway.
                if !err.is_no_response() {
                    let _ = app.emit("device-error", &err);
                }
            }
        }
    }
}

/// The control and params to write to `screen` right now, if its binding
/// calls for one. Reads only the cached layout — like the sysMonitor loop,
/// this never issues a GET of its own. After the device restarts, the
/// heartbeat refreshes that cache with the gauge back at 0, which is what
/// makes the reading get pushed again.
fn pending_push(state: &AppState, screen: u8) -> Option<(String, serde_json::Value)> {
    let binding = state.bindings.get(screen)?;
    let layout = state.last_layout.lock().expect("layout mutex poisoned");
    let slot = layout.as_ref()?.iter().find(|s| s.screen == screen)?;
    let params = bindings::pending_push(slot, &binding, &state.feeds)?;
    Some((slot.control.clone(), params))
}
