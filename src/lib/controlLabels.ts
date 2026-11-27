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
  screensaver: "Screensaver",
  countdown: "Countdown",
  makapix: "Makapix",
  picture: "Pictures",
  claudeUsage: "Claude Usage",
};

// The `transition` choices of controls that change from one picture to the
// next (makapix, picture). Known ones read better with a space than raw;
// anything the device lists that isn't one of these shows as itself.
export const TRANSITION_LABELS: Record<string, string> = {
  random: "Random",
  none: "None (cut)",
  crossfade: "Crossfade",
  fade: "Fade",
  slide: "Slide",
  wipe: "Wipe",
  iris: "Iris",
  blinds: "Blinds",
  mosaic: "Mosaic",
  dissolve: "Dissolve",
  melt: "Melt",
  checkerboard: "Checkerboard",
  scanline: "Scanline",
  rain: "Rain",
  sweep: "Sweep",
};
