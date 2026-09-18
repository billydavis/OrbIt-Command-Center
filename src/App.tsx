import { useState } from "react";
import { ConnectionSettings } from "./components/settings/ConnectionSettings";
import { ScreenGrid } from "./components/designer/ScreenGrid";
import { getScreens } from "./lib/tauriCommands";
import { describeOrbitError, type ScreenSlot } from "./lib/types";
import "./App.css";

function App() {
  const [host, setHost] = useState<string | null>(null);
  const [screens, setScreens] = useState<ScreenSlot[]>([]);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  function handleConnected(newScreens: ScreenSlot[], connectedHost: string) {
    setHost(connectedHost);
    setScreens(newScreens);
  }

  async function handleRefresh() {
    setRefreshError(null);
    try {
      setScreens(await getScreens());
    } catch (err) {
      setRefreshError(describeOrbitError(err));
    }
  }

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
            <button onClick={handleRefresh}>Refresh</button>
          </div>
          {refreshError && <p className="connection-settings-error">{refreshError}</p>}
          <ScreenGrid screens={screens} />
        </>
      )}
    </main>
  );
}

export default App;
