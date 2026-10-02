use std::sync::atomic::Ordering;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Builds the tray icon + menu (Show/Hide, Quit) and wires the main
/// window's close button to hide instead of exit, so the sysMonitor
/// background loop (sysmonitor/task.rs) keeps running while the window is
/// closed — this is what makes the app "tray-resident" rather than a
/// launch-configure-close tool.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide OrbIt Command Center", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("app icon configured in tauri.conf.json"))
        .menu(&menu)
        // Each platform's own convention: on Windows a left click opens the
        // app and the menu is on right click; on macOS a click on a menu-bar
        // icon opens its menu. (Linux reports no tray clicks at all — the
        // menu is the only way in there.) The click shows rather than
        // toggles, so a double-click doesn't open the window and hide it
        // again.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_hide" => toggle_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    if let Some(window) = app.get_webview_window("main") {
        let window_for_handler = window.clone();
        let app_for_handler = app.clone();
        window.on_window_event(move |event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window_for_handler.hide();
            }
            // With no taskbar button to minimize to, Windows parks a
            // minimized window as a stub of title bar in the corner of the
            // desktop. Send it to the tray instead, same as closing it.
            // (Minimizing arrives as a resize; there's no event of its own.)
            tauri::WindowEvent::Resized(_) => {
                let tray_only = app_for_handler.state::<AppState>().tray_only.load(Ordering::Relaxed);
                if tray_only && window_for_handler.is_minimized().unwrap_or(false) {
                    let _ = window_for_handler.hide();
                }
            }
            _ => {}
        });
    }

    // Tray-only is the default; the frontend applies the saved preference
    // once it loads (see set_show_in_taskbar in commands.rs). Starting from
    // the default here means the usual case never flashes a taskbar button.
    set_show_in_taskbar(app, false);

    Ok(())
}

/// Windows only: whether the app has a taskbar button while its window is
/// open, or lives in the tray alone. Elsewhere this does nothing — a macOS
/// app without a Dock icon loses its menu bar and Cmd-Tab entry, and many
/// Linux desktops have no tray to fall back on.
pub fn set_show_in_taskbar(app: &AppHandle, show: bool) {
    if !cfg!(windows) {
        return;
    }
    app.state::<AppState>().tray_only.store(!show, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(!show);
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        show_main_window(app);
    }
}

/// Brings the main window back from the tray (or from minimized) and
/// focuses it.
pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}
