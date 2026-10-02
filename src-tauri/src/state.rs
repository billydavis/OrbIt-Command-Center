use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use crate::device::{OrbitClient, ScreenSlot};

/// Shared app state. `device` is `None` until `connect_device` succeeds.
/// A `Mutex` is enough here — writes are infrequent (connect, apply,
/// settings changes) and always short-lived.
#[derive(Default)]
pub struct AppState {
    pub device: Mutex<Option<OrbitClient>>,

    /// The last full or partial view of the device's 5-screen layout this
    /// app has seen. Read by the sysMonitor background loop (sysmonitor/
    /// loop.rs) to find which screens are currently `sysMonitor` without
    /// polling the device with an extra GET every tick — commands.rs keeps
    /// this in sync as a side effect of every successful device call.
    pub last_layout: Mutex<Option<Vec<ScreenSlot>>>,

    /// Held across every write to the device together with the
    /// `last_layout` update that follows it. Without it the sysMonitor loop
    /// can decide to push to a screen, have the user's Apply change that
    /// screen to something else, and then land its push anyway, putting
    /// sysMonitor back on the device and in `last_layout`, where it then
    /// stays. An async mutex because it's held across the request.
    pub device_writes: tokio::sync::Mutex<()>,

    /// Windows only: the app has no taskbar button, just its tray icon (see
    /// tray::set_show_in_taskbar). Read by the window's event handler so
    /// minimizing sends the window to the tray too.
    pub tray_only: AtomicBool,
}

impl AppState {
    /// Replaces the whole known layout — used after connect_device/
    /// get_screens, which return the complete 5-slot array.
    pub fn set_layout(&self, screens: Vec<ScreenSlot>) {
        *self.last_layout.lock().expect("layout mutex poisoned") = Some(screens);
    }

    /// Updates just one screen — used after apply_screen/refresh_ticker/
    /// countdown_action/apply_layout, which only report the screen(s) they
    /// touched. If the layout isn't known yet at all, this is a no-op: the
    /// loop simply stays idle until a full GET populates it.
    pub fn patch_layout_slot(&self, slot: ScreenSlot) {
        let mut guard = self.last_layout.lock().expect("layout mutex poisoned");
        if let Some(screens) = guard.as_mut() {
            match screens.iter_mut().find(|s| s.screen == slot.screen) {
                Some(existing) => *existing = slot,
                None => screens.push(slot),
            }
        }
    }
}
