import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "../../stores/themeStore";
import { ACCENT_SWATCHES, type AccentKey, type ThemeMode } from "../../lib/theme";
import { ControlIcon } from "../../lib/controlIcons";

const MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

const ACCENTS: AccentKey[] = ["cyan", "teal", "violet", "amber"];

// Always-available appearance control — rendered outside the connected/
// disconnected split in App.tsx, since theme shouldn't depend on having a
// device connected. Explicit mode overrides the OS preference; accent only
// changes the selection color (border, focus ring, primary button), never
// the fixed connected/dirty/error signal colors.
export function ThemeControl() {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="theme-control" ref={containerRef}>
      <button
        type="button"
        className="theme-control-trigger"
        aria-label="Appearance settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Appearance
      </button>
      {open && (
        <div className="theme-control-panel" role="dialog" aria-label="Appearance">
          <div className="theme-control-heading">
            <h2>Appearance</h2>
            <p className="field-hint">
              Applies instantly. Status colors (connected, unapplied, error) never change — only the
              accent does.
            </p>
          </div>
          <div className="theme-control-section">
            <span className="theme-control-section-label">Mode</span>
            <div className="theme-control-group" role="radiogroup" aria-label="Mode">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  className={`theme-mode-button${mode === m.key ? " theme-mode-button-active" : ""}`}
                  onClick={() => setMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="theme-control-section">
            <span className="theme-control-section-label">Accent</span>
            <div className="theme-accent-group" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={accent === key}
                  aria-label={`${key} accent`}
                  className={`theme-accent-swatch${accent === key ? " theme-accent-swatch-active" : ""}`}
                  style={{ backgroundColor: ACCENT_SWATCHES[key] }}
                  onClick={() => setAccent(key)}
                />
              ))}
            </div>
          </div>
          <div className="theme-preview">
            <div className="theme-preview-tile">
              <ControlIcon control="weather" />
            </div>
            <div className="theme-preview-actions">
              <span className="theme-preview-status">
                <span className="connected-status-dot" aria-hidden="true" />
                Status colors unchanged
              </span>
              <button type="button" className="theme-preview-button">
                Apply Layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
