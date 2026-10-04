import { emit, listen } from "@tauri-apps/api/event";
import { useDeviceStore } from "../stores/deviceStore";
import { stableStringify, useLayoutDraftStore } from "../stores/layoutDraftStore";
import { useProfilesStore } from "../stores/profilesStore";
import { useThemeStore } from "../stores/themeStore";

// The main window and the tray flyout are separate webviews, each with its
// own copy of every store. This keeps the copies that describe one shared
// thing (the connection, the layout and its unapplied edits, the profiles,
// the theme) the same in both: a change to one is sent to the other as a
// Tauri event and set there. An edit started in the flyout is there, still
// unapplied, when the full window opens, and the reverse.
//
// Feeds aren't synced: each window hears the backend's own feeds event.

/** The label of the window that owns the connection (connect, reconnect, heartbeat events). */
export const MAIN_WINDOW = "main";
export const FLYOUT_WINDOW = "flyout";

const SYNC_EVENT = "window-sync";
const HELLO_EVENT = "window-sync-hello";

type Fields = Record<string, unknown>;

interface SyncMessage {
  from: string;
  store: string;
  state: Fields;
}

interface StoreLike {
  getState(): Fields;
  setState(partial: Fields): void;
  subscribe(listener: (state: Fields, previous: Fields) => void): () => void;
}

interface SyncedStore {
  name: string;
  api: StoreLike;
  /** The data fields to keep in step; a store's actions stay its own. */
  keys: readonly string[];
  /** More to set alongside fields that arrived from the other window. */
  alongside?: (arrived: Fields, current: Fields) => Fields;
}

const SYNCED: SyncedStore[] = [
  {
    name: "device",
    api: useDeviceStore as unknown as StoreLike,
    keys: ["host", "hostname", "status", "error", "system", "systemUnsupported", "widget"],
  },
  {
    name: "layout",
    api: useLayoutDraftStore as unknown as StoreLike,
    keys: ["live", "draft"],
    alongside: (arrived, current) => {
      const extra: Fields = {};
      // Whether a screen is dirty depends on both `live` and `draft`, but
      // components subscribe to `draft` alone, since every local change to
      // `live` replaces `draft` too. An apply made in the other window can
      // change only `live` here (this window already had the draft), so
      // `draft` gets a new identity for them to re-render on.
      if ("live" in arrived && !("draft" in arrived)) {
        extra.draft = { ...(current.draft as Fields) };
      }
      // A form keeps its fields in local state, so a draft changed from
      // outside it needs the form started over (see replaceDraftSlot). Not
      // while this window has focus, though: then the person is typing
      // here, and all that arrives is the other window echoing them.
      if ("draft" in arrived && !document.hasFocus()) {
        const before = current.draft as Fields;
        const revision = { ...(current.draftRevision as Record<string, number>) };
        for (const [screen, input] of Object.entries(arrived.draft as Fields)) {
          if (stableStringify(input) !== stableStringify(before[screen])) {
            revision[screen] = (revision[screen] ?? 0) + 1;
          }
        }
        extra.draftRevision = revision;
      }
      return extra;
    },
  },
  {
    name: "profiles",
    api: useProfilesStore as unknown as StoreLike,
    keys: ["profiles", "activeId"],
  },
  {
    name: "theme",
    api: useThemeStore as unknown as StoreLike,
    keys: ["mode", "accent"],
  },
];

function pick(state: Fields, keys: readonly string[]): Fields {
  return Object.fromEntries(keys.map((key) => [key, state[key]]));
}

/**
 * Starts keeping this window's stores in step with the other window's.
 * Called once, before the first render, with this window's label.
 */
export async function startWindowSync(label: string) {
  // Setting what arrived fires the same subscription a local change does;
  // this keeps it from being sent straight back.
  let settingArrived = false;

  for (const synced of SYNCED) {
    synced.api.subscribe((state, previous) => {
      if (settingArrived) return;
      const changed = synced.keys.filter((key) => state[key] !== previous[key]);
      if (changed.length === 0) return;
      void emit(SYNC_EVENT, { from: label, store: synced.name, state: pick(state, changed) });
    });
  }

  await listen<SyncMessage>(SYNC_EVENT, ({ payload }) => {
    if (payload.from === label) return;
    const synced = SYNCED.find((s) => s.name === payload.store);
    if (!synced) return;

    // Only what actually differs is set, so a value both windows already
    // agree on (each hears the backend's events for itself) changes nothing
    // here. Compared with sorted keys: a payload comes back from the
    // backend with its keys in alphabetical order.
    const current = synced.api.getState();
    const arrived: Fields = {};
    for (const key of synced.keys) {
      if (key in payload.state && stableStringify(payload.state[key]) !== stableStringify(current[key])) {
        arrived[key] = payload.state[key];
      }
    }
    if (Object.keys(arrived).length === 0) return;

    settingArrived = true;
    try {
      synced.api.setState({ ...arrived, ...synced.alongside?.(arrived, current) });
    } finally {
      settingArrived = false;
    }
  });

  // The main window is the one that connects, so its state is the one to
  // start from: it sends everything when it loads and whenever the flyout
  // asks, and the flyout asks when it loads. Whichever loads second, the
  // flyout ends up with the main window's state.
  if (label === MAIN_WINDOW) {
    const sendAll = () => {
      for (const synced of SYNCED) {
        void emit(SYNC_EVENT, {
          from: label,
          store: synced.name,
          state: pick(synced.api.getState(), synced.keys),
        });
      }
    };
    await listen(HELLO_EVENT, sendAll);
    sendAll();
  } else {
    await emit(HELLO_EVENT);
  }
}
