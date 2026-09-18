import { CONTROL_TYPES, type ControlType } from "../../lib/types";

const LABELS: Record<ControlType, string> = {
  blank: "Blank",
  time: "Time",
  analogClock: "Analog Clock",
  gauge: "Gauge",
  sysMonitor: "System Monitor",
  weather: "Weather",
  ticker: "Ticker",
  custom: "Custom",
  asteroids: "Asteroids (screensaver)",
  countdown: "Countdown",
};

interface ControlPickerProps {
  value: ControlType;
  onChange: (control: ControlType) => void;
}

export function ControlPicker({ value, onChange }: ControlPickerProps) {
  return (
    <label className="field" htmlFor="control-picker">
      Control
      <select
        id="control-picker"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as ControlType)}
      >
        {CONTROL_TYPES.map((c) => (
          <option key={c} value={c}>
            {LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
