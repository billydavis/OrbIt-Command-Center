// Display formatting for SystemInfo (GET /api/v1/system) in the status bar.

export type SignalQuality = "excellent" | "good" | "fair" | "weak";

/**
 * Common WiFi RSSI bands: -55 dBm or better is effectively full signal;
 * below -75 dBm an ESP32 starts dropping requests, which is exactly when the
 * heartbeat would start reporting the device lost.
 */
export function signalQuality(rssi: number): SignalQuality {
  if (rssi >= -55) return "excellent";
  if (rssi >= -67) return "good";
  if (rssi >= -75) return "fair";
  return "weak";
}

export const SIGNAL_BARS: Record<SignalQuality, number> = { excellent: 4, good: 3, fair: 2, weak: 1 };

/** RSSI with a real minus sign, e.g. "−47 dBm". */
export function formatRssi(rssi: number): string {
  return `${rssi < 0 ? "−" : ""}${Math.abs(rssi)} dBm`;
}

/** Two most significant units: "42s", "12m 5s", "3h 12m", "2d 4h". */
export function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Bytes as whole KB (1024), e.g. "152 KB" — heap on an ESP32 is a few hundred KB at most. */
export function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * The firmware reports C's `__DATE__ __TIME__`, e.g. "Sep 26 2026 21:28:13"
 * (single-digit days are space-padded: "Sep  6 2026"). The date alone is
 * what's useful at a glance; the full string goes in the tooltip.
 */
export function formatBuildDate(firmwareBuilt: string): string {
  const parts = firmwareBuilt.trim().split(/\s+/);
  return parts.length >= 3 ? parts.slice(0, 3).join(" ") : firmwareBuilt;
}
