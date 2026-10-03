import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ConnectionSettings } from "./components/settings/ConnectionSettings";
import { ConnectionControl } from "./components/settings/ConnectionControl";
import { ScreenGrid } from "./components/designer/ScreenGrid";
import { ScreenEditor } from "./components/designer/ScreenEditor";
import { ProfilesDrawer } from "./components/profiles/ProfilesDrawer";
import { FeedsDrawer } from "./components/feeds/FeedsDrawer";
import { ThemeControl } from "./components/theme/ThemeControl";
import { StatusBar } from "./components/status/StatusBar";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { applyLayout, getScreens, setShowInTaskbar } from "./lib/tauriCommands";
import { COLORS_UNSUPPORTED_MESSAGE, colorsNotApplied } from "./lib/rgb565";
import {
  describeOrbitError,
  isConnectionLost,
  type BulkScreenSlotInput,
  type Feed,
  type OrbitError,
  type ScreenSlot,
  type SystemInfo,
} from "./lib/types";
import { useLayoutDraftStore } from "./stores/layoutDraftStore";
import { useDeviceStore } from "./stores/deviceStore";
import { useFeedsStore } from "./stores/feedsStore";
import { useWindowStore } from "./stores/windowStore";
import "./App.css";

const BACKGROUND_ERROR_AUTO_DISMISS_MS = 10_000;
const APPLY_SUCCESS_AUTO_DISMISS_MS = 3_000;
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
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const setFeeds = useFeedsStore((s) => s.setFeeds);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "applying" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  // An apply the device accepted but didn't fully honor (see colorsNotApplied).
  const [applyWarning, setApplyWarning] = useState<string | null>(null);
  // dirtyCount hits 0 the instant a successful apply resyncs draft to live,
  // which is also the apply-bar's render condition — so success and "the
  // bar disappears" happen in the same tick, with no window to show
  // confirmation inside that bar. Tracked separately here instead.
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (!applySuccessMessage) return;
    const timer = setTimeout(() => setApplySuccessMessage(null), APPLY_SUCCESS_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [applySuccessMessage]);

  const draft = useLayoutDraftStore((s) => s.draft);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);
  const syncFromDevice = useLayoutDraftStore((s) => s.syncFromDevice);
  const patchLive = useLayoutDraftStore((s) => s.patchLive);
  const discardAllDrafts = useLayoutDraftStore((s) => s.discardAllDrafts);

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

  async function handleApplyLayout() {
    // countdown is excluded from bulk apply — it's action-driven and always
    // applied directly (see ScreenEditor/CountdownForm) — and only dirty
    // screens are sent, since bulk POST replaces exactly what's given.
    const toApply: BulkScreenSlotInput[] = Object.entries(draft)
      .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
      .filter((s) => s.control !== "countdown" && isDirty(s.screen));

    if (toApply.length === 0) return;

    setApplyState("applying");
    setApplyError(null);
    try {
      const applied = await applyLayout(toApply);
      applied.forEach(patchLive);
      setApplyState("idle");
      const colorsIgnored = applied.some((slot) => {
        const sent = toApply.find((s) => s.screen === slot.screen);
        return sent !== undefined && colorsNotApplied(sent, slot);
      });
      setApplyWarning(colorsIgnored ? COLORS_UNSUPPORTED_MESSAGE : null);
      setApplySuccessMessage(
        `Applied ${applied.length} screen${applied.length === 1 ? "" : "s"} to device`,
      );
    } catch (err) {
      setApplyState("error");
      setApplyError(describeOrbitError(err));
      if (isConnectionLost(err)) markLost(describeOrbitError(err));
    }
  }

  function handleDiscardAll() {
    discardAllDrafts();
    setApplyError(null);
  }

  const connected = connectionStatus === "connected";
  const dirtyCount = connected
    ? [0, 1, 2, 3, 4].filter((i) => isDirty(i) && draft[i]?.control !== "countdown").length
    : 0;

  return (
    <main className={`app-shell${connected ? " has-status-bar" : ""}`}>
      <header className="app-header">
        <h1>OrbIt Command Center</h1>
        <div className="app-header-actions">
          {connected && host && (
            <ConnectionControl
              host={host}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onDisconnect={handleDisconnect}
            />
          )}
          <ThemeControl />
          <button type="button" onClick={() => setFeedsOpen(true)}>
            Feeds
          </button>
          {connected && (
            <button type="button" className="profiles-open-button" onClick={() => setProfilesOpen(true)}>
              Profiles
            </button>
          )}
        </div>
      </header>

      <div className={`app-body${connected ? "" : " app-body-centered"}`}>
        {backgroundError && (
          <p className="connection-settings-error background-error">
            Background push: {backgroundError}
            <button type="button" onClick={() => setBackgroundError(null)}>
              Dismiss
            </button>
          </p>
        )}

        {applyWarning && (
          <p className="connection-settings-error background-error" role="alert">
            {applyWarning}
            <button type="button" onClick={() => setApplyWarning(null)}>
              Dismiss
            </button>
          </p>
        )}

        {applySuccessMessage && (
          <p className="apply-success-banner background-error">
            ✓ {applySuccessMessage}
            <button type="button" onClick={() => setApplySuccessMessage(null)}>
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

        {!connected ? (
          <ConnectionSettings onConnected={handleConnected} />
        ) : (
          <>
            {refreshError && <p className="connection-settings-error">{refreshError}</p>}

            <ScreenGrid selected={selected} onSelect={setSelected} />

            {selected !== null && <ScreenEditor screen={selected} />}
          </>
        )}
      </div>

      {connected && (
        <ProfilesDrawer
          open={profilesOpen}
          onClose={() => setProfilesOpen(false)}
          onApplied={handleProfileApplied}
        />
      )}

      <FeedsDrawer open={feedsOpen} onClose={() => setFeedsOpen(false)} />

      {connected && dirtyCount > 0 && (
        <div className="apply-bar">
          <span className="apply-bar-status">
            {dirtyCount} screen{dirtyCount === 1 ? "" : "s"} changed
          </span>
          <div className="button-row">
            <button type="button" disabled={applyState === "applying"} onClick={handleDiscardAll}>
              Discard
            </button>
            <button type="button" disabled={applyState === "applying"} onClick={handleApplyLayout}>
              {applyState === "applying" ? "Applying…" : `Apply Layout (${dirtyCount})`}
            </button>
          </div>
          {applyError && <p className="field-error apply-bar-error">{applyError}</p>}
        </div>
      )}

      {connected && <StatusBar />}
    </main>
  );
}

export default App;
