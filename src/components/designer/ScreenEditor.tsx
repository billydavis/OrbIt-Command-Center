import { useState } from "react";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { ControlPicker } from "./ControlPicker";
import { CONTROL_FORMS } from "../control-forms";
import { CountdownForm } from "../control-forms/CountdownForm";
import { refreshTicker } from "../../lib/tauriCommands";
import { describeOrbitError, isConnectionLost, type ControlType } from "../../lib/types";
import { useDeviceStore } from "../../stores/deviceStore";

interface ScreenEditorProps {
  screen: number;
}

export function ScreenEditor({ screen }: ScreenEditorProps) {
  const draft = useLayoutDraftStore((s) => s.draft[screen]);
  const live = useLayoutDraftStore((s) => s.live[screen]);
  const setDraftSlot = useLayoutDraftStore((s) => s.setDraftSlot);
  const patchLive = useLayoutDraftStore((s) => s.patchLive);
  const markLost = useDeviceStore((s) => s.markLost);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (!draft || !live) return null;

  const control = draft.control as ControlType;

  // countdown doesn't have a "draft params, apply later" form — it acts
  // directly against live device state (see CountdownForm.tsx). Only shown
  // while the draft selection is actually "countdown" — draft starts out
  // matching live (see syncFromDevice/patchLive), so a screen that's
  // already a live countdown opens here too, but picking a different
  // control from the dropdown must be able to leave this branch even
  // though `live.control` stays "countdown" until Applied/Stopped.
  if (control === "countdown") {
    return (
      <div className="screen-editor">
        <h3>
          Screen <span className="mono-num">{screen}</span>
        </h3>
        <ControlPicker
          value={control}
          onChange={(next) => setDraftSlot(screen, { control: next, params: {} })}
        />
        <CountdownForm screen={screen} liveSlot={live} onApplied={patchLive} />
      </div>
    );
  }

  const Form = CONTROL_FORMS[control as Exclude<ControlType, "countdown">];

  async function handleRefreshTicker() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const slot = await refreshTicker(screen);
      patchLive(slot);
    } catch (err) {
      const message = describeOrbitError(err);
      setRefreshError(message);
      if (isConnectionLost(err)) markLost(message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="screen-editor">
      <h3>
        Screen <span className="mono-num">{screen}</span>
      </h3>
      <ControlPicker
        value={control}
        onChange={(next) => setDraftSlot(screen, { control: next, params: {} })}
      />
      {Form && (
        <Form
          // Keyed on screen too, not just control: forms like AnalogClockForm
          // capture initialParams into local state once at mount (matching
          // useForm's own defaultValues) — keying on control alone means
          // switching from one screen to a different screen that happens to
          // share the same control type wouldn't remount the form, leaving
          // it showing the previous screen's values/state instead of the
          // newly-selected screen's actual params.
          key={`${screen}-${control}`}
          screen={screen}
          initialParams={draft.params}
          onChange={(params) => setDraftSlot(screen, { control, params })}
        />
      )}
      {control === "ticker" && live.control === "ticker" && (
        <div className="ticker-refresh">
          <button type="button" disabled={refreshing} onClick={handleRefreshTicker}>
            {refreshing ? "Refreshing…" : "Refresh Now"}
          </button>
          {refreshError && <p className="field-error">{refreshError}</p>}
        </div>
      )}
    </div>
  );
}
