import { create } from "zustand";
import { persist } from "zustand/middleware";
import { connectDevice, disconnectDevice, getCapabilities } from "../lib/tauriCommands";
import { describeOrbitError, type Capabilities, type ScreenSlot, type SystemInfo } from "../lib/types";

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
   * The widget the orb is showing ("OrbIt", "Clock", ...). Kept current by
   * the heartbeat's status (`system.widget`), so it follows the orb's own
   * buttons and cycle timer; a button press sent from here and the
   * capabilities read on connecting set it sooner. Firmware that says only
   * in reply to a press leaves it null until one is sent, and it can then
   * have moved on unseen.
   */
  widget: string | null;
  /**
   * Which controls and screensaver effects the connected firmware was built
   * with (see lib/capabilities.ts). Null while not connected, and on
   * firmware that doesn't say, where all of them are.
   */
  capabilities: Capabilities | null;

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
  /**
   * Asks the orb again what it was built with: after it restarts (it may
   * have been flashed with a different build) or refuses something as not
   * built. Best-effort, and what's known stays if the orb doesn't answer.
   */
  refreshCapabilities: () => Promise<void>;
}

// A failure here shouldn't fail the connect it's part of: the orb answered
// a moment ago, and offering everything is how the app behaved before.
async function readCapabilities(): Promise<Capabilities | null> {
  try {
    return await getCapabilities();
  } catch {
    return null;
  }
}

function showingWidget(capabilities: Capabilities | null): string | null {
  return capabilities?.widgets?.find((w) => w.showing)?.name ?? null;
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
      capabilities: null,

      connect: async (host, hostname) => {
        set({
          status: "connecting",
          error: null,
          system: null,
          systemUnsupported: false,
          widget: null,
          capabilities: null,
        });
        try {
          const screens = await connectDevice(host);
          // Before the status changes, so the workbench never opens offering
          // a control the orb doesn't have.
          const capabilities = await readCapabilities();
          const knownHostname = hostname ?? (host.toLowerCase().endsWith(".local") ? host.toLowerCase() : null);
          set({
            host,
            hostname: knownHostname,
            status: "connected",
            error: null,
            capabilities,
            widget: showingWidget(capabilities),
          });
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
          capabilities: null,
        });
      },

      markLost: (message) => {
        // Only meaningful once actually connected — an error before that point
        // is just a normal failed-connect-attempt, handled by connect() itself.
        if (get().status !== "connected") return;
        set({
          status: "lost",
          error: message,
          system: null,
          systemUnsupported: false,
          widget: null,
          capabilities: null,
        });
      },

      setSystem: (system) => {
        // A late event from a probe that raced a disconnect shouldn't
        // repopulate status for a device that's no longer connected.
        if (get().status !== "connected") return;
        set(system.widget ? { system, widget: system.widget } : { system });
      },

      setSystemUnsupported: () => {
        if (get().status !== "connected") return;
        set({ systemUnsupported: true });
      },

      setWidget: (widget) => set({ widget }),

      refreshCapabilities: async () => {
        try {
          const capabilities = await getCapabilities();
          if (get().status !== "connected") return;
          set({ capabilities, widget: showingWidget(capabilities) ?? get().widget });
        } catch {
          // Still whatever it was.
        }
      },
    }),
    {
      name: "orbit-device",
      // Only which device was last used — never status/error, which describe
      // a connection that doesn't exist yet when the app starts.
      partialize: (s) => ({ host: s.host, hostname: s.hostname }),
    },
  ),
);
