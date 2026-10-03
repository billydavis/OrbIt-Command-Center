import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ConnectionSettings } from "./components/settings/ConnectionSettings";
import { SettingsMenu } from "./components/settings/SettingsMenu";
import { WindowControls } from "./components/settings/WindowControls";
import { ScreenGrid } from "./components/designer/ScreenGrid";
import { ScreenEditor } from "./components/designer/ScreenEditor";
import { ProfileList } from "./components/profiles/ProfileList";
import { FeedsDrawer } from "./components/feeds/FeedsDrawer";
import { FeedsPanel } from "./components/feeds/FeedsPanel";
import { StatusBar } from "./components/status/StatusBar";
import { useApplyLayout } from "./hooks/useApplyLayout";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { getScreens, setShowInTaskbar } from "./lib/tauriCommands";
import { IS_WINDOWS } from "./lib/platform";
import {
  describeOrbitError,
  isConnectionLost,
  type Feed,
  type OrbitError,
  type ScreenSlot,
  type SystemInfo,
} from "./lib/types";
import { useLayoutDraftStore } from "./stores/layoutDraftStore";
import { useDeviceStore } from "./stores/deviceStore";
import { useFeedsStore } from "./stores/feedsStore";
import { useProfilesStore } from "./stores/profilesStore";
import { useWindowStore } from "./stores/windowStore";
import "./App.css";

const BACKGROUND_ERROR_AUTO_DISMISS_MS = 10_000;
const REBOOT_NOTICE_AUTO_DISMISS_MS = 10_000;

