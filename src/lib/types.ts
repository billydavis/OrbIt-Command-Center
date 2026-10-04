// Mirrors src-tauri/src/device/model.rs::ScreenSlot. `params` is kept as
// `unknown` here for the same reason it's `serde_json::Value` on the Rust
// side: the control enum is documented as "expected to grow," so a strict
// shape would reject valid data from newer firmware.
export interface ScreenSlot {
  screen: number;
  control: string;
  params: Record<string, unknown>;
  updatedAt: number;
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
      return "Request to device timed out.";
    case "DeviceRejected":
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

// Unreachable/Timeout mean the device dropped off the network (WiFi hiccup,
// powered off, etc.) rather than rejecting a specific request — callers use
// this to distinguish "lost connection, go back to the connect screen" from
// an ordinary request-level error that should just show inline.
export function isConnectionLost(err: unknown): boolean {
  const e = err as OrbitError;
  return !!e && typeof e === "object" && "kind" in e && (e.kind === "Unreachable" || e.kind === "Timeout");
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
