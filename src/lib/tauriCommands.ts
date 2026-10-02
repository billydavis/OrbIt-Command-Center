import { invoke } from "@tauri-apps/api/core";
import type {
  BulkScreenSlotInput,
  CountdownAction,
  DiscoveredDevice,
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

export function listProfiles(): Promise<Profile[]> {
  return invoke("list_profiles");
}

export function saveProfile(name: string, slots: BulkScreenSlotInput[]): Promise<Profile> {
  return invoke("save_profile", { name, slots });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke("delete_profile", { id });
}

export function applyProfile(id: string): Promise<ScreenSlot[]> {
  return invoke("apply_profile", { id });
}

export function gpuMonitoringAvailable(): Promise<boolean> {
  return invoke("gpu_monitoring_available");
}

/** Windows only (a no-op elsewhere): taskbar button, or tray icon alone. */
export function setShowInTaskbar(show: boolean): Promise<void> {
  return invoke("set_show_in_taskbar", { show });
}
