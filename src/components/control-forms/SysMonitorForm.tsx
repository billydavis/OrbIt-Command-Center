import { useEffect } from "react";
import type { ControlFormProps } from "./types";

// sysMonitor's values (cpu/gpu/ram/temps) are pushed continuously by the
// app's background loop, not authored here — assigning the control is the
// whole job of this form. Passes `initialParams` straight through on mount
// (rather than resetting to `{}`) so viewing a screen that's *already*
// sysMonitor — with real device-reported values — doesn't itself count as
// an edit; switching another control to sysMonitor still starts from `{}`
// via ScreenEditor's handleControlChange.
export function SysMonitorForm({ initialParams, onChange }: ControlFormProps) {
  useEffect(() => {
    onChange(initialParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <p className="field-hint">
      Driven by this app's background loop (CPU/GPU/RAM/temps) once the tray
      service is running — nothing to configure here. Values push
      automatically while this screen is assigned sysMonitor.
    </p>
  );
}
