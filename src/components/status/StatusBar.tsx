import { useDeviceStore } from "../../stores/deviceStore";
import {
  formatBuildDate,
  formatKb,
  formatRssi,
  formatUptime,
  SIGNAL_BARS,
  signalQuality,
} from "../../lib/systemFormat";

/**
 * Live device status along the bottom of the window while connected, fed
 * by the heartbeat's GET /api/v1/system every ~5s (src-tauri/src/heartbeat.rs
 * → deviceStore.system). Deliberately not a live region: it updates every
 * few seconds, and announcing each tick would drown out everything else.
 */
export function StatusBar() {
  const host = useDeviceStore((s) => s.host);
  const system = useDeviceStore((s) => s.system);
  const unsupported = useDeviceStore((s) => s.systemUnsupported);

  if (!system) {
    return (
      <footer className="status-bar" aria-label="Device status">
        <span className="status-bar-item">
          <span className="mono-num">{host}</span>
        </span>
        <span className="status-bar-item status-bar-muted">
          {unsupported ? "This firmware doesn’t report device status." : "Reading device status…"}
        </span>
      </footer>
    );
  }

  const quality = signalQuality(system.rssi);
  const bars = SIGNAL_BARS[quality];

  return (
    <footer className="status-bar" aria-label="Device status">
      <span className="status-bar-item" title={system.mac ? `MAC ${system.mac}` : undefined}>
        {system.hostname}
        <span className="mono-num status-bar-muted">{system.ip}</span>
      </span>

      <span className="status-bar-item" title={`${quality[0].toUpperCase()}${quality.slice(1)} signal`}>
        <span className="signal-bars" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={n <= bars ? "signal-bar signal-bar-on" : "signal-bar"} />
          ))}
        </span>
        <span className="status-bar-ssid">{system.ssid}</span>
        <span className="mono-num status-bar-muted">{formatRssi(system.rssi)}</span>
        <span className="visually-hidden">, {quality} signal</span>
      </span>

      <span className="status-bar-item status-bar-optional">
        Up <span className="mono-num">{formatUptime(system.uptimeSeconds)}</span>
      </span>

      <span
        className="status-bar-item status-bar-optional"
        title={`Lowest since boot: ${formatKb(system.minFreeHeap)}`}
      >
        Heap <span className="mono-num">{formatKb(system.freeHeap)}</span> free
      </span>

      <span className="status-bar-item status-bar-optional" title={`Firmware built ${system.firmwareBuilt}`}>
        Built {formatBuildDate(system.firmwareBuilt)}
      </span>
    </footer>
  );
}
