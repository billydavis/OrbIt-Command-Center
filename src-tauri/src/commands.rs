use tauri::{AppHandle, State};

use crate::device::{
    BulkScreenSlotInput, CountdownAction, OrbitClient, OrbitError, ScreenSlot, ScreenSlotInput,
};
use crate::discovery::{self, DiscoveredDevice};
use crate::feeds::bindings::{self, ScreenBinding};
use crate::feeds::{Feed, FeedServerStatus};
use crate::persistence::{profile_store, Profile, ProfileError};
use crate::state::AppState;

/// Probes the device at `host` (GET /screens) and, on success, stores the
/// client for subsequent commands. Does not persist `host` yet — settings
/// persistence lands in a later step.
#[tauri::command]
pub async fn connect_device(
    host: String,
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    let client = OrbitClient::new(&host);
    let screens = client.get_screens().await?;
    *state.device.lock().expect("device state mutex poisoned") = Some(client);
    state.set_layout(screens.clone());
    Ok(with_bindings(&state, screens))
}

#[tauri::command]
pub fn disconnect_device(state: State<'_, AppState>) {
    *state.device.lock().expect("device state mutex poisoned") = None;
    *state.last_layout.lock().expect("layout mutex poisoned") = None;
}

/// Scans the LAN over mDNS for OrbIt devices (see discovery/mod.rs). Takes a
/// few seconds by design; doesn't touch the current connection.
#[tauri::command]
pub async fn discover_devices() -> Result<Vec<DiscoveredDevice>, OrbitError> {
    discovery::scan().await
}

#[tauri::command]
pub async fn get_screens(state: State<'_, AppState>) -> Result<Vec<ScreenSlot>, OrbitError> {
    let screens = with_device(&state, |client| async move { client.get_screens().await }).await?;
    state.set_layout(screens.clone());
    Ok(with_bindings(&state, screens))
}

#[tauri::command]
pub async fn get_screen(n: u8, state: State<'_, AppState>) -> Result<ScreenSlot, OrbitError> {
    let slot = with_device(&state, |client| async move { client.get_screen(n).await }).await?;
    Ok(with_binding(&state, slot))
}

#[tauri::command]
pub async fn apply_layout(
    slots: Vec<BulkScreenSlotInput>,
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    write_bulk(&state, slots).await
}

#[tauri::command]
pub async fn apply_screen(
    n: u8,
    slot: ScreenSlotInput,
    state: State<'_, AppState>,
) -> Result<ScreenSlot, OrbitError> {
    let (params, binding) = prepare_write(&state, &slot.control, slot.params);
    let slot = ScreenSlotInput { control: slot.control, params };
    let _writing = state.device_writes.lock().await;
    let applied =
        with_device(&state, |client| async move { client.post_screen(n, slot).await }).await?;
    state.bindings.set(n, binding);
    state.patch_layout_slot(applied.clone());
    Ok(with_binding(&state, applied))
}

#[tauri::command]
pub async fn refresh_ticker(n: u8, state: State<'_, AppState>) -> Result<ScreenSlot, OrbitError> {
    let _writing = state.device_writes.lock().await;
    let updated =
        with_device(&state, |client| async move { client.refresh_ticker(n).await }).await?;
    state.patch_layout_slot(updated.clone());
    Ok(with_binding(&state, updated))
}

/// Leaves the screen's feed binding alone: a countdown sits on top of
/// whatever was there and `stop` hands the screen back to it, so a bound
/// gauge picks up its feed again afterwards.
#[tauri::command]
pub async fn countdown_action(
    n: u8,
    action: CountdownAction,
    state: State<'_, AppState>,
) -> Result<ScreenSlot, OrbitError> {
    let _writing = state.device_writes.lock().await;
    let updated = with_device(&state, |client| async move { client.countdown_action(n, action).await })
        .await?;
    state.patch_layout_slot(updated.clone());
    Ok(with_binding(&state, updated))
}

#[tauri::command]
pub fn list_profiles(app: AppHandle) -> Result<Vec<Profile>, ProfileError> {
    profile_store::list(&app)
}

#[tauri::command]
pub fn save_profile(
    app: AppHandle,
    name: String,
    slots: Vec<BulkScreenSlotInput>,
) -> Result<Profile, ProfileError> {
    profile_store::save(&app, name, slots)
}

