use std::sync::atomic::Ordering;

use tauri::{AppHandle, State};

use crate::device::{
    BulkScreenSlotInput, ButtonPressed, Capabilities, ClockFaceUploaded, CountdownAction, OrbButton, OrbPictures,
    OrbitClient, OrbitError, PictureStored, PressLength, ScreenSlot, ScreenSlotInput, SystemInfo,
};
use crate::discovery::{self, DiscoveredDevice};
use crate::feeds::bindings::{self, ScreenBinding};
use crate::feeds::{Feed, FeedServerStatus};
use crate::persistence::{clock_face_store, profile_store, ClockFace, Profile, ProfileError};
use crate::pictures::{prepare, Library, Picture, PictureError};
use crate::state::AppState;

/// Probes the device at `host` (GET /screens) and, on success, stores the
/// client for subsequent commands. Does not persist `host` yet — settings
/// persistence lands in a later step.
///
/// See `AppState::connection_generation`: two calls to this command can
/// genuinely be in flight at once (the connect screen's own automatic
/// reconnect racing a manual click on a different device), and only the one
/// that started last should get to become `device`/`last_layout` — an
/// earlier one finishing after it must not clobber the connection the user
/// actually asked for last.
#[tauri::command]
pub async fn connect_device(
    host: String,
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    let my_generation = state.connection_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let client = OrbitClient::new(&host);
    let screens = client.get_screens().await?;
    if state.connection_generation.load(Ordering::SeqCst) != my_generation {
        return Err(OrbitError::Other("superseded by a newer connection attempt".to_string()));
    }
    *state.device.lock().expect("device state mutex poisoned") = Some(client);
    state.set_layout(screens.clone());
    Ok(with_bindings(&state, screens))
}

#[tauri::command]
pub fn disconnect_device(state: State<'_, AppState>) {
    state.connection_generation.fetch_add(1, Ordering::SeqCst);
    *state.device.lock().expect("device state mutex poisoned") = None;
    *state.last_layout.lock().expect("layout mutex poisoned") = None;
}

/// Scans the LAN over mDNS for OrbIt devices (see discovery/mod.rs). Takes a
/// few seconds by design; doesn't touch the current connection.
#[tauri::command]
pub async fn discover_devices() -> Result<Vec<DiscoveredDevice>, OrbitError> {
    discovery::scan().await
}

/// What the connected firmware was built with, or `None` on firmware from
/// before that was a choice, where everything is built. Asks the device as
/// a whole first (widgets too); firmware without that endpoint 404s it, and
/// OrbIt's own is asked instead, which knows the controls but no widgets.
#[tauri::command]
pub async fn get_capabilities(
    state: State<'_, AppState>,
) -> Result<Option<Capabilities>, OrbitError> {
    with_device(&state, |client| async move {
        match client.get_device_capabilities().await {
            Ok(device) => {
                if let Some(mut capabilities) = device.into_capabilities() {
                    // The device-wide list names OrbIt's controls but not
                    // what they can do (transitions, clock faces); OrbIt's
                    // own endpoint does. Firmware without one or the other
                    // just leaves those out.
                    if let Ok(orbit) = client.get_capabilities().await {
                        capabilities.transitions = orbit.transitions;
                        capabilities.clock_faces = orbit.clock_faces;
                        capabilities.pictures = orbit.pictures;
                        if orbit.screensaver_effects.is_some() {
                            capabilities.screensaver_effects = orbit.screensaver_effects;
                        }
                    }
                    return Ok(Some(capabilities));
                }
            }
            Err(OrbitError::DeviceRejected { status: 404, .. }) => {}
            Err(err) => return Err(err),
        }
        match client.get_capabilities().await {
            Ok(capabilities) => Ok(Some(capabilities)),
            Err(OrbitError::DeviceRejected { status: 404, .. }) => Ok(None),
            Err(err) => Err(err),
        }
    })
    .await
}

