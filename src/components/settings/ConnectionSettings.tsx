import { useCallback, useEffect, useState } from "react";
import { useDeviceStore } from "../../stores/deviceStore";
import { discoverDevices } from "../../lib/tauriCommands";
import { describeOrbitError, type DiscoveredDevice, type ScreenSlot } from "../../lib/types";

interface ConnectionSettingsProps {
  onConnected: (screens: ScreenSlot[]) => void;
}

type ScanState = "scanning" | "done" | "failed";

export function ConnectionSettings({ onConnected }: ConnectionSettingsProps) {
  const storeStatus = useDeviceStore((s) => s.status);
  const storeError = useDeviceStore((s) => s.error);
  const lastHost = useDeviceStore((s) => s.host);
  const lastHostname = useDeviceStore((s) => s.hostname);
  const connect = useDeviceStore((s) => s.connect);

  const [host, setHost] = useState(lastHost ?? "");
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [scanError, setScanError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);

  const scan = useCallback(async () => {
    setScanState("scanning");
    setScanError(null);
    try {
      const found = await discoverDevices();
      // The previously used device goes first, so after a lost connection
      // it's the obvious one-click reconnect even if its IP has changed.
      found.sort((a, b) => Number(b.hostname === lastHostname) - Number(a.hostname === lastHostname));
      setDevices(found);
      setScanState("done");
    } catch (err) {
      setScanError(describeOrbitError(err));
      setScanState("failed");
    }
  }, [lastHostname]);

  useEffect(() => {
    void scan();
    // Scan once when the connect screen opens; later scans are user-driven,
    // so `scan` changing identity (lastHostname) deliberately doesn't rerun this.
  }, []);

  async function connectTo(address: string, hostname?: string) {
    try {
      const screens = await connect(address, hostname);
      onConnected(screens);
    } catch {
      // error already surfaced via the store's `error` field
    }
  }

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    void connectTo(host.trim());
  }

  const connecting = storeStatus === "connecting";
  const scanning = scanState === "scanning";

  return (
    <div className="connection-settings">
      {storeStatus === "lost" && (
        <p className="connection-settings-error">Lost connection to the device — reconnect below.</p>
      )}

      <section className="discovery" aria-labelledby="discovery-heading" aria-busy={scanning}>
        <div className="discovery-header">
          <h2 id="discovery-heading">Orbs on your network</h2>
          <button type="button" onClick={() => void scan()} disabled={scanning || connecting}>
            {scanning ? "Searching…" : "Search again"}
          </button>
        </div>

        {scanning && devices.length === 0 && <p className="discovery-hint">Searching your network…</p>}

        {scanState === "done" && devices.length === 0 && (
          <p className="discovery-hint">
            No orbs found. Check the orb is on and on the same Wi-Fi network, or enter its address below.
          </p>
        )}

        {scanState === "failed" && <p className="connection-settings-error">{scanError}</p>}

        {devices.length > 0 && (
          <ul className="discovery-list">
            {devices.map((d) => (
              <li key={d.hostname + d.address}>
                <button
                  type="button"
                  className="discovery-device"
                  onClick={() => void connectTo(d.address, d.hostname)}
                  disabled={connecting}
                >
                  <span className="discovery-device-name">
                    {d.name}
                    {d.hostname === lastHostname && <span className="discovery-device-badge">Last used</span>}
                  </span>
                  <span className="discovery-device-address">{d.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="connection-settings-manual" onSubmit={handleConnect}>
        <label htmlFor="device-host">Or enter an IP or hostname</label>
        <div className="connection-settings-row">
          <input
            id="device-host"
            placeholder="e.g. 192.168.1.42 or info-orbs-ab.local"
            value={host}
            onChange={(e) => setHost(e.currentTarget.value)}
            disabled={connecting}
          />
          <button type="submit" disabled={connecting || !host.trim()}>
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>

      {storeError && storeStatus !== "lost" && <p className="connection-settings-error">{storeError}</p>}
    </div>
  );
}
