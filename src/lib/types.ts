// Mirrors src-tauri/src/device/model.rs::ScreenSlot. `params` is kept as
// `unknown` here for the same reason it's `serde_json::Value` on the Rust
// side: the control enum is documented as "expected to grow," and read-back
// for analogClock/custom is lossy — a strict shape would reject valid data.
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
  "asteroids",
  "countdown",
] as const;

export type ControlType = (typeof CONTROL_TYPES)[number];

export const SCREEN_COUNT = 5;

export type CountdownAction =
  | { action: "set"; durationSeconds: number; label?: string; color?: string }
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
