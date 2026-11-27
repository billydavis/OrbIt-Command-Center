import { invoke } from "@tauri-apps/api/core";
import type {
  BulkScreenSlotInput,
  ButtonPressed,
  Capabilities,
  ClockFaceUploaded,
  CountdownAction,
  DiscoveredDevice,
  Feed,
  FeedServerStatus,
  OrbButton,
  OrbPictures,
  PressLength,
  Profile,
  SavedClockFace,
  ScreenSlot,
  ScreenSlotInput,
  SystemInfo,
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

/** Resolves with null on firmware from before controls were build-time options. */
export function getCapabilities(): Promise<Capabilities | null> {
  return invoke("get_capabilities");
}

export function getScreens(): Promise<ScreenSlot[]> {
  return invoke("get_screens");
}

/** Resolves with null on firmware without GET /api/v1/system. */
export function getSystem(): Promise<SystemInfo | null> {
  return invoke("get_system");
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

/** Sends a clock face file to screen `n`, exactly as given (see lib/clockFaceRenderer.ts). */
export function uploadClockFace(n: number, file: string): Promise<ClockFaceUploaded> {
  return invoke("upload_clock_face", { n, file });
}

/** What the orb's picture store holds, and the room left in it. */
export function listOrbPictures(): Promise<OrbPictures> {
  return invoke("list_orb_pictures");
}

/** Removes a picture from the orb; rejects with a 409 while a screen lists it. */
export function deleteOrbPicture(hash: string): Promise<void> {
  return invoke("delete_orb_picture", { hash });
}

export function listClockFaces(): Promise<SavedClockFace[]> {
  return invoke("list_clock_faces");
}

export function saveClockFace(name: string, recipe: unknown): Promise<SavedClockFace> {
  return invoke("save_clock_face", { name, recipe });
}

export function updateClockFace(id: string, name: string, recipe: unknown): Promise<SavedClockFace> {
  return invoke("update_clock_face", { id, name, recipe });
}

export function deleteClockFace(id: string): Promise<void> {
  return invoke("delete_clock_face", { id });
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
