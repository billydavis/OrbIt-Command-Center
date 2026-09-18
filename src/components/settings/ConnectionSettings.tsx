import { useState } from "react";
import { connectDevice } from "../../lib/tauriCommands";
import { describeOrbitError, type ScreenSlot } from "../../lib/types";

interface ConnectionSettingsProps {
  onConnected: (screens: ScreenSlot[], host: string) => void;
}

export function ConnectionSettings({ onConnected }: ConnectionSettingsProps) {
  const [host, setHost] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    setStatus("connecting");
    setError(null);
    try {
      const screens = await connectDevice(host.trim());
      setStatus("idle");
      onConnected(screens, host.trim());
    } catch (err) {
      setStatus("error");
      setError(describeOrbitError(err));
    }
  }

  return (
    <form className="connection-settings" onSubmit={handleConnect}>
      <label htmlFor="device-host">Device IP or hostname</label>
      <div className="connection-settings-row">
        <input
          id="device-host"
          placeholder="e.g. 192.168.1.42"
          value={host}
          onChange={(e) => setHost(e.currentTarget.value)}
          disabled={status === "connecting"}
        />
        <button type="submit" disabled={status === "connecting" || !host.trim()}>
          {status === "connecting" ? "Connecting…" : "Connect"}
        </button>
      </div>
      {error && <p className="connection-settings-error">{error}</p>}
    </form>
  );
}
