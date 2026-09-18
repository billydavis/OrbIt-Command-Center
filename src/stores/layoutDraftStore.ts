import { create } from "zustand";
import { SCREEN_COUNT, type ScreenSlot, type ScreenSlotInput } from "../lib/types";

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
        live[i] = found;
        draft[i] = toInput(found);
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

  patchLive: (slot) => {
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
