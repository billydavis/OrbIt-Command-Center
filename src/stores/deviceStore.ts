import { create } from "zustand";
import { connectDevice, disconnectDevice } from "../lib/tauriCommands";
import { describeOrbitError, type ScreenSlot } from "../lib/types";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "lost";

interface DeviceState {
  host: string | null;
  status: ConnectionStatus;
  /** Set on a failed connect attempt, or when markLost fires. */
  error: string | null;

  connect: (host: string) => Promise<ScreenSlot[]>;
  disconnect: () => Promise<void>;
  /**
   * Called by any command's error handler (ScreenEditor, ProfileCard,
   * CountdownForm, ...) when it sees Unreachable/Timeout — not just the
   * top-level connect flow. Drops back to the connect screen with `host`
   * pre-filled and an explanatory message, rather than leaving the UI
   * showing a device that's no longer actually there.
   */
  markLost: (message: string) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  host: null,
  status: "disconnected",
  error: null,

  connect: async (host) => {
    set({ status: "connecting", error: null });
    try {
      const screens = await connectDevice(host);
      set({ host, status: "connected", error: null });
      return screens;
    } catch (err) {
      set({ status: "disconnected", error: describeOrbitError(err) });
      throw err;
    }
  },

  disconnect: async () => {
    await disconnectDevice();
    set({ host: null, status: "disconnected", error: null });
  },

  markLost: (message) => {
    // Only meaningful once actually connected — an error before that point
    // is just a normal failed-connect-attempt, handled by connect() itself.
    if (get().status !== "connected") return;
    set({ status: "lost", error: message });
  },
}));
