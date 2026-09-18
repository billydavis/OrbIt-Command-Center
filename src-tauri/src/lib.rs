mod commands;
mod device;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect_device,
            commands::disconnect_device,
            commands::get_screens,
            commands::get_screen,
            commands::apply_layout,
            commands::apply_screen,
            commands::refresh_ticker,
            commands::countdown_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
