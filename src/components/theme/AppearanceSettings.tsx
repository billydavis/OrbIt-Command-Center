import { useThemeStore } from "../../stores/themeStore";
import { useWindowStore } from "../../stores/windowStore";
import { ACCENT_SWATCHES, type AccentKey, type ThemeMode } from "../../lib/theme";
import { ControlIcon } from "../../lib/controlIcons";
import { IS_WINDOWS } from "../../lib/platform";

const MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "System" },
];

const ACCENTS: AccentKey[] = ["cyan", "teal", "violet", "amber"];

// The appearance settings themselves, shown inside the settings menu
// (SettingsMenu.tsx), which is there whether or not a device is connected.
// Explicit mode overrides the OS preference; accent only changes the
// selection color (border, focus ring), never the fixed connected/dirty/
// error signal colors.
export function AppearanceSettings() {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);
  const showInTaskbar = useWindowStore((s) => s.showInTaskbar);
  const setShowInTaskbar = useWindowStore((s) => s.setShowInTaskbar);

  return (
    <>
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
      {/* The taskbar setting only does anything on Windows (see
          tray::set_show_in_taskbar), so it's only offered there. */}
      {IS_WINDOWS && (
        <div className="theme-control-section">
          <span className="theme-control-section-label">Window</span>
          <label className="field-checkbox">
            <input
              type="checkbox"
              checked={showInTaskbar}
              onChange={(e) => setShowInTaskbar(e.currentTarget.checked)}
            />
            Show in taskbar
          </label>
          <p className="field-hint">
            {showInTaskbar
              ? "The app has a taskbar button while its window is open."
              : "The app lives in the tray. Click its tray icon to open the window."}
          </p>
        </div>
      )}
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
    </>
  );
}
