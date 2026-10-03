import { useEffect, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { ScreenEditor } from "../designer/ScreenEditor";
import { ScreenGrid } from "../designer/ScreenGrid";
import { FeedsPanel } from "../feeds/FeedsPanel";
import { FlyoutProfiles } from "./FlyoutProfiles";
import { useApplyLayout } from "../../hooks/useApplyLayout";
import { useApplyTheme } from "../../hooks/useApplyTheme";
import { formatRssi, SIGNAL_BARS, signalQuality } from "../../lib/systemFormat";
import { getScreens, hideFlyout, showMainWindow } from "../../lib/tauriCommands";
import { describeOrbitError, isConnectionLost, type Feed } from "../../lib/types";
import { useDeviceStore } from "../../stores/deviceStore";
import { useFeedsStore } from "../../stores/feedsStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import "../../App.css";

// The tray flyout: the app at the size of a quick visit. Profiles in one
// click, the five screens in a row as they sit on the orb, the selected
// screen's settings under them, and Apply along the bottom. It's a second
// window (src-tauri/src/tray/mod.rs) showing the same state as the main
// one (lib/windowSync.ts), which keeps the connection: connecting,
// reconnecting and the device's status events all happen there.
export function Flyout() {
  useApplyTheme();

  const status = useDeviceStore((s) => s.status);
  const host = useDeviceStore((s) => s.host);
  const system = useDeviceStore((s) => s.system);
  const markLost = useDeviceStore((s) => s.markLost);
  const syncFromDevice = useLayoutDraftStore((s) => s.syncFromDevice);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const setFeeds = useFeedsStore((s) => s.setFeeds);
  const layout = useApplyLayout();
  const [selected, setSelected] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    void refreshFeeds();
    const unlisten = listen<Feed[]>("feeds://changed", (event) => setFeeds(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [refreshFeeds, setFeeds]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void hideFlyout();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // A profile can leave screens out, so what it applied isn't the whole
  // layout; read that back from the orb (as App.tsx does).
  async function handleProfileApplied() {
    setRefreshError(null);
    try {
      syncFromDevice(await getScreens());
    } catch (err) {
      setRefreshError(describeOrbitError(err));
      if (isConnectionLost(err)) markLost(describeOrbitError(err));
    }
  }

  const connected = status === "connected";
  const quality = system ? signalQuality(system.rssi) : null;

  return (
    <main className="flyout">
      <header className="flyout-header">
        {connected ? (
          <>
            <span className="connected-status-dot" aria-hidden="true" />
            <strong className="flyout-host">{system?.hostname ?? host}</strong>
          </>
        ) : (
          <strong className="flyout-host">OrbIt Command Center</strong>
        )}
        {connected && system && quality && (
          <span className="flyout-signal" title={`${system.ssid}, ${quality} signal`}>
            <span className="signal-bars" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={n <= SIGNAL_BARS[quality] ? "signal-bar signal-bar-on" : "signal-bar"} />
              ))}
            </span>
            <span className="mono-num">{formatRssi(system.rssi)}</span>
            <span className="visually-hidden">, {quality} signal</span>
          </span>
        )}
        <button
          type="button"
          className="icon-button flyout-open-full"
          aria-label="Open full window"
          title="Open full window"
          onClick={() => void showMainWindow()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
          </svg>
        </button>
      </header>

      {!connected ? (
        <div className="flyout-empty">
          <p>
            {status === "connecting"
              ? `Connecting to ${host ?? "the orb"}…`
              : status === "lost"
                ? "Lost connection to the orb. It reconnects on its own once the orb is back."
                : "Not connected to an orb."}
          </p>
          <button type="button" onClick={() => void showMainWindow()}>
            Open full window
          </button>
        </div>
      ) : (
        <>
          <FlyoutProfiles onApplied={() => void handleProfileApplied()} />

          {/* --i places the notch that points from the settings below up to
              the selected screen. */}
          <div className="flyout-device" style={{ "--i": selected } as CSSProperties}>
            <ScreenGrid selected={selected} onSelect={setSelected} />
          </div>

          <div className="flyout-sheet">
            <ScreenEditor screen={selected} />
            <section className="flyout-feeds">
              <h2 className="rail-heading">Feeds</h2>
              <FeedsPanel screen={selected} />
            </section>
          </div>

          <footer className="flyout-bar">
            {refreshError && (
              <p className="connection-settings-error" role="alert">
                {refreshError}
              </p>
            )}
            {layout.error && (
              <p className="connection-settings-error" role="alert">
                Couldn't apply: {layout.error}
              </p>
            )}
            {layout.warning && (
              <p className="connection-settings-error" role="alert">
                {layout.warning}
              </p>
            )}
            <div className="flyout-bar-actions">
              {layout.dirtyCount > 0 ? (
                <>
                  <button type="button" disabled={layout.applying} onClick={layout.discard}>
                    Discard
                  </button>
                  <button
                    type="button"
                    className="apply-controls-apply"
                    disabled={layout.applying}
                    onClick={() => void layout.apply()}
                  >
                    {layout.applying ? "Applying…" : `Apply Layout (${layout.dirtyCount})`}
                  </button>
                </>
              ) : (
                <span className="apply-controls-idle" role="status">
                  {layout.successMessage ? `✓ ${layout.successMessage}` : "Orb matches what you see"}
                </span>
              )}
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
