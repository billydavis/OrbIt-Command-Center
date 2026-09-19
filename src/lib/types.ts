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
