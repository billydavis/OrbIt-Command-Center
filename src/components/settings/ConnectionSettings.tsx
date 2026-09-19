import { useState } from "react";
import { useDeviceStore } from "../../stores/deviceStore";
import type { ScreenSlot } from "../../lib/types";

interface ConnectionSettingsProps {
  onConnected: (screens: ScreenSlot[]) => void;
}

export function ConnectionSettings({ onConnected }: ConnectionSettingsProps) {
  const storeStatus = useDeviceStore((s) => s.status);
  const storeError = useDeviceStore((s) => s.error);
  const lastHost = useDeviceStore((s) => s.host);
  const connect = useDeviceStore((s) => s.connect);

  const [host, setHost] = useState(lastHost ?? "");

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    try {
      const screens = await connect(host.trim());
      onConnected(screens);
    } catch {
      // error already surfaced via the store's `error` field
    }
  }

  const connecting = storeStatus === "connecting";

  return (
    <form className="connection-settings" onSubmit={handleConnect}>
      {storeStatus === "lost" && (
        <p className="connection-settings-error">Lost connection to the device — reconnect below.</p>
      )}
      <label htmlFor="device-host">Device IP or hostname</label>
      <div className="connection-settings-row">
        <input
          id="device-host"
          placeholder="e.g. 192.168.1.42"
          value={host}
          onChange={(e) => setHost(e.currentTarget.value)}
          disabled={connecting}
        />
        <button type="submit" disabled={connecting || !host.trim()}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
      </div>
      {storeError && storeStatus !== "lost" && <p className="connection-settings-error">{storeError}</p>}
    </form>
  );
}
