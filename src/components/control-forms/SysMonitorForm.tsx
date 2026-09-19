import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { gpuMonitoringAvailable } from "../../lib/tauriCommands";
import type { ScreenSlot } from "../../lib/types";
import type { ControlFormProps } from "./types";

const CENTER_OPTIONS = [
  { value: "", label: "Auto (highest of CPU/GPU/RAM)" },
  { value: "none", label: "None (blank)" },
  { value: "cpu", label: "CPU %" },
  { value: "cpuTemp", label: "CPU Temp" },
  { value: "gpu", label: "GPU %" },
  { value: "gpuTemp", label: "GPU Temp" },
  { value: "ram", label: "RAM %" },
  { value: "ssdTemp", label: "Drive Temp" },
];

// sysMonitor's cpu/gpu/ram/temp values are pushed continuously by the app's
// background loop, not authored here — `center` (which quadrant reading, if
// any, shows in the middle of the screen) is the one field a user actually
// sets. It's edited like any other control's param (goes through the normal
// draft/dirty/Apply Layout flow) rather than a special path, and
// sysmonitor/task.rs (Rust) re-sends whatever `center` it last saw on every
// tick — otherwise the next automatic push would silently clobber it back
// to "auto", since POST replaces a slot's entire params.
export function SysMonitorForm({ screen, initialParams, onChange }: ControlFormProps) {
  const [center, setCenter] = useState<string>(
    typeof initialParams.center === "string" ? initialParams.center : "",
  );
  const [lastTick, setLastTick] = useState<{ params: Record<string, unknown>; at: Date } | null>(
    null,
  );
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // Pass initialParams straight through on mount (rather than resetting
    // to `{}`) so viewing a screen that's already sysMonitor doesn't itself
    // count as an edit — switching another control to sysMonitor still
    // starts from `{}` via ScreenEditor's handleControlChange. (A stale
    // `center: ""` is sanitized out of both live and draft uniformly in
    // layoutDraftStore, not here — stripping it only on this form's mount
    // would desync draft from live and reintroduce the false-dirty bug
    // this same pass-through was written to avoid.)
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

  function handleCenterChange(value: string) {
    setCenter(value);
    const next = { ...initialParams };
    if (value) {
      next.center = value;
    } else {
      delete next.center;
    }
    onChange(next);
  }

  return (
    <div className="control-form">
      <label className="field">
        Center display
        <select value={center} onChange={(e) => handleCenterChange(e.currentTarget.value)}>
          {CENTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        CPU/GPU/RAM/temp values push automatically every few seconds via this
        app's background loop while this screen is assigned sysMonitor and
        the app is running — apply the center choice above like any other
        change (Apply Layout).
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
