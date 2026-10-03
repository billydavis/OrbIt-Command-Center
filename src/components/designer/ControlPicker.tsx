import { CONTROL_TYPES, type ControlType } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";
import { ScreenPreview } from "./ScreenPreview";

interface ControlPickerProps {
  value: ControlType;
  onChange: (control: ControlType) => void;
}

// What each control's little picture in the picker is drawn with — enough
// params to look like itself, not anything a screen is actually set to.
const SAMPLE_PARAMS: Record<ControlType, Record<string, unknown>> = {
  blank: {},
  time: { showDate: true, showDay: true },
  analogClock: {},
  gauge: { value: 62 },
  sysMonitor: {},
  weather: { element: "icon" },
  ticker: { symbol: "BTC/USD" },
  custom: {},
  screensaver: { effect: "asteroids" },
  countdown: { durationSeconds: 900, remainingSeconds: 684 },
};

// Every control at once, each with a picture of what it puts on a screen,
// rather than a dropdown that hides all but the current one.
export function ControlPicker({ value, onChange }: ControlPickerProps) {
  return (
    <div className="control-picker" role="group" aria-label="Control">
      {CONTROL_TYPES.map((c) => (
        <button
          key={c}
          type="button"
          className={`control-picker-option${c === value ? " control-picker-option-selected" : ""}`}
          aria-pressed={c === value}
          onClick={() => {
            if (c !== value) onChange(c);
          }}
        >
          <span className="control-picker-preview">
            <ScreenPreview control={c} params={SAMPLE_PARAMS[c]} still />
          </span>
          <span className="control-picker-label">{CONTROL_LABELS[c]}</span>
        </button>
      ))}
    </div>
  );
}
