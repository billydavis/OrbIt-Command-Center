import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { gpuMonitoringAvailable } from "../../lib/tauriCommands";
import type { ScreenSlot } from "../../lib/types";
import type { ControlFormProps } from "./types";

// sysMonitor's values (cpu/gpu/ram/temps) are pushed continuously by the
// app's background loop, not authored here — assigning the control is the
// whole job of this form. Passes `initialParams` straight through on mount
// (rather than resetting to `{}`) so viewing a screen that's *already*
// sysMonitor — with real device-reported values — doesn't itself count as
// an edit; switching another control to sysMonitor still starts from `{}`
// via ScreenEditor's handleControlChange.
export function SysMonitorForm({ screen, initialParams, onChange }: ControlFormProps) {
  const [lastTick, setLastTick] = useState<{ params: Record<string, unknown>; at: Date } | null>(
    null,
  );
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    onChange(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    gpuMonitoringAvailable()
      .then(setGpuAvailable)
      .catch(() => setGpuAvailable(false));
  }, []);

  // sysmonitor/task.rs emits one event per screen it just pushed to — only
  // react to ticks for the screen this form instance is showing.
  useEffect(() => {
    const unlisten = listen<ScreenSlot>("sysmonitor://tick", (event) => {
      if (event.payload.screen === screen) {
        setLastTick({ params: event.payload.params, at: new Date() });
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [screen]);

  return (
    <div className="control-form">
      <p className="field-hint">
        Driven by this app's background loop (CPU/GPU/RAM/temps) — nothing to
        configure here. Values push automatically every few seconds while
        this screen is assigned sysMonitor and the app is running.
      </p>
      {gpuAvailable === false && (
        <p className="field-hint">
          GPU metrics unavailable on this system (no NVIDIA driver / nvidia-smi found) — CPU and RAM
          will still push normally.
        </p>
      )}
      {lastTick ? (
        <p className="field-hint">
          Last pushed {lastTick.at.toLocaleTimeString()}: CPU {String(lastTick.params.cpu ?? "—")}%,
          RAM {String(lastTick.params.ram ?? "—")}%
          {"gpu" in lastTick.params ? `, GPU ${lastTick.params.gpu}%` : ""}
        </p>
      ) : (
        <p className="field-hint">No values pushed yet — waiting for the next tick (~5s).</p>
      )}
    </div>
  );
}
