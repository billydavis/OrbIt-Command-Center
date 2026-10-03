mod commands;
mod device;
mod discovery;
mod feeds;
mod heartbeat;
mod persistence;
mod state;
mod sysmonitor;
mod tray;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin registered. Closing the window only hides
        // it to the tray, so a second launch would otherwise leave two
        // copies running, and the hidden one keeps pushing sysMonitor values
        // from its own stale idea of the layout, undoing whatever the
        // visible one just applied. A second launch brings the existing
        // window back instead.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup(&handle)?;
            feeds::spawn(handle.clone());
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
            commands::list_feeds,
            commands::delete_feed,
            commands::feed_server_status,
            commands::gpu_monitoring_available,
            commands::set_show_in_taskbar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
