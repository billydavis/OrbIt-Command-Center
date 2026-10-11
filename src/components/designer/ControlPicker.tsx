import { CONTROL_TYPES, type ControlType } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";
import { builtEffects, controlBuilt, listOf } from "../../lib/capabilities";
import { useDeviceStore } from "../../stores/deviceStore";
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
// rather than a dropdown that hides all but the current one. Only the
// controls the orb's firmware was built with are offered; the ones it left
// out are named underneath, so a missing one isn't a mystery.
export function ControlPicker({ value, onChange }: ControlPickerProps) {
  const capabilities = useDeviceStore((s) => s.capabilities);
  // The one the screen is set to stays even if it isn't built (a draft made
  // before the orb was flashed with less), so what's selected is in view.
  const offered = CONTROL_TYPES.filter((c) => c === value || controlBuilt(capabilities, c));
  const leftOut = CONTROL_TYPES.filter((c) => !controlBuilt(capabilities, c));
  const sampleParams = (c: ControlType) =>
    c === "screensaver" ? { effect: builtEffects(capabilities)[0] ?? "asteroids" } : SAMPLE_PARAMS[c];

  return (
    <>
      <div className="control-picker" role="group" aria-label="Control">
        {offered.map((c) => (
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
              <ScreenPreview control={c} params={sampleParams(c)} still />
            </span>
            <span className="control-picker-label">{CONTROL_LABELS[c]}</span>
          </button>
        ))}
      </div>
      {leftOut.length > 0 && (
        <p className="field-hint">
          This orb's firmware was built without {listOf(leftOut.map((c) => CONTROL_LABELS[c]))}.
        </p>
      )}
    </>
  );
}
