import { create } from "zustand";
import { SCREEN_COUNT, type ScreenSlot, type ScreenSlotInput } from "../lib/types";

// A device can echo back `sysMonitor.params.center: ""` via GET (e.g. a
// legacy/default value from before this app ever set one explicitly), but
// "" isn't one of the documented center values and the device rejects it
// with a 400 if POSTed back verbatim. Every device response is sanitized
// through here on the way into `live`, so `live` and freshly-derived
// `draft` entries always agree — the alternative (stripping it only where
// it's about to be re-sent) would desync live vs. draft and reintroduce
// the false-"dirty" bug this same live/draft split was built to avoid.
function sanitizeSlot(slot: ScreenSlot): ScreenSlot {
  if (slot.control !== "sysMonitor" || slot.params.center !== "") {
    return slot;
  }
  const params = { ...slot.params };
  delete params.center;
  return { ...slot, params };
}

function toInput(slot: ScreenSlot): ScreenSlotInput {
  return { control: slot.control, params: slot.params };
}

// Rust's serde_json::Value::Object is a BTreeMap by default, so params
// round-tripped through a Tauri command come back with keys in alphabetical
// order regardless of the order the device (or a form) originally used.
// Plain JSON.stringify is key-order-sensitive, which made a screen with
// several params keys read as "dirty" immediately after connect even with
// no edits — compare by recursively sorting object keys instead.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function blankInput(): ScreenSlotInput {
  return { control: "blank", params: {} };
}

interface LayoutDraftState {
  /** Last known device state, per screen index — the source of truth. */
  live: Record<number, ScreenSlot>;
  /** In-progress, unsaved edits, per screen index. */
  draft: Record<number, ScreenSlotInput>;

  /**
   * Replaces `live` from a fresh GET/connect/apply response and resets
   * `draft` to match it. This is an explicit, user-triggered sync (connect,
   * refresh, a successful apply) — matching the device-is-source-of-truth
   * model rather than trying to merge in background.
   */
  syncFromDevice: (screens: ScreenSlot[]) => void;

  setDraftSlot: (screen: number, input: ScreenSlotInput) => void;

  /** Discards unsaved edits for one screen, reverting to live state. */
  resetDraftSlot: (screen: number) => void;

  /** Discards unsaved edits for every screen at once, reverting all drafts to live state. */
  discardAllDrafts: () => void;

  /**
   * Updates one screen's live (and draft) state from a single-screen
   * response — refresh_ticker and countdown_action both return just that
   * screen's slot, not the full 5-slot array syncFromDevice expects.
   */
  patchLive: (slot: ScreenSlot) => void;

  isDirty: (screen: number) => boolean;
}

export const useLayoutDraftStore = create<LayoutDraftState>((set, get) => ({
  live: {},
  draft: {},

  syncFromDevice: (screens) => {
    const live: Record<number, ScreenSlot> = {};
    const draft: Record<number, ScreenSlotInput> = {};
    for (let i = 0; i < SCREEN_COUNT; i++) {
      const found = screens.find((s) => s.screen === i);
      if (found) {
        const clean = sanitizeSlot(found);
        live[i] = clean;
        draft[i] = toInput(clean);
      } else {
        // Per the spec, an unconfigured screen reads back as control:
        // "blank" — GET /screens should always return all 5, but fall back
        // defensively if a screen index is ever missing from the response.
        const fallback = { screen: i, control: "blank", params: {}, updatedAt: 0 };
        live[i] = fallback;
        draft[i] = blankInput();
      }
    }
    set({ live, draft });
  },

  setDraftSlot: (screen, input) => {
    set((state) => ({ draft: { ...state.draft, [screen]: input } }));
  },

  resetDraftSlot: (screen) => {
    const live = get().live[screen];
    if (!live) return;
    set((state) => ({ draft: { ...state.draft, [screen]: toInput(live) } }));
  },

  discardAllDrafts: () => {
    const { live } = get();
    const draft: Record<number, ScreenSlotInput> = {};
    for (const [screenStr, slot] of Object.entries(live)) {
      draft[Number(screenStr)] = toInput(slot);
    }
    set((state) => ({ draft: { ...state.draft, ...draft } }));
  },

  patchLive: (rawSlot) => {
    const slot = sanitizeSlot(rawSlot);
    set((state) => ({
      live: { ...state.live, [slot.screen]: slot },
      draft: { ...state.draft, [slot.screen]: toInput(slot) },
    }));
  },

  isDirty: (screen) => {
    const { live, draft } = get();
    const l = live[screen];
    const d = draft[screen];
    if (!l || !d) return false;
    return l.control !== d.control || stableStringify(l.params) !== stableStringify(d.params);
  },
}));
