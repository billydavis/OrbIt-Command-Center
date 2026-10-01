import { hexToRgb565, PRESET_COLORS, rgb565ToHex } from "../../lib/rgb565";

interface ColorInputProps {
  id: string;
  label: string;
  /** RGB565, as the device stores and reports it. */
  value: number;
  onChange: (value: number) => void;
}

// The swatch and hex always show the RGB565 color the device will actually
// draw, not the 24-bit one the picker handed over — so a pick snaps to the
// nearest color these screens can show rather than promising a shade they
// can't. The presets are the firmware's own named colors, kept one click
// away since a full picker is a slow way to ask for plain white.
export function ColorInput({ id, label, value, onChange }: ColorInputProps) {
  const hex = rgb565ToHex(value);

  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-field-row">
        <input
          id={id}
          type="color"
          value={hex}
          onChange={(e) => onChange(hexToRgb565(e.currentTarget.value))}
        />
        <span className="mono-num color-field-hex">{hex.toUpperCase()}</span>
      </div>
      <div className="color-presets" role="group" aria-label={`${label} presets`}>
        {PRESET_COLORS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="color-preset"
            style={{ backgroundColor: rgb565ToHex(preset.value) }}
            title={preset.name}
            aria-label={preset.name}
            aria-pressed={preset.value === value}
            onClick={() => onChange(preset.value)}
          />
        ))}
      </div>
    </div>
  );
}
