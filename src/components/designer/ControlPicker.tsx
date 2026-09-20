import { CONTROL_TYPES, type ControlType } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";

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
            {CONTROL_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
