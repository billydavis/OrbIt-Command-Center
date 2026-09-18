import { useEffect } from "react";
import type { ControlFormProps } from "./types";

// sysMonitor's values (cpu/gpu/ram/temps) are pushed continuously by the
// app's background loop, not authored here — assigning the control is the
// whole job of this form. Emits empty params once on mount so "assign
// sysMonitor to this screen" is a valid draft entry on its own.
export function SysMonitorForm({ onChange }: ControlFormProps) {
  useEffect(() => {
    onChange({});
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
