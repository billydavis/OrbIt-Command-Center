import { useState } from "react";
import { pressButton } from "../../lib/tauriCommands";
import {
  describeOrbitError,
  type OrbButton,
  type OrbitError,
  type PressLength,
} from "../../lib/types";
import { useDeviceStore } from "../../stores/deviceStore";

const PRESS_LENGTHS: { id: PressLength; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

// What OK does on each of the firmware's widgets, by the name the orb
// reports (each widget's getName()). Left and Right are the same on all of
// them: a short press goes to the previous or next widget.
const OK_DOES: Record<string, string> = {
  OrbIt: "OK does nothing on OrbIt.",
  Clock: "OK changes the clock face. A medium press switches 12/24-hour.",
  Weather: "OK switches between highs and lows.",
  Stock: "OK refreshes the prices.",
  Parqet: "OK shows the next holdings. A medium press changes the timeframe, a long one resets it.",
};

// The rail's Orb section: the device's own three buttons, pressed from
// here. Unlike everything else in the workbench this isn't about the OrbIt
// screens: Left and Right take the orb to its other widgets, where the five
// screens pictured in the app aren't what it's showing.
export function OrbButtons() {
  const widget = useDeviceStore((s) => s.widget);
  const setWidget = useDeviceStore((s) => s.setWidget);
  const [press, setPress] = useState<PressLength>("short");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePress(button: OrbButton) {
    setBusy(true);
    setError(null);
    // Medium and Long are for the next press only: the choice goes back to
    // Short as soon as a button is pressed, whether or not the press lands.
    setPress("short");
    try {
      const pressed = await pressButton(button, press);
      setWidget(pressed.widget);
    } catch (err) {
      const e = err as OrbitError;
      if (e?.kind === "DeviceRejected" && e.message.status === 404) {
        setError("This orb's firmware doesn't take button presses from the app.");
      } else {
        setError(describeOrbitError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="orb-buttons">
      {widget && (
        <p className="orb-showing">
          Showing <strong>{widget}</strong>
        </p>
      )}

      <div className="orb-buttons-row" role="group" aria-label="Orb buttons">
        <button
          type="button"
          aria-label="Left button"
          title={press === "short" ? "Left: previous widget" : "Left"}
          disabled={busy}
          onClick={() => void handlePress("left")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button type="button" aria-label="OK button" disabled={busy} onClick={() => void handlePress("ok")}>
          OK
        </button>
        <button
          type="button"
          aria-label="Right button"
          title={press === "short" ? "Right: next widget" : "Right"}
          disabled={busy}
          onClick={() => void handlePress("right")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="orb-press" role="group" aria-label="Press length">
        {PRESS_LENGTHS.map((p) => (
          <button key={p.id} type="button" aria-pressed={press === p.id} onClick={() => setPress(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-hint">
          {widget === null
            ? "Left and Right change widget. The orb says which one it's showing after a press."
            : OK_DOES[widget]}
        </p>
      )}
    </div>
  );
}
