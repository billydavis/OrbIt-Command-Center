import { create } from "zustand";
import { feedServerStatus, listFeeds } from "../lib/tauriCommands";
import type { Feed, FeedServerStatus } from "../lib/types";

interface FeedsState {
  /** Every feed the app knows about, sorted by id. */
  feeds: Feed[];
  /** The local ingest endpoint; null until first asked. */
  server: FeedServerStatus | null;

  /** Reads both from the backend — at startup, and when the panel opens. */
  refresh: () => Promise<void>;
  /** From the `feeds://changed` event (src-tauri/src/feeds/pusher.rs). */
  setFeeds: (feeds: Feed[]) => void;
}

export const useFeedsStore = create<FeedsState>((set) => ({
  feeds: [],
  server: null,

  refresh: async () => {
    const [feeds, server] = await Promise.all([listFeeds(), feedServerStatus()]);
    set({ feeds, server });
  },

  setFeeds: (feeds) => set({ feeds }),
}));
