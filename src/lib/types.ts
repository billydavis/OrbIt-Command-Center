// Mirrors src-tauri/src/device/model.rs::ScreenSlot. `params` is kept as
// `unknown` here for the same reason it's `serde_json::Value` on the Rust
// side: the control enum is documented as "expected to grow," so a strict
// shape would reject valid data from newer firmware.
export interface ScreenSlot {
  screen: number;
  control: string;
  params: Record<string, unknown>;
  updatedAt: number;
  /**
   * On a blank screen only: the control its saved entry on the orb names,
   * which this firmware was built without. The orb keeps that entry, and
   * the screen comes back under a build with the control, until something
   * is written to the screen.
   */
  savedControl?: string;
}

export interface ScreenSlotInput {
  control: string;
  params: Record<string, unknown>;
}

export interface BulkScreenSlotInput {
  screen: number;
  control: string;
  params: Record<string, unknown>;
}

export const CONTROL_TYPES = [
  "blank",
  "time",
  "analogClock",
  "gauge",
  "sysMonitor",
  "weather",
  "ticker",
  "custom",
  "screensaver",
  "countdown",
] as const;

export type ControlType = (typeof CONTROL_TYPES)[number];

export const SCREEN_COUNT = 5;

/**
 * What the connected firmware was built with: its widgets, OrbIt's controls
 * and the screensaver's effects are build-time choices there. Mirrors
 * src-tauri/src/device/model.rs::Capabilities.
 */
export interface Capabilities {
  controls: string[];
  /** Only there when "screensaver" is one of `controls`. */
  screensaverEffects: string[] | null;
  /**
   * Every widget in the firmware, in the order Left and Right step through
   * them. Null on firmware that only reports OrbIt's controls.
   */
  widgets: WidgetCapabilities[] | null;
}

export interface WidgetCapabilities {
  /** As the orb names it, e.g. "OrbIt" or "Clock". */
  name: string;
  /** Whether it was the one on screen when the orb was asked. */
  showing: boolean;
  /** The clock's faces ("normal", "nixie", "custom"); null for other widgets. */
  faces: string[] | null;
}

export type CountdownAction =
  | { action: "set"; durationSeconds: number; label?: string; color?: number }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "restart" }
  | { action: "stop" };

// Mirrors src-tauri/src/device/error.rs::OrbitError's serde(tag = "kind",
// content = "message") shape.
/**
 * Device status from the core info-orbs web service (GET /api/v1/system),
 * pushed by the heartbeat every few seconds — see src-tauri/src/heartbeat.rs.
 * Only on firmware that has that endpoint.
 */
export interface SystemInfo {
  hostname: string;
  ip: string;
  mac: string;
  ssid: string;
  /** WiFi signal in dBm (negative; closer to 0 is stronger). */
  rssi: number;
  uptimeSeconds: number;
  freeHeap: number;
  minFreeHeap: number;
  firmwareBuilt: string;
  /** The widget on screen now, e.g. "OrbIt"; null on firmware that doesn't say here. */
  widget: string | null;
}

/** The orb's three physical buttons (POST /api/v1/buttons/{left|ok|right}). */
export type OrbButton = "left" | "ok" | "right";

/** How long a button is held; the firmware treats each as a different press. */
export type PressLength = "short" | "medium" | "long";

/** The orb's reply to a button press. */
export interface ButtonPressed {
  button: string;
  press: string;
  /** The widget showing after the press, e.g. "OrbIt" or "Clock". */
  widget: string | null;
}

/** An OrbIt device found by an mDNS scan (src-tauri/src/discovery). */
export interface DiscoveredDevice {
  name: string;
  /** e.g. "info-orbs-ab.local" — stable across IP changes. */
  hostname: string;
  ip: string;
  port: number;
  /** What to pass to connectDevice(). */
  address: string;
}

export type OrbitError =
  | { kind: "Unreachable"; message: string }
  | { kind: "Timeout" }
  | { kind: "DeviceRejected"; message: { status: number; message: string } }
  | { kind: "Decode"; message: string }
  | { kind: "NotConfigured" }
  | { kind: "Other"; message: string };

export function describeOrbitError(err: unknown): string {
  const e = err as OrbitError;
  if (!e || typeof e !== "object" || !("kind" in e)) {
    return String(err);
  }
  switch (e.kind) {
    case "Unreachable":
      return `Could not reach device: ${e.message}`;
    case "Timeout":
      return "The orb took too long to answer. It may just be busy: wait a moment and try again.";
    case "DeviceRejected":
      // 501: a control or screensaver effect left out of this firmware build.
      if (e.message.status === 501) return `This orb's firmware can't do that: ${e.message.message}`;
      return `Device rejected request (${e.message.status}): ${e.message.message}`;
    case "Decode":
      return `Unexpected response from device: ${e.message}`;
    case "NotConfigured":
      return "Not connected to a device yet.";
    case "Other":
      return e.message;
    default:
      return String(err);
  }
}

/**
 * A named live number (src-tauri/src/feeds/registry.rs::Feed) — one of the
 * app's own sysMonitor readings, or pushed by another app on this PC.
 * `label`/`min`/`max` are the publisher's suggestions for showing it.
 */
export interface Feed {
  id: string;
  value: number;
  label?: string;
  min?: number;
  max?: number;
  source: "builtin" | "external";
  /** Wall-clock milliseconds since the epoch of the last publish. */
  updatedAt: number;
}

/** Mirrors src-tauri/src/feeds/server.rs::FeedServerStatus. */
export interface FeedServerStatus {
  port: number;
  listening: boolean;
  error: string | null;
}

// Mirrors src-tauri/src/persistence/profiles.rs::Profile.
export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  slots: BulkScreenSlotInput[];
}

// Mirrors src-tauri/src/persistence/profiles.rs::ProfileError.
export type ProfileError =
  | { kind: "Io"; message: string }
  | { kind: "NotFound"; message: string };

export function describeProfileError(err: unknown): string {
  const e = err as ProfileError;
  if (!e || typeof e !== "object" || !("kind" in e)) {
    return String(err);
  }
  switch (e.kind) {
    case "Io":
      return `Profile storage error: ${e.message}`;
    case "NotFound":
      return `Profile '${e.message}' not found.`;
    default:
      return String(err);
  }
}
