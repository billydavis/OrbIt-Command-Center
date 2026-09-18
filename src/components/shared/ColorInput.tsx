// Free-text color name input (e.g. "cyan", "darkgrey") — the device parses
// these via Utils::stringToColor(), which isn't documented in orbit-api.md
// as an exhaustive list, so this offers common names as suggestions rather
// than a locked-down enum.
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

interface ColorInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ColorInput({ id, label, value, onChange, placeholder }: ColorInputProps) {
  return (
    <label className="field" htmlFor={id}>
      {label}
      <input
        id={id}
        list={`${id}-colors`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      <datalist id={`${id}-colors`}>
        {KNOWN_COLOR_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  );
}
