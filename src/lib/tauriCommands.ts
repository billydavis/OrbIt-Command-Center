import { invoke } from "@tauri-apps/api/core";
import type {
  BulkScreenSlotInput,
  ButtonPressed,
  CountdownAction,
  DiscoveredDevice,
  Feed,
  FeedServerStatus,
  OrbButton,
  PressLength,
  Profile,
  ScreenSlot,
  ScreenSlotInput,
} from "./types";

// Typed wrappers around invoke() — one per src-tauri/src/commands.rs command.
// Errors reject with the serialized OrbitError shape (see types.ts);
// callers should run them through describeOrbitError() for display.

export function connectDevice(host: string): Promise<ScreenSlot[]> {
  return invoke("connect_device", { host });
}

export function disconnectDevice(): Promise<void> {
  return invoke("disconnect_device");
}

/** Scans the LAN over mDNS for ~3s and resolves with every OrbIt device found. */
export function discoverDevices(): Promise<DiscoveredDevice[]> {
  return invoke("discover_devices");
}

export function getScreens(): Promise<ScreenSlot[]> {
  return invoke("get_screens");
}

export function getScreen(n: number): Promise<ScreenSlot> {
  return invoke("get_screen", { n });
}

export function applyLayout(slots: BulkScreenSlotInput[]): Promise<ScreenSlot[]> {
  return invoke("apply_layout", { slots });
}

export function applyScreen(n: number, slot: ScreenSlotInput): Promise<ScreenSlot> {
  return invoke("apply_screen", { n, slot });
}

export function refreshTicker(n: number): Promise<ScreenSlot> {
  return invoke("refresh_ticker", { n });
}

export function countdownAction(n: number, action: CountdownAction): Promise<ScreenSlot> {
  return invoke("countdown_action", { n, action });
}

/** Presses one of the orb's own buttons; resolves with the widget now showing. */
export function pressButton(button: OrbButton, press: PressLength): Promise<ButtonPressed> {
  return invoke("press_button", { button, press });
}

export function listProfiles(): Promise<Profile[]> {
  return invoke("list_profiles");
}

export function saveProfile(name: string, slots: BulkScreenSlotInput[]): Promise<Profile> {
  return invoke("save_profile", { name, slots });
}

/** Replaces what a saved profile holds; its name and place in the list stay. */
export function updateProfile(id: string, slots: BulkScreenSlotInput[]): Promise<Profile> {
  return invoke("update_profile", { id, slots });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke("delete_profile", { id });
}

export function applyProfile(id: string): Promise<ScreenSlot[]> {
  return invoke("apply_profile", { id });
}

export function listFeeds(): Promise<Feed[]> {
  return invoke("list_feeds");
}

/** External feeds only; rejects with a plain message string. */
export function deleteFeed(id: string): Promise<void> {
  return invoke("delete_feed", { id });
}

export function feedServerStatus(): Promise<FeedServerStatus> {
  return invoke("feed_server_status");
}

export function gpuMonitoringAvailable(): Promise<boolean> {
  return invoke("gpu_monitoring_available");
}

/** Shows and focuses the full window, putting the tray flyout away. */
export function showMainWindow(): Promise<void> {
  return invoke("show_main_window");
}

export function hideFlyout(): Promise<void> {
  return invoke("hide_flyout");
}

/** Windows only (a no-op elsewhere): taskbar button, or tray icon alone. */
export function setShowInTaskbar(show: boolean): Promise<void> {
  return invoke("set_show_in_taskbar", { show });
}
