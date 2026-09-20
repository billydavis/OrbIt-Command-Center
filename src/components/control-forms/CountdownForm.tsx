import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { countdownAction as callCountdownAction } from "../../lib/tauriCommands";
import { countdownSetSchema } from "../../lib/controlSchemas";
import { describeOrbitError, isConnectionLost, type ScreenSlot } from "../../lib/types";
import { useDeviceStore } from "../../stores/deviceStore";
import { ColorInput } from "../shared/ColorInput";

// See TimeForm.tsx for why this uses the schema's input type.
type CountdownSetFormValues = z.input<typeof countdownSetSchema>;

interface CountdownFormProps {
  screen: number;
  /** The screen's current *live* (device-reported) slot, not the draft. */
  liveSlot: ScreenSlot;
  onApplied: (slot: ScreenSlot) => void;
}

// countdown is action/state-driven (set/pause/resume/restart/stop), not a
// full-state POST like every other control, so it's deliberately excluded
// from the uniform "Apply Layout" bulk flow — every button here calls
// countdown_action directly and immediately, against live device state.
export function CountdownForm({ screen, liveSlot, onApplied }: CountdownFormProps) {
  const markLost = useDeviceStore((s) => s.markLost);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLiveCountdown = liveSlot.control === "countdown";
  const state = isLiveCountdown ? (liveSlot.params.state as string | undefined) : undefined;
  const remaining = isLiveCountdown
    ? (liveSlot.params.remainingSeconds as number | undefined)
    : undefined;

  async function runAction(action: Parameters<typeof callCountdownAction>[1]) {
    setPending(true);
    setError(null);
    try {
      const slot = await callCountdownAction(screen, action);
      onApplied(slot);
    } catch (err) {
      const message = describeOrbitError(err);
      setError(message);
      if (isConnectionLost(err)) markLost(message);
    } finally {
      setPending(false);
    }
  }

  if (isLiveCountdown) {
    return (
      <div className="control-form countdown-panel">
        <p>
          <strong>{(liveSlot.params.label as string) || "Countdown"}</strong> — {state}
          {typeof remaining === "number" && (
            <>
              {" ("}
              <span className="mono-num">{remaining}</span>
              {"s left)"}
            </>
          )}
        </p>
        <div className="button-row">
          {state === "running" && (
            <button disabled={pending} onClick={() => runAction({ action: "pause" })}>
              Pause
            </button>
          )}
          {state === "paused" && (
            <button disabled={pending} onClick={() => runAction({ action: "resume" })}>
              Resume
            </button>
          )}
          <button disabled={pending} onClick={() => runAction({ action: "restart" })}>
            Restart
          </button>
          <button disabled={pending} onClick={() => runAction({ action: "stop" })}>
            Stop (restore previous screen)
          </button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }

  return <CountdownSetForm screen={screen} pending={pending} error={error} onStart={runAction} />;
}

function CountdownSetForm({
  pending,
  error,
  onStart,
}: {
  screen: number;
  pending: boolean;
  error: string | null;
  onStart: (action: Parameters<typeof callCountdownAction>[1]) => void;
}) {
  const { register, handleSubmit, watch } = useForm<CountdownSetFormValues>({
    resolver: zodResolver(countdownSetSchema),
    defaultValues: { durationSeconds: 300, label: "", color: "cyan" },
  });

  return (
    <form
      className="control-form countdown-panel"
      onSubmit={handleSubmit((values) =>
        onStart({
          action: "set",
          durationSeconds: Number(values.durationSeconds),
          label: values.label || undefined,
          color: values.color || undefined,
        }),
      )}
    >
      <label className="field">
        Duration (seconds)
        <input type="number" {...register("durationSeconds")} />
      </label>
      <label className="field">
        Label
        <input {...register("label")} placeholder="Focus" />
      </label>
      <ColorInput
        id="countdown-color"
        label="Color"
        value={watch("color") ?? ""}
        onChange={(v) => register("color").onChange({ target: { name: "color", value: v } })}
        placeholder="cyan"
      />
      <button type="submit" disabled={pending}>
        Start Countdown
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
