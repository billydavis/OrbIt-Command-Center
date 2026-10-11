import { CONTROL_LABELS } from "./controlLabels";
import { SCREENSAVER_EFFECTS, type ScreensaverEffect } from "./controlSchemas";
import {
  CONTROL_TYPES,
  type Capabilities,
  type ControlType,
  type OrbitError,
  type ScreenSlot,
} from "./types";

// What the connected orb's firmware can show. Its controls and screensaver
// effects are build-time choices (docs/orbit-api.md, GET /capabilities), so
// the app only offers the ones that were built. `null` capabilities are
// firmware from before that was a choice, or not asked yet: everything.

export function controlBuilt(capabilities: Capabilities | null, control: string): boolean {
  return capabilities === null || capabilities.controls.includes(control);
}

/** The controls to offer, in the app's own order. */
export function builtControls(capabilities: Capabilities | null): ControlType[] {
  return CONTROL_TYPES.filter((c) => controlBuilt(capabilities, c));
}

/** The screensaver's effects to offer, in the order the orb cycles through them. */
export function builtEffects(capabilities: Capabilities | null): ScreensaverEffect[] {
  const built = capabilities?.screensaverEffects;
  if (!built) return [...SCREENSAVER_EFFECTS];
  return SCREENSAVER_EFFECTS.filter((e) => built.includes(e));
}

/**
 * What `slots` ask for that the orb can't show, by name ("Ticker", "the
 * Matrix rain screensaver"), each once. Empty when all of it can be applied.
 */
export function notBuiltIn(
  slots: { control: string; params: Record<string, unknown> }[],
  capabilities: Capabilities | null,
): string[] {
  if (capabilities === null) return [];
  const missing = new Set<string>();
  for (const slot of slots) {
    // "asteroids" was a control of its own once; a profile may still hold one.
    const control = slot.control === "asteroids" ? "screensaver" : slot.control;
    if (!controlBuilt(capabilities, control)) {
      missing.add(CONTROL_LABELS[control as ControlType] ?? control);
      continue;
    }
    if (control !== "screensaver" || !capabilities.screensaverEffects) continue;
    const effect = slot.control === "asteroids" ? "asteroids" : slot.params.effect;
    if (typeof effect === "string" && effect !== "cycle" && !capabilities.screensaverEffects.includes(effect)) {
      missing.add(`the ${EFFECT_LABELS[effect as ScreensaverEffect] ?? effect} screensaver`);
    }
  }
  return [...missing];
}

/**
 * The controls the orb is keeping saved settings for on `screens` (blank
 * there now, because this firmware was built without them), by name, each
 * once. A write to one of those screens throws its kept settings away.
 */
export function keptOn(live: Record<number, ScreenSlot>, screens: number[]): string[] {
  const kept = new Set<string>();
  for (const screen of screens) {
    const saved = live[screen]?.savedControl;
    if (saved) kept.add(CONTROL_LABELS[saved as ControlType] ?? saved);
  }
  return [...kept];
}

/** "Ticker", "Ticker and Custom", "Ticker, Custom and Weather". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whether a request failed because it asked for something this firmware was built without. */
export function isNotBuiltError(err: unknown): boolean {
  const e = err as OrbitError;
  return e?.kind === "DeviceRejected" && e.message.status === 501;
}

export const EFFECT_LABELS: Record<ScreensaverEffect, string> = {
  asteroids: "Asteroids",
  matrix: "Matrix rain",
  warp: "Warp tunnel",
  orrery: "Orrery",
  radar: "Radar",
};