#[tauri::command]
pub fn update_profile(
    app: AppHandle,
    id: String,
    slots: Vec<BulkScreenSlotInput>,
) -> Result<Profile, ProfileError> {
    profile_store::update(&app, &id, slots)
}

#[tauri::command]
pub fn delete_profile(app: AppHandle, id: String) -> Result<(), ProfileError> {
    profile_store::delete(&app, &id)
}

#[tauri::command]
pub async fn apply_profile(
    app: AppHandle,
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    let profile = profile_store::get(&app, &id).map_err(|e| OrbitError::Other(e.to_string()))?;
    write_bulk(&state, profile.slots).await
}

#[tauri::command]
pub fn list_feeds(state: State<'_, AppState>) -> Vec<Feed> {
    state.feeds.list()
}

/// Removes an external feed. Screens bound to it keep their binding and
/// their last value, and follow the feed again if its app pushes once more.
#[tauri::command]
pub fn delete_feed(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.feeds.remove_external(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn feed_server_status(state: State<'_, AppState>) -> FeedServerStatus {
    state.feed_server.lock().expect("feed server mutex poisoned").clone()
}

/// The frontend owns this preference (it's saved with the other settings in
/// the webview) and calls this at startup and whenever it changes.
#[tauri::command]
pub fn set_show_in_taskbar(app: AppHandle, show: bool) {
    crate::tray::set_show_in_taskbar(&app, show);
}

/// The flyout's "Open full window".
#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    crate::tray::show_main_window(&app);
}

/// Escape in the flyout.
#[tauri::command]
pub fn hide_flyout(app: AppHandle) {
    crate::tray::hide_flyout(&app);
}

#[tauri::command]
pub async fn gpu_monitoring_available() -> bool {
    crate::sysmonitor::gpu::is_available().await
}

/// Clones the connected client out of the mutex (cheap: `reqwest::Client` is
/// an `Arc` internally) so the lock isn't held across an `.await`, then runs
/// `f` against it.
async fn with_device<T, F, Fut>(state: &State<'_, AppState>, f: F) -> Result<T, OrbitError>
where
    F: FnOnce(OrbitClient) -> Fut,
    Fut: std::future::Future<Output = Result<T, OrbitError>>,
{
    let client = state
        .device
        .lock()
        .expect("device state mutex poisoned")
        .clone()
        .ok_or(OrbitError::NotConfigured)?;
    f(client).await
}

/// Bulk write shared by Apply Layout and applying a profile: each slot's
/// feed binding (feeds/bindings.rs) is split off before the POST and
/// recorded once the device has accepted the write.
async fn write_bulk(
    state: &State<'_, AppState>,
    slots: Vec<BulkScreenSlotInput>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    let mut requested: Vec<(u8, Option<ScreenBinding>)> = Vec::with_capacity(slots.len());
    let clean: Vec<BulkScreenSlotInput> = slots
        .into_iter()
        .map(|slot| {
            let (params, binding) = prepare_write(state, &slot.control, slot.params);
            requested.push((slot.screen, binding));
            BulkScreenSlotInput { screen: slot.screen, control: slot.control, params }
        })
        .collect();

    let _writing = state.device_writes.lock().await;
    let applied =
        with_device(state, |client| async move { client.post_screens_bulk(clean).await }).await?;
    for (screen, binding) in requested {
        state.bindings.set(screen, binding);
    }
    for slot in &applied {
        state.patch_layout_slot(slot.clone());
    }
    Ok(with_bindings(state, applied))
}

/// Params as the device should receive them — `$bind` removed, bound params
/// set to their feeds' current values — plus the binding to record if the
/// write succeeds.
fn prepare_write(
    state: &AppState,
    control: &str,
    params: serde_json::Value,
) -> (serde_json::Value, Option<ScreenBinding>) {
    let (mut params, binding) = bindings::split(control, params);
    if let Some(binding) = &binding {
        bindings::fill_values(&mut params, binding, &state.feeds);
    }
    (params, binding)
}

fn with_binding(state: &AppState, mut slot: ScreenSlot) -> ScreenSlot {
    let binding = state.bindings.get(slot.screen);
    bindings::attach(&mut slot, binding.as_ref());
    slot
}

fn with_bindings(state: &AppState, slots: Vec<ScreenSlot>) -> Vec<ScreenSlot> {
    slots.into_iter().map(|slot| with_binding(state, slot)).collect()
}
