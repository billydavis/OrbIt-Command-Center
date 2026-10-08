import { useState } from "react";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { ControlPicker } from "./ControlPicker";
import { CONTROL_FORMS } from "../control-forms";
import { CountdownForm } from "../control-forms/CountdownForm";
import { refreshTicker } from "../../lib/tauriCommands";
import { CONTROL_LABELS } from "../../lib/controlLabels";
import { describeOrbitError, type ControlType } from "../../lib/types";

interface ScreenEditorProps {
  screen: number;
}

// Two columns under the screen row: what the selected screen shows (every
// control, pictured), and that control's settings beside it.
export function ScreenEditor({ screen }: ScreenEditorProps) {
  const draft = useLayoutDraftStore((s) => s.draft[screen]);
  const live = useLayoutDraftStore((s) => s.live[screen]);
  const revision = useLayoutDraftStore((s) => s.draftRevision[screen] ?? 0);
  const setDraftSlot = useLayoutDraftStore((s) => s.setDraftSlot);
  const resetDraftSlot = useLayoutDraftStore((s) => s.resetDraftSlot);
  const isDirty = useLayoutDraftStore((s) => s.isDirty(screen));
  const patchLive = useLayoutDraftStore((s) => s.patchLive);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (!draft || !live) return null;

  const control = draft.control as ControlType;
  const Form = control === "countdown" ? null : CONTROL_FORMS[control];

  async function handleRefreshTicker() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const slot = await refreshTicker(screen);
      patchLive(slot);
    } catch (err) {
      const message = describeOrbitError(err);
      setRefreshError(message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="screen-editor">
      <section className="screen-editor-column">
        <h3>
          Screen <span className="mono-num">{screen}</span> shows
        </h3>
        <ControlPicker
          value={control}
          onChange={(next) => setDraftSlot(screen, { control: next, params: {} })}
        />
      </section>

      <section className="screen-editor-column">
        <div className="screen-editor-header">
          <h3>{CONTROL_LABELS[control] ?? draft.control} settings</h3>
          {isDirty && control !== "countdown" && (
            <button type="button" className="screen-editor-discard" onClick={() => resetDraftSlot(screen)}>
              Discard changes
            </button>
          )}
        </div>

        {/* countdown doesn't have a "draft params, apply later" form — it
            acts directly against live device state (see CountdownForm.tsx).
            Only shown while the draft selection is actually "countdown" —
            draft starts out matching live (see syncFromDevice/patchLive),
            so a screen that's already a live countdown opens here too, but
            picking a different control must be able to leave this branch
            even though `live.control` stays "countdown" until
            Applied/Stopped. */}
        {control === "countdown" && (
          <CountdownForm screen={screen} liveSlot={live} onApplied={patchLive} />
        )}

        {Form && (
          <Form
            // Keyed on screen too, not just control: forms like AnalogClockForm
            // capture initialParams into local state once at mount (matching
            // useForm's own defaultValues) — keying on control alone means
            // switching from one screen to a different screen that happens to
            // share the same control type wouldn't remount the form, leaving
            // it showing the previous screen's values/state instead of the
            // newly-selected screen's actual params. updatedAt remounts it
            // after an apply too, so a value the device adjusted on the way in
            // (a clamped ticker poll interval or screensaver cycleSeconds)
            // shows as the device has it rather than as it was typed. And
            // the draft revision remounts it when the draft was replaced
            // from outside the form (a feed picked in the rail, a discard).
            key={`${screen}-${control}-${live.updatedAt}-${revision}`}
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
      </section>
    </div>
  );
}
