import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ConnectionSettings } from "./components/settings/ConnectionSettings";
import { ConnectionControl } from "./components/settings/ConnectionControl";
import { ScreenGrid } from "./components/designer/ScreenGrid";
import { ScreenEditor } from "./components/designer/ScreenEditor";
import { ProfilesDrawer } from "./components/profiles/ProfilesDrawer";
import { ThemeControl } from "./components/theme/ThemeControl";
import { useApplyTheme } from "./hooks/useApplyTheme";
import { applyLayout, getScreens } from "./lib/tauriCommands";
import {
  describeOrbitError,
  isConnectionLost,
  type BulkScreenSlotInput,
  type OrbitError,
  type ScreenSlot,
} from "./lib/types";
import { useLayoutDraftStore } from "./stores/layoutDraftStore";
import { useDeviceStore } from "./stores/deviceStore";
import "./App.css";

const BACKGROUND_ERROR_AUTO_DISMISS_MS = 10_000;
const APPLY_SUCCESS_AUTO_DISMISS_MS = 3_000;

function App() {
  useApplyTheme();

  const host = useDeviceStore((s) => s.host);
  const connectionStatus = useDeviceStore((s) => s.status);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const markLost = useDeviceStore((s) => s.markLost);

  const [selected, setSelected] = useState<number | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "applying" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  // dirtyCount hits 0 the instant a successful apply resyncs draft to live,
  // which is also the apply-bar's render condition — so success and "the
  // bar disappears" happen in the same tick, with no window to show
  // confirmation inside that bar. Tracked separately here instead.
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);

  // sysmonitor/task.rs emits this when a background push fails (device
  // offline/unreachable mid-loop) — surfaced here since it happens outside
  // any user-initiated command and wouldn't otherwise be visible. It also
  // drops the app back to the connect screen if the failure means the
  // device is actually gone, not just one bad request.
  useEffect(() => {
    const unlisten = listen<OrbitError>("device-error", (event) => {
      const message = describeOrbitError(event.payload);
      setBackgroundError(message);
      if (isConnectionLost(event.payload)) {
        markLost(message);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [markLost]);

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
    <main className="app-shell">
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

        {applySuccessMessage && (
          <p className="apply-success-banner background-error">
            ✓ {applySuccessMessage}
            <button type="button" onClick={() => setApplySuccessMessage(null)}>
              Dismiss
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
    </main>
  );
}

export default App;
