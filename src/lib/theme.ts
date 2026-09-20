export type ThemeMode = "light" | "dark" | "system";
export type AccentKey = "cyan" | "teal" | "violet" | "amber";

// Hue only — lightness/chroma stay the formula already used for the
// existing cyan signal color, just re-run at a different hue, so every
// accent keeps the same contrast behavior in both themes.
export const ACCENT_HUES: Record<AccentKey, number> = {
  cyan: 205,
  teal: 165,
  violet: 300,
  amber: 45,
};

// A fixed, theme-independent swatch for the picker itself — the live
// --color-signal value (below) is what actually shifts with light/dark.
export const ACCENT_SWATCHES: Record<AccentKey, string> = {
  cyan: "oklch(58% 0.12 205)",
  teal: "oklch(58% 0.12 165)",
  violet: "oklch(58% 0.13 300)",
  amber: "oklch(62% 0.14 45)",
};

export function accentColor(accent: AccentKey, dark: boolean): string {
  const hue = ACCENT_HUES[accent];
  return dark ? `oklch(72% 0.11 ${hue})` : `oklch(58% 0.12 ${hue})`;
}

export function accentActiveColor(accent: AccentKey, dark: boolean): string {
  const hue = ACCENT_HUES[accent];
  return dark ? `oklch(80% 0.1 ${hue})` : `oklch(48% 0.12 ${hue})`;
}

export function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function effectiveIsDark(mode: ThemeMode): boolean {
  return mode === "system" ? prefersDark() : mode === "dark";
}
