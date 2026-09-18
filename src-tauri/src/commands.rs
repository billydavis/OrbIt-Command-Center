use tauri::State;

use crate::device::{
    BulkScreenSlotInput, CountdownAction, OrbitClient, OrbitError, ScreenSlot, ScreenSlotInput,
};
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
    Ok(screens)
}

#[tauri::command]
pub fn disconnect_device(state: State<'_, AppState>) {
    *state.device.lock().expect("device state mutex poisoned") = None;
}

#[tauri::command]
pub async fn get_screens(state: State<'_, AppState>) -> Result<Vec<ScreenSlot>, OrbitError> {
    with_device(&state, |client| async move { client.get_screens().await }).await
}

#[tauri::command]
pub async fn get_screen(n: u8, state: State<'_, AppState>) -> Result<ScreenSlot, OrbitError> {
    with_device(&state, |client| async move { client.get_screen(n).await }).await
}

#[tauri::command]
pub async fn apply_layout(
    slots: Vec<BulkScreenSlotInput>,
    state: State<'_, AppState>,
) -> Result<Vec<ScreenSlot>, OrbitError> {
    with_device(&state, |client| async move { client.post_screens_bulk(slots).await }).await
}

#[tauri::command]
pub async fn apply_screen(
    n: u8,
    slot: ScreenSlotInput,
    state: State<'_, AppState>,
) -> Result<ScreenSlot, OrbitError> {
    with_device(&state, |client| async move { client.post_screen(n, slot).await }).await
}

#[tauri::command]
pub async fn refresh_ticker(n: u8, state: State<'_, AppState>) -> Result<ScreenSlot, OrbitError> {
    with_device(&state, |client| async move { client.refresh_ticker(n).await }).await
}

#[tauri::command]
pub async fn countdown_action(
    n: u8,
    action: CountdownAction,
    state: State<'_, AppState>,
) -> Result<ScreenSlot, OrbitError> {
    with_device(&state, |client| async move { client.countdown_action(n, action).await }).await
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
