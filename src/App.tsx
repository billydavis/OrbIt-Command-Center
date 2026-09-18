import { useState } from "react";
import { ConnectionSettings } from "./components/settings/ConnectionSettings";
import { ScreenGrid } from "./components/designer/ScreenGrid";
import { ScreenEditor } from "./components/designer/ScreenEditor";
import { applyLayout, getScreens } from "./lib/tauriCommands";
import { describeOrbitError, type BulkScreenSlotInput, type ScreenSlot } from "./lib/types";
import { useLayoutDraftStore } from "./stores/layoutDraftStore";
import "./App.css";

function App() {
  const [host, setHost] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "applying" | "error">("idle");
  const [applyError, setApplyError] = useState<string | null>(null);

  const draft = useLayoutDraftStore((s) => s.draft);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);
  const syncFromDevice = useLayoutDraftStore((s) => s.syncFromDevice);
  const patchLive = useLayoutDraftStore((s) => s.patchLive);

  function handleConnected(screens: ScreenSlot[], connectedHost: string) {
    setHost(connectedHost);
    syncFromDevice(screens);
    setSelected(0);
  }

  async function handleRefresh() {
    setRefreshError(null);
    try {
      syncFromDevice(await getScreens());
    } catch (err) {
      setRefreshError(describeOrbitError(err));
    }
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
    } catch (err) {
      setApplyState("error");
      setApplyError(describeOrbitError(err));
    }
  }

  const dirtyCount = host ? [0, 1, 2, 3, 4].filter((i) => isDirty(i) && draft[i]?.control !== "countdown").length : 0;

  return (
    <main className="container">
      <h1>OrbIt Command Center</h1>

      {!host ? (
        <ConnectionSettings onConnected={handleConnected} />
      ) : (
        <>
          <div className="connected-bar">
            <span>
              Connected to <strong>{host}</strong>
            </span>
            <div className="button-row">
              <button type="button" onClick={handleRefresh}>
                Refresh
              </button>
              <button
                type="button"
                disabled={dirtyCount === 0 || applyState === "applying"}
                onClick={handleApplyLayout}
              >
                {applyState === "applying" ? "Applying…" : `Apply Layout${dirtyCount ? ` (${dirtyCount})` : ""}`}
              </button>
            </div>
          </div>
          {refreshError && <p className="connection-settings-error">{refreshError}</p>}
          {applyError && <p className="connection-settings-error">{applyError}</p>}

          <ScreenGrid selected={selected} onSelect={setSelected} />

          {selected !== null && <ScreenEditor screen={selected} />}
        </>
      )}
    </main>
  );
}

export default App;