/// `None` on firmware without GET /api/v1/system — same as the heartbeat's
/// own fallback, just available on demand instead of waiting for the next
/// probe. Read right after connecting (see connect() in deviceStore.ts) so
/// things that depend on it, like whether to show the rail's Orb buttons,
/// aren't stuck showing a stale default until the heartbeat's first tick.
#[tauri::command]
pub async fn get_system(state: State<'_, AppState>) -> Result<Option<SystemInfo>, OrbitError> {
    with_device(&state, |client| async move {
        match client.get_system().await {
            Ok(info) => Ok(Some(info)),
            Err(OrbitError::DeviceRejected { status: 404, .. }) => Ok(None),
            Err(err) => Err(err),
        }
    })
    .await
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

/// Presses one of the orb's own buttons. Not a write to the layout (it
/// changes which widget shows, or something inside that widget), so it
/// doesn't take `device_writes`.
#[tauri::command]
pub async fn press_button(
    button: OrbButton,
    press: PressLength,
    state: State<'_, AppState>,
) -> Result<ButtonPressed, OrbitError> {
    with_device(&state, |client| async move { client.press_button(button, press).await }).await
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

/// Stores a clock face file on screen `n` (`file` is sent byte for byte;
/// the board's hash is of exactly these bytes). The board sets the screen's
/// `clockFaceId`/`clockFaceHash` itself if it shows `analogClock`; the
/// Apply that follows sets them either way. A write to the orb's flash, so
/// it shares `device_writes` with the layout writes.
#[tauri::command]
pub async fn upload_clock_face(
    n: u8,
    file: String,
    state: State<'_, AppState>,
) -> Result<ClockFaceUploaded, OrbitError> {
    let _writing = state.device_writes.lock().await;
    with_device(&state, |client| async move { client.put_clock_face(n, file).await }).await
}

/// The pictures in the app's library, in the order they were added.
#[tauri::command]
pub fn list_pictures(app: AppHandle) -> Result<Vec<Picture>, PictureError> {
    Ok(Library::for_app(&app)?.list())
}

/// Adds a picture to the library from any JPEG, PNG, GIF, WebP or BMP file,
/// made into the 240x240 file the orb takes (pictures/prepare.rs). The body
/// is the file's bytes, raw; its name comes in the `x-picture-name` header,
/// percent-encoded (headers only carry ASCII). Making a GIF's frames can
/// take a few seconds, so it's done off the async runtime.
#[tauri::command]
pub async fn import_picture(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Picture, PictureError> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(PictureError::Prepare(prepare::PrepareError::NotAPicture));
    };
    if bytes.len() > prepare::MAX_INPUT_BYTES {
        return Err(PictureError::Prepare(prepare::PrepareError::InputTooBig));
    }
    let name = request
        .headers()
        .get("x-picture-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let bytes = bytes.clone();
    let library = Library::for_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let prepared = prepare::prepare(&bytes)?;
        library.add(&name, prepared)
    })
    .await
    .map_err(|e| PictureError::Io(e.to_string()))?
}

#[tauri::command]
pub fn rename_picture(app: AppHandle, hash: String, name: String) -> Result<Picture, PictureError> {
    Library::for_app(&app)?.rename(&hash, &name)
}

/// Takes a picture out of the app's library. The orb keeps its copy until
/// it needs the room (or it's deleted there with `delete_orb_picture`).
#[tauri::command]
pub fn delete_picture(app: AppHandle, hash: String) -> Result<(), PictureError> {
    Library::for_app(&app)?.delete(&hash)
}

/// A library picture's file, raw (an ArrayBuffer in the frontend), for
/// showing it.
#[tauri::command]
pub fn read_picture(app: AppHandle, hash: String) -> Result<tauri::ipc::Response, PictureError> {
    Ok(tauri::ipc::Response::new(Library::for_app(&app)?.read(&hash)?))
}

/// Sends a library picture to the orb's picture store. Slow (up to ~20 s for
/// a 1 MB GIF) and the orb answers nothing else meanwhile, so send only what
/// it lacks. A write to its flash, so it shares `device_writes` with the
/// layout writes.
#[tauri::command]
pub async fn upload_picture(
    app: AppHandle,
    hash: String,
    state: State<'_, AppState>,
) -> Result<PictureStored, OrbitError> {
    let file = Library::for_app(&app)
        .and_then(|library| library.read(&hash))
        .map_err(|e| OrbitError::Other(e.to_string()))?;
    let _writing = state.device_writes.lock().await;
    with_device(&state, |client| async move { client.put_picture(&hash, file).await }).await
}

/// `%XX` escapes back to bytes, as `encodeURIComponent` made them. A
/// malformed escape is kept as it is.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        // `to_str` only lets visible ASCII through, so slicing by byte is safe.
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// What the orb's picture store holds and the room left in it.
#[tauri::command]
pub async fn list_orb_pictures(state: State<'_, AppState>) -> Result<OrbPictures, OrbitError> {
    with_device(&state, |client| async move { client.list_pictures().await }).await
}

/// Removes a picture from the orb (409 while a screen lists it). A write to
/// its flash, so it shares `device_writes` with the layout writes.
#[tauri::command]
pub async fn delete_orb_picture(hash: String, state: State<'_, AppState>) -> Result<(), OrbitError> {
    let _writing = state.device_writes.lock().await;
    with_device(&state, |client| async move { client.delete_picture(&hash).await }).await
}

#[tauri::command]
pub fn list_clock_faces(app: AppHandle) -> Result<Vec<ClockFace>, ProfileError> {
    clock_face_store::list(&app)
}

#[tauri::command]
pub fn save_clock_face(
    app: AppHandle,
    name: String,
    recipe: serde_json::Value,
) -> Result<ClockFace, ProfileError> {
    clock_face_store::save(&app, name, recipe)
}

#[tauri::command]
pub fn update_clock_face(
    app: AppHandle,
    id: String,
    name: String,
    recipe: serde_json::Value,
) -> Result<ClockFace, ProfileError> {
    clock_face_store::update(&app, &id, name, recipe)
}

#[tauri::command]
pub fn delete_clock_face(app: AppHandle, id: String) -> Result<(), ProfileError> {
    clock_face_store::delete(&app, &id)
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

/// Bulk write behind Apply Layout (and applying a profile, which the
/// frontend sends the same way once its clock faces are on the orb): each slot's
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
    // A built-in binding isn't saved, but the write still carries its
    // feeds' readings, so the screen doesn't show "no data" until the
    // pusher's next tick.
    if let Some(fill) = binding.clone().or_else(|| bindings::built_in(control)) {
        bindings::fill_values(&mut params, &fill, &state.feeds);
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

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn picture_names_come_back_as_encodeuricomponent_sent_them() {
        assert_eq!(percent_decode("Caf%C3%A9%20at%20night"), "Café at night");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
