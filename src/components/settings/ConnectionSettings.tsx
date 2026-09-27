import { useCallback, useEffect, useState } from "react";
import { useDeviceStore } from "../../stores/deviceStore";
import { discoverDevices } from "../../lib/tauriCommands";
import { describeOrbitError, type DiscoveredDevice, type ScreenSlot } from "../../lib/types";

interface ConnectionSettingsProps {
  onConnected: (screens: ScreenSlot[]) => void;
}

type ScanState = "scanning" | "done" | "failed";

/** Pause between background re-scans while waiting for the last-used orb. */
const RESCAN_INTERVAL_MS = 10_000;

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
  /** Name of the device an automatic reconnect is in progress for. */
  const [reconnectingTo, setReconnectingTo] = useState<string | null>(null);

  const connectTo = useCallback(
    async (address: string, hostname?: string) => {
      try {
        const screens = await connect(address, hostname);
        onConnected(screens);
      } catch {
        // error already surfaced via the store's `error` field
      }
    },
    [connect, onConnected],
  );

  /**
   * Scans for orbs, then reconnects to the last-used one if it's there.
   * `tryDirect` also tries the saved address when the scan misses it — for
   * a device added by typing its IP, or a network where mDNS is blocked.
   * Only done for the scan that opens the screen: a failing direct attempt
   * locks the form for up to the connect timeout, which would get in the way
   * if it repeated on every background re-scan.
   */
  const scan = useCallback(
    async ({ tryDirect }: { tryDirect: boolean }) => {
      setScanState("scanning");
      setScanError(null);
      let found: DiscoveredDevice[] = [];
      try {
        found = await discoverDevices();
        // The previously used device goes first, so it stays the obvious pick
        // if the automatic reconnect below fails.
        found.sort((a, b) => Number(b.hostname === lastHostname) - Number(a.hostname === lastHostname));
        setDevices(found);
        setScanState("done");
      } catch (err) {
        setScanError(describeOrbitError(err));
        setScanState("failed");
      }

      // hostname/host survive a lost connection, a failed connect and an app
      // restart — only an explicit disconnect clears them — so finding the
      // device again means "put me back where I was", even if DHCP has moved
      // it to a new IP. Read the status fresh: the user may have connected
      // by hand mid-scan.
      const { status } = useDeviceStore.getState();
      if (status === "connecting" || status === "connected") return;
      const lastUsed = lastHostname ? found.find((d) => d.hostname === lastHostname) : undefined;
      if (lastUsed) {
        setReconnectingTo(lastUsed.name);
        await connectTo(lastUsed.address, lastUsed.hostname);
        setReconnectingTo(null);
      } else if (tryDirect && lastHost) {
        setReconnectingTo(lastHostname ?? lastHost);
        await connectTo(lastHost, lastHostname ?? undefined);
        setReconnectingTo(null);
      }
    },
    [lastHost, lastHostname, connectTo],
  );

  useEffect(() => {
    void scan({ tryDirect: true });
    // Only the scan that opens the screen; re-scans come from the effect
    // below or the "Search again" button.
  }, []);

  // While a last-used device is known but not connected (it rebooted, went
  // off WiFi, or isn't on yet at launch), keep looking for it so it
  // reconnects on its own as soon as it's back.
  const waitingForLastUsed =
    !!lastHostname && storeStatus !== "connecting" && storeStatus !== "connected" && !reconnectingTo;
  useEffect(() => {
    if (!waitingForLastUsed || scanState === "scanning") return;
    const timer = setTimeout(() => void scan({ tryDirect: false }), RESCAN_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [waitingForLastUsed, scanState, scan]);

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
        <p className="connection-settings-error">Lost connection to the device.</p>
      )}

      <section className="discovery" aria-labelledby="discovery-heading" aria-busy={scanning}>
        <div className="discovery-header">
          <h2 id="discovery-heading">Orbs on your network</h2>
          <button type="button" onClick={() => void scan({ tryDirect: false })} disabled={scanning || connecting}>
            {scanning ? "Searching…" : "Search again"}
          </button>
        </div>

        {scanning && devices.length === 0 && !waitingForLastUsed && <p className="discovery-hint">Searching your network…</p>}

        {reconnectingTo && (
          <p className="discovery-hint" role="status">
            Reconnecting to {reconnectingTo}…
          </p>
        )}

        {waitingForLastUsed && !devices.some((d) => d.hostname === lastHostname) && (
          <p className="discovery-hint">Waiting for {lastHostname} — it will reconnect as soon as it’s back.</p>
        )}

        {scanState === "done" && devices.length === 0 && !waitingForLastUsed && (
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