function App() {
  useApplyTheme();

  const host = useDeviceStore((s) => s.host);
  const connectionStatus = useDeviceStore((s) => s.status);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const markLost = useDeviceStore((s) => s.markLost);
  const setSystem = useDeviceStore((s) => s.setSystem);
  const setSystemUnsupported = useDeviceStore((s) => s.setSystemUnsupported);

  const showInTaskbar = useWindowStore((s) => s.showInTaskbar);
  useEffect(() => {
    void setShowInTaskbar(showInTaskbar);
  }, [showInTaskbar]);

  const [selected, setSelected] = useState<number | null>(null);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const setActiveProfile = useProfilesStore((s) => s.setActive);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const setFeeds = useFeedsStore((s) => s.setFeeds);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const layout = useApplyLayout();
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [rebootNotice, setRebootNotice] = useState(false);

  // sysmonitor/task.rs emits this when a background push fails, and
  // heartbeat.rs when the device stops answering — surfaced here since it
  // happens outside any user-initiated command and wouldn't otherwise be
  // visible. A device that's actually gone drops the app back to the
  // connect screen, which says so itself; anything else (one rejected push)
  // gets the banner.
  useEffect(() => {
    const unlisten = listen<OrbitError>("device-error", (event) => {
      const message = describeOrbitError(event.payload);
      if (isConnectionLost(event.payload)) {
        markLost(message);
      } else {
        setBackgroundError(message);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [markLost]);

  // heartbeat.rs: live device status, and a restart that was quick enough
  // that the heartbeat never saw the device go missing. The layout itself
  // mostly survives (the device restores it from flash), but countdown slots
  // aren't persisted — so offer a Refresh rather than resyncing
  // automatically, which would throw away any unsaved drafts.
  useEffect(() => {
    const unlistenSystem = listen<SystemInfo>("device://system", (event) => setSystem(event.payload));
    const unlistenUnsupported = listen("device://system-unsupported", () => setSystemUnsupported());
    const unlistenRebooted = listen<SystemInfo>("device://rebooted", () => setRebootNotice(true));
    return () => {
      unlistenSystem.then((f) => f());
      unlistenUnsupported.then((f) => f());
      unlistenRebooted.then((f) => f());
    };
  }, [setSystem, setSystemUnsupported]);

  // Feeds exist whether or not a device is connected (the sysMonitor
  // readings, anything another app pushes), so they're loaded once here and
  // kept current from feeds/pusher.rs's change event rather than per form.
  useEffect(() => {
    void refreshFeeds();
    const unlisten = listen<Feed[]>("feeds://changed", (event) => setFeeds(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [refreshFeeds, setFeeds]);

  useEffect(() => {
    if (!rebootNotice) return;
    const timer = setTimeout(() => setRebootNotice(false), REBOOT_NOTICE_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [rebootNotice]);

  useEffect(() => {
    if (!backgroundError) return;
    const timer = setTimeout(() => setBackgroundError(null), BACKGROUND_ERROR_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [backgroundError]);

  const draft = useLayoutDraftStore((s) => s.draft);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);
  const syncFromDevice = useLayoutDraftStore((s) => s.syncFromDevice);

  function handleConnected(screens: ScreenSlot[]) {
    syncFromDevice(screens);
    setSelected(0);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      syncFromDevice(await getScreens());
    } catch (err) {
      setRefreshError(describeOrbitError(err));
      if (isConnectionLost(err)) markLost(describeOrbitError(err));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    setSelected(null);
  }

  // Profiles can omit screens (countdown is never saved into one, see
  // SaveProfileDialog), so apply_profile's response only covers the screens
  // it actually touched — re-fetching the full layout here, rather than
  // feeding that partial list straight into syncFromDevice, avoids treating
  // an omitted screen as freshly "blank" when the device left it untouched.
  async function handleProfileApplied() {
    await handleRefresh();
  }

  const connected = connectionStatus === "connected";

  // A profile stays highlighted until the layout is changed away from it,
  // or the orb is gone. Keyed on the draft itself, not just on being
  // dirty, so an edit made while other changes are still unapplied counts
  // too (a profile updated from a layout with unapplied changes is
  // highlighted, and the next edit should still drop it); a draft that
  // changed without becoming dirty (a resync from the orb) doesn't.
  const anyDirty = connected && [0, 1, 2, 3, 4].some((i) => isDirty(i));
  const draftAtHighlight = useRef(draft);
  const activeProfileId = useProfilesStore((s) => s.activeId);
  useEffect(() => {
    draftAtHighlight.current = useLayoutDraftStore.getState().draft;
  }, [activeProfileId]);
  useEffect(() => {
    if (!connected) setActiveProfile(null);
    else if (anyDirty && draft !== draftAtHighlight.current) setActiveProfile(null);
  }, [draft, anyDirty, connected, setActiveProfile]);

  // Notices about what just happened (a failed background push, an apply
  // result, a restarted orb). Shown at the top of whichever layout is up.
  const banners = (
    <>
      {backgroundError && (
        <p className="connection-settings-error background-error">
          Background push: {backgroundError}
          <button type="button" onClick={() => setBackgroundError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {layout.warning && (
        <p className="connection-settings-error background-error" role="alert">
          {layout.warning}
          <button type="button" onClick={layout.dismissWarning}>
            Dismiss
          </button>
        </p>
      )}

      {layout.successMessage && (
        <p className="apply-success-banner background-error">
          ✓ {layout.successMessage}
          <button type="button" onClick={layout.dismissSuccess}>
            Dismiss
          </button>
        </p>
      )}

      {rebootNotice && connected && (
        <p className="apply-success-banner background-error" role="status">
          The orb restarted and restored its saved layout. Countdowns aren't saved, so any were cleared.
          <button
            type="button"
            onClick={() => {
              setRebootNotice(false);
              void handleRefresh();
            }}
          >
            Refresh
          </button>
        </p>
      )}

      {layout.error && (
        <p className="connection-settings-error background-error" role="alert">
          Couldn't apply: {layout.error}
          <button type="button" onClick={layout.dismissError}>
            Dismiss
          </button>
        </p>
      )}
    </>
  );

  return (
    <main className={`app-shell${connected ? " has-status-bar" : ""}`}>
      {/* On Windows this is also the window's title bar (the native one
          is off there): dragging any part of it that isn't a control moves
          the window. The attribute only counts on the element actually
          under the pointer, hence one on each of the non-interactive
          pieces. It does nothing where the native title bar is on. */}
      <header className={`app-header${IS_WINDOWS ? " app-header-titlebar" : ""}`} data-tauri-drag-region>
        <div className="app-header-title" data-tauri-drag-region>
          <SettingsMenu
            connected={connected}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onDisconnect={handleDisconnect}
          />
          <h1 data-tauri-drag-region>OrbIt Command Center</h1>
          {connected && host && (
            <span className="connection-status" data-tauri-drag-region>
              <span className="connected-status-dot" aria-hidden="true" />
              Connected to <strong className="mono-num">{host}</strong>
            </span>
          )}
        </div>
        <div className="app-header-actions">
          {/* Up here rather than in a bar of its own: the one action that
              sends anything to the orb stays in the same place whether or
              not there's something to send, and says which it is. */}
          {connected &&
            (layout.dirtyCount > 0 ? (
              <div className="apply-controls">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Discard changes"
                  title="Discard changes"
                  disabled={layout.applying}
                  onClick={layout.discard}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="apply-controls-apply"
                  disabled={layout.applying}
                  onClick={layout.apply}
                >
                  {layout.applying ? "Applying…" : `Apply Layout (${layout.dirtyCount})`}
                </button>
              </div>
            ) : (
              <span className="apply-controls-idle">Orb matches what you see</span>
            ))}
          {IS_WINDOWS && <WindowControls />}
        </div>
      </header>

      <div className={`app-body ${connected ? "app-body-workbench" : "app-body-centered"}`}>
        {!connected ? (
          <>
            {banners}
            <ConnectionSettings onConnected={handleConnected} />
            <button type="button" className="feeds-open-button" onClick={() => setFeedsOpen(true)}>
              Feeds
            </button>
          </>
        ) : (
          // The workbench: profiles and feeds stay in view in a full-height
          // rail beside the screens, rather than behind drawers. The rail
          // and the main column scroll separately.
          <div className="workbench">
            <aside className="rail">
              <section className="rail-section">
                <ProfileList onApplied={handleProfileApplied} />
              </section>
              <section className="rail-section">
                <div className="rail-heading-row">
                  <h2 className="rail-heading">Feeds</h2>
                  <button type="button" className="rail-heading-action" onClick={() => setFeedsOpen(true)}>
                    Details
                  </button>
                </div>
                <FeedsPanel screen={selected} />
              </section>
            </aside>

            <div className="workbench-main">
              {banners}
              {refreshError && <p className="connection-settings-error">{refreshError}</p>}

              <ScreenGrid selected={selected} onSelect={setSelected} />

              {selected !== null && <ScreenEditor screen={selected} />}
            </div>
          </div>
        )}
      </div>

      <FeedsDrawer open={feedsOpen} onClose={() => setFeedsOpen(false)} />

      {connected && <StatusBar />}
    </main>
  );
}

export default App;
