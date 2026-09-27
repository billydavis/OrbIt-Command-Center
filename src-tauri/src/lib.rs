mod commands;
mod device;
mod discovery;
mod heartbeat;
mod persistence;
mod state;
mod sysmonitor;
mod tray;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup(&handle)?;
            sysmonitor::spawn(handle.clone());
            heartbeat::spawn(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::connect_device,
            commands::disconnect_device,
            commands::discover_devices,
            commands::get_screens,
            commands::get_screen,
            commands::apply_layout,
            commands::apply_screen,
            commands::refresh_ticker,
            commands::countdown_action,
            commands::list_profiles,
            commands::save_profile,
            commands::delete_profile,
            commands::apply_profile,
            commands::gpu_monitoring_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
