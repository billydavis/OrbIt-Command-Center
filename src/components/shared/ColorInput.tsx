import { useState } from "react";

// Free-text color name input (e.g. "cyan", "darkgrey") — the device parses
// these via Utils::stringToColor(), which isn't documented in orbit-api.md
// as an exhaustive list, so this offers common names as a pick-list rather
// than a locked-down enum, with a "Custom…" escape hatch for anything else.
const KNOWN_COLOR_NAMES = [
  "black",
  "white",
  "red",
  "green",
  "blue",
  "cyan",
  "magenta",
  "yellow",
  "orange",
  "purple",
  "grey",
  "darkgrey",
];

const CUSTOM = "__custom__";

interface ColorInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * True when `value` is blank because the device's current value is a raw
   * RGB565 int this app can't resolve to a name (see colorRoundTrip.ts) —
   * distinct from a field that was never configured. Renders a visible
   * "can't read this back" state instead of a plain, indistinguishable
   * default so the picker never implies it knows the current color when it
   * doesn't.
   */
  unknownDeviceValue?: boolean;
}

export function ColorInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  unknownDeviceValue,
}: ColorInputProps) {
  // A native <input list="..."> datalist filters its suggestions to those
  // matching the current text, so once a field has a real value (e.g.
  // "black") the dropdown only ever shows that one match — it looks broken,
  // not like a pick-list. A plain <select> always shows every option
  // regardless of the current value, so that's what this renders; "Custom…"
  // reveals a free-text input for anything outside the known list.
  const isKnown = value === "" || KNOWN_COLOR_NAMES.includes(value);
  const [customMode, setCustomMode] = useState(!isKnown);

  function handleSelect(next: string) {
    if (next === CUSTOM) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange(next);
  }

  // unknownDeviceValue is captured once at mount (same as this field's
  // starting value) — it describes why the field STARTED blank, not a
  // permanent state. Once the user has actually picked a value (or is in
  // Custom mode entering one), the ambiguity it's warning about no longer
  // applies, so it's gated on the field still being blank.
  const showUnknownWarning = unknownDeviceValue && value === "" && !customMode;

  return (
    <label className={`field${showUnknownWarning ? " field-unknown-device-value" : ""}`} htmlFor={id}>
      {label}
      <select id={id} value={customMode ? CUSTOM : value} onChange={(e) => handleSelect(e.currentTarget.value)}>
        {value === "" && (
          <option value="">{unknownDeviceValue ? "(current color unknown)" : "(device default)"}</option>
        )}
        {KNOWN_COLOR_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={CUSTOM}>Custom…</option>
      </select>
      {showUnknownWarning && (
        <p className="field-hint field-unknown-device-hint">
          Set on the device to a color this app can't read back. Pick one to change it, or leave
          as-is to apply this app's default instead.
        </p>
      )}
      {customMode && (
        <input
          value={isKnown ? "" : value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      )}
    </label>
  );
}
