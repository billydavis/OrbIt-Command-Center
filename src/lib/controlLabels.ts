import type { ControlType } from "./types";

// Shared human-readable names for each control type — used anywhere a
// control needs to read as more than its raw camelCase key: the control
// picker dropdown, a screen tile's label, and a saved profile's per-screen
// preview.
export const CONTROL_LABELS: Record<ControlType, string> = {
  blank: "Blank",
  time: "Time",
  analogClock: "Analog Clock",
  gauge: "Gauge",
  sysMonitor: "System Monitor",
  weather: "Weather",
  ticker: "Ticker",
  custom: "Custom",
  asteroids: "Asteroids (screensaver)",
  countdown: "Countdown",
};
