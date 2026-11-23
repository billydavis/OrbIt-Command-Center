import { create } from "zustand";
import { persist } from "zustand/middleware";
import { connectDevice, disconnectDevice, getCapabilities, getSystem } from "../lib/tauriCommands";
import { describeOrbitError, type Capabilities, type ScreenSlot, type SystemInfo } from "../lib/types";
import { useLayoutDraftStore } from "./layoutDraftStore";

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
  /**
   * Bumped on every connect attempt and on disconnect/lost — never on a
   * plain state update. An async device action (Apply Layout, a ticker
   * refresh, a countdown action, the sysMonitor tick) that outlives the
   * connection it was sent on (the user switched devices, or disconnected,
   * before it resolved) can otherwise patch the new device's live/draft
   * state with the old device's answer. Callers capture this before the
   * await and check `isCurrentConnection` after, before writing anything
   * from the result into layoutDraftStore.
   */
  generation: number;

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

// Read right away rather than left for the heartbeat's first probe (up to
// PROBE_INTERVAL later): otherwise anything that depends on it — like
// whether to show the rail's Orb buttons — would start from its no-reading-
// yet default and then jump as soon as the first probe lands, every single
// time a device connects.
async function readSystem(): Promise<{ system: SystemInfo | null; systemUnsupported: boolean }> {
  try {
    const system = await getSystem();
    // `null` here means the device's own 404 on GET /api/v1/system (see
    // commands::get_system) — firmware that really doesn't have it, not a
    // fluke. Anything else that goes wrong (a timeout, a dropped request)
    // throws instead, and is left for the heartbeat to settle shortly.
    return { system, systemUnsupported: system === null };
  } catch {
    return { system: null, systemUnsupported: false };
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
      generation: 0,

      connect: async (host, hostname) => {
        // ConnectionSettings fires an automatic reconnect-to-last-used right
        // after a scan, with no lock against a manual click on a *different*
        // device landing while that's in flight — so two connect() calls can
        // genuinely run concurrently. Whichever started last (highest
        // generation) is the one actually asked for, so an earlier one still
        // in flight must not let its answer win just because it happens to
        // resolve later: it bails out instead of touching any state below.
        let myGeneration = 0;
        set((state) => {
          myGeneration = state.generation + 1;
          return {
            status: "connecting",
            error: null,
            system: null,
            systemUnsupported: false,
            widget: null,
            capabilities: null,
            generation: myGeneration,
          };
        });
        // Whatever screens were on display describe a connection this one is
        // replacing — gone now rather than left sitting there (possibly
        // showing through, see layoutDraftStore.ts's `clear`) until a
        // syncFromDevice this attempt may never reach replaces it.
        useLayoutDraftStore.getState().clear();
        try {
          const screens = await connectDevice(host);
          // Before the status changes, so the workbench never opens offering
          // a control the orb doesn't have, or showing/hiding the Orb
          // buttons on the no-reading-yet default rather than this device's
          // own answer.
          const [capabilities, { system, systemUnsupported }] = await Promise.all([
            readCapabilities(),
            readSystem(),
          ]);
          if (get().generation !== myGeneration) {
            // Superseded while those requests were in flight — some other
            // connect() (or a disconnect) has since become the current one.
            // Silently drop: this isn't the device the UI is asking to show.
            throw new Error("superseded by a newer connection attempt");
          }
          const knownHostname = hostname ?? (host.toLowerCase().endsWith(".local") ? host.toLowerCase() : null);
          set({
            host,
            hostname: knownHostname,
            status: "connected",
            error: null,
            capabilities,
            system,
            systemUnsupported,
            widget: system?.widget ?? showingWidget(capabilities),
          });
          return screens;
        } catch (err) {
          // A superseded attempt must not stomp on whatever the current one
          // (or a disconnect) has since put in `status`/`error` — only the
          // generation that's still current gets to report its own failure.
          if (get().generation === myGeneration) {
            set({ status: "disconnected", error: describeOrbitError(err) });
          }
          throw err;
        }
      },

      disconnect: async () => {
        await disconnectDevice();
        useLayoutDraftStore.getState().clear();
        set((state) => ({
          host: null,
          hostname: null,
          status: "disconnected",
          error: null,
          system: null,
          systemUnsupported: false,
          widget: null,
          capabilities: null,
          generation: state.generation + 1,
        }));
      },

      markLost: (message) => {
        // Only meaningful once actually connected — an error before that point
        // is just a normal failed-connect-attempt, handled by connect() itself.
        if (get().status !== "connected") return;
        useLayoutDraftStore.getState().clear();
        set((state) => ({
          status: "lost",
          error: message,
          system: null,
          systemUnsupported: false,
          widget: null,
          capabilities: null,
          generation: state.generation + 1,
        }));
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

/**
 * Whether `generation` (captured before an async device call) still matches
 * the current connection. False means the user switched devices or
 * disconnected while that call was in flight — its result describes a
 * device that isn't the one on screen anymore, and shouldn't be written
 * into layoutDraftStore.
 */
export function isCurrentConnection(generation: number): boolean {
  return useDeviceStore.getState().generation === generation;
}
