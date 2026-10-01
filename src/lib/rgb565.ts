import type { ScreenSlot, ScreenSlotInput } from "./types";

// Device colors are RGB565 integers (5 bits red, 6 green, 5 blue) in both
// directions — what a GET reports is exactly what a POST takes (see "Colors"
// in docs/orbit-api.md). The browser's color picker works in 24-bit hex, so
// these convert between the two. Going down to RGB565 drops the low bits of
// each channel; going back up repeats the high bits into them, so 0 stays 0,
// full stays 255, and hexToRgb565(rgb565ToHex(n)) === n for every n — a
// color read from the device never drifts by being shown and sent back.

export function hexToRgb565(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

export function rgb565ToHex(color: number): string {
  const r5 = (color >> 11) & 0x1f;
  const g6 = (color >> 5) & 0x3f;
  const b5 = color & 0x1f;
  const r = (r5 << 3) | (r5 >> 2);
  const g = (g6 << 2) | (g6 >> 4);
  const b = (b5 << 3) | (b5 >> 2);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// The firmware's own named colors (TFT_eSPI's TFT_* constants) — the
// defaults its controls use, and the one-click presets ColorInput offers.
export const COLORS = {
  black: 0x0000,
  white: 0xffff,
  red: 0xf800,
  green: 0x07e0,
  blue: 0x001f,
  cyan: 0x07ff,
  magenta: 0xf81f,
  yellow: 0xffe0,
  orange: 0xfda0,
  purple: 0x780f,
  grey: 0xd69a,
  darkgrey: 0x7bef,
} as const;

export const PRESET_COLORS: { name: string; value: number }[] = [
  { name: "Black", value: COLORS.black },
  { name: "White", value: COLORS.white },
  { name: "Red", value: COLORS.red },
  { name: "Green", value: COLORS.green },
  { name: "Blue", value: COLORS.blue },
  { name: "Cyan", value: COLORS.cyan },
  { name: "Magenta", value: COLORS.magenta },
  { name: "Yellow", value: COLORS.yellow },
  { name: "Orange", value: COLORS.orange },
  { name: "Purple", value: COLORS.purple },
  { name: "Grey", value: COLORS.grey },
  { name: "Dark grey", value: COLORS.darkgrey },
];

/** A color param as the device reports it, or `fallback` if it's missing. */
export function colorParam(raw: unknown, fallback: number): number {
  return typeof raw === "number" ? raw : fallback;
}

const COLOR_PARAMS: Record<string, string[]> = {
  analogClock: ["background", "tickColor", "hourColor", "minuteColor", "secondColor"],
  gauge: ["color", "trackColor"],
  countdown: ["color"],
};

export const COLORS_UNSUPPORTED_MESSAGE =
  "This orb's firmware doesn't support custom colors yet, so it used its defaults. Update the firmware to use them.";

// Firmware from before colors became RGB565 integers only understands color
// names: it ignores an integer and answers 200 with its default color in
// the echo. Comparing what was sent against that echo is the only way to
// tell, and without it the picked color would just silently not take.
export function colorsNotApplied(sent: ScreenSlotInput, applied: ScreenSlot): boolean {
  if (sent.control !== applied.control) return false;
  return (COLOR_PARAMS[sent.control] ?? []).some(
    (key) => typeof sent.params[key] === "number" && applied.params[key] !== sent.params[key],
  );
}
