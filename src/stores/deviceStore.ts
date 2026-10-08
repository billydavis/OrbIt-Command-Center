import { create } from "zustand";
import { persist } from "zustand/middleware";
import { connectDevice, disconnectDevice } from "../lib/tauriCommands";
import { describeOrbitError, type ScreenSlot, type SystemInfo } from "../lib/types";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "lost";

interface DeviceState {
  host: string | null;
  /**
   * The device's mDNS hostname (e.g. "info-orbs-ab.local") when known —
   * from a discovery scan, or a manually entered .local name. Kept after
   * the connection is lost so a re-scan can recognise the same device even
   * if DHCP has since given it a new IP. Saved (with `host`) across app
   * restarts, so launching the app reconnects to the last-used device.
   */
  hostname: string | null;
  status: ConnectionStatus;
  /** Set on a failed connect attempt, or when markLost fires. */
  error: string | null;
  /**
   * Latest status from the heartbeat (null until the first probe, on
   * firmware without GET /api/v1/system, or while not connected). Not
   * persisted — it describes a live connection.
   */
  system: SystemInfo | null;
  /** The connected firmware has no GET /api/v1/system, so `system` stays null. */
  systemUnsupported: boolean;
  /**
   * The widget the orb is showing ("OrbIt", "Clock", ...), as of the last
   * button press sent from here: the reply to a press is the only place the
   * device says. Null until then, and after anything that could have
   * changed it unseen (a reconnect, a restart).
   */
  widget: string | null;

  connect: (host: string, hostname?: string) => Promise<ScreenSlot[]>;
  disconnect: () => Promise<void>;
  /**
   * Called when the heartbeat gives up on the device (heartbeat.rs, after
   * several probes in a row went unanswered). Drops back to the connect
   * screen with `host` pre-filled and an explanatory message, rather than
   * leaving the UI showing a device that's no longer actually there. A
   * single command that got no answer doesn't call this: it shows its own
   * error and the connection stays up.
   */
  markLost: (message: string) => void;
  setSystem: (system: SystemInfo) => void;
  setSystemUnsupported: () => void;
  setWidget: (widget: string | null) => void;
}

export const useDeviceStore = create<DeviceState>()(
  persist(
    (set, get) => ({
      host: null,
      hostname: null,
      status: "disconnected",
      error: null,
      system: null,
      systemUnsupported: false,
      widget: null,

      connect: async (host, hostname) => {
        set({ status: "connecting", error: null, system: null, systemUnsupported: false, widget: null });
        try {
          const screens = await connectDevice(host);
          const knownHostname = hostname ?? (host.toLowerCase().endsWith(".local") ? host.toLowerCase() : null);
          set({ host, hostname: knownHostname, status: "connected", error: null });
          return screens;
        } catch (err) {
          set({ status: "disconnected", error: describeOrbitError(err) });
          throw err;
        }
      },

      disconnect: async () => {
        await disconnectDevice();
        set({
          host: null,
          hostname: null,
          status: "disconnected",
          error: null,
          system: null,
          systemUnsupported: false,
          widget: null,
        });
      },

      markLost: (message) => {
        // Only meaningful once actually connected — an error before that point
        // is just a normal failed-connect-attempt, handled by connect() itself.
        if (get().status !== "connected") return;
        set({ status: "lost", error: message, system: null, systemUnsupported: false, widget: null });
      },

      setSystem: (system) => {
        // A late event from a probe that raced a disconnect shouldn't
        // repopulate status for a device that's no longer connected.
        if (get().status !== "connected") return;
        set({ system });
      },

      setSystemUnsupported: () => {
        if (get().status !== "connected") return;
        set({ systemUnsupported: true });
      },

      setWidget: (widget) => set({ widget }),
    }),
    {
      name: "orbit-device",
      // Only which device was last used — never status/error, which describe
      // a connection that doesn't exist yet when the app starts.
      partialize: (s) => ({ host: s.host, hostname: s.hostname }),
    },
  ),
);
