use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::state::AppState;

/// The flyout: a small second window that opens beside the tray icon for a
/// quick change, and hides again as soon as it loses focus. It loads the
/// same frontend as the main window, which shows its flyout layout when it
/// finds itself in a window with this label (src/main.tsx).
const FLYOUT_LABEL: &str = "flyout";
const FLYOUT_WIDTH: f64 = 400.0;
const FLYOUT_HEIGHT: f64 = 640.0;
/// Gap kept between the flyout and the edge of the screen's work area. On
/// Windows the window's size includes an invisible 8px frame, so what shows
/// is a gap of about 12px, the same as the system's own flyouts.
const FLYOUT_MARGIN: f64 = 4.0;
/// See AppState::flyout_hidden_at.
const FLYOUT_REOPEN_GUARD: Duration = Duration::from_millis(400);

/// Builds the tray icon + menu (Quick Panel, Show/Hide, Quit), the hidden
/// flyout window, and wires the main window's close button to hide instead
/// of exit, so the sysMonitor background loop (sysmonitor/task.rs) keeps
/// running while the window is closed — this is what makes the app
/// "tray-resident" rather than a launch-configure-close tool.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let quick_panel = MenuItem::with_id(app, "flyout", "Quick Panel", true, None::<&str>)?;
    let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide OrbIt Command Center", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quick_panel, &show_hide, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("app icon configured in tauri.conf.json"))
        .tooltip("OrbIt Command Center")
        .menu(&menu)
        // Each platform's own convention: on Windows a left click opens the
        // flyout, a double click the full window, and the menu is on right
        // click; on macOS a click on a menu-bar icon opens its menu. (Linux
        // reports no tray clicks at all — the menu is the only way in
        // there.)
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => toggle_flyout(tray.app_handle(), position),
                TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => {
                    show_main_window(tray.app_handle())
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            // A menu click reports no position of its own; the pointer is
            // still beside the tray icon, which is where the flyout belongs.
            "flyout" => {
                if let Ok(position) = app.cursor_position() {
                    toggle_flyout(app, position);
                }
            }
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

    // Built once, hidden, so opening it is only a move and a show.
    let flyout = WebviewWindowBuilder::new(app, FLYOUT_LABEL, WebviewUrl::default())
        .title("OrbIt Quick Panel")
        .inner_size(FLYOUT_WIDTH, FLYOUT_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        // Hidden or not, a new window takes focus from the main one unless
        // told otherwise.
        .focused(false)
        .build()?;
    let app_for_flyout = app.clone();
    flyout.on_window_event(move |event| match event {
        // Clicking anywhere else puts it away, as a tray flyout does.
        tauri::WindowEvent::Focused(false) => hide_flyout(&app_for_flyout),
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_flyout(&app_for_flyout);
        }
        _ => {}
    });

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
    hide_flyout(app);
    let Some(window) = app.get_webview_window("main") else { return };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// Opens the flyout beside `anchor` (where the tray icon was clicked, in
/// physical screen pixels), or puts it away if it's open.
fn toggle_flyout(app: &AppHandle, anchor: PhysicalPosition<f64>) {
    let state = app.state::<AppState>();
    // The flyout adjusts an orb; finding and connecting to one is the full
    // window's job, so with none connected that's what opens.
    if state.device.lock().expect("device state mutex poisoned").is_none() {
        show_main_window(app);
        return;
    }
    let Some(flyout) = app.get_webview_window(FLYOUT_LABEL) else {
        show_main_window(app);
        return;
    };
    if flyout.is_visible().unwrap_or(false) {
        hide_flyout(app);
        return;
    }
    let just_hidden = state
        .flyout_hidden_at
        .lock()
        .expect("flyout mutex poisoned")
        .is_some_and(|at| at.elapsed() < FLYOUT_REOPEN_GUARD);
    if just_hidden {
        return;
    }

    place_flyout(app, &flyout, anchor);
    let _ = flyout.show();
    let _ = flyout.set_focus();
}

pub fn hide_flyout(app: &AppHandle) {
    let Some(flyout) = app.get_webview_window(FLYOUT_LABEL) else { return };
    if !flyout.is_visible().unwrap_or(false) {
        return;
    }
    *app.state::<AppState>().flyout_hidden_at.lock().expect("flyout mutex poisoned") = Some(Instant::now());
    let _ = flyout.hide();
}

/// Puts the flyout against the edge of the screen's work area that `anchor`
/// is nearer to, top or bottom (a taskbar's tray is at the bottom, a menu
/// bar's at the top), centered on the anchor sideways as far as the work
/// area allows. Not centered on it vertically: an icon in the taskbar's
/// overflow panel is inside the work area, and the flyout would open over
/// the middle of the screen.
fn place_flyout(app: &AppHandle, flyout: &WebviewWindow, anchor: PhysicalPosition<f64>) {
    let monitor = app
        .monitor_from_point(anchor.x, anchor.y)
        .ok()
        .flatten()
        .or_else(|| flyout.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, flyout.outer_size()) else { return };

    let work = monitor.work_area();
    let margin = (FLYOUT_MARGIN * monitor.scale_factor()) as i32;
    let (width, height) = (size.width as i32, size.height as i32);

    let min_x = work.position.x + margin;
    let max_x = work.position.x + work.size.width as i32 - width - margin;
    let min_y = work.position.y + margin;
    let max_y = work.position.y + work.size.height as i32 - height - margin;
    let x = (anchor.x as i32 - width / 2).clamp(min_x, max_x.max(min_x));
    let lower_half = anchor.y as i32 > work.position.y + work.size.height as i32 / 2;
    let y = if lower_half { max_y.max(min_y) } else { min_y };

    let _ = flyout.set_position(PhysicalPosition::new(x, y));
}
