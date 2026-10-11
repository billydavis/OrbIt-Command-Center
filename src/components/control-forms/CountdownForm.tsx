import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { countdownAction as callCountdownAction } from "../../lib/tauriCommands";
import { countdownSetSchema } from "../../lib/controlSchemas";
import { describeOrbitError, type ScreenSlot } from "../../lib/types";
import { ColorInput } from "../shared/ColorInput";
import { COLORS, COLORS_UNSUPPORTED_MESSAGE, colorsNotApplied } from "../../lib/rgb565";
import { useToastStore } from "../../stores/toastStore";

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
  const [pending, setPending] = useState(false);
  const showToast = useToastStore((s) => s.show);
  const dismissToast = useToastStore((s) => s.dismiss);

  const isLiveCountdown = liveSlot.control === "countdown";
  const state = isLiveCountdown ? (liveSlot.params.state as string | undefined) : undefined;
  const remaining = isLiveCountdown
    ? (liveSlot.params.remainingSeconds as number | undefined)
    : undefined;

  async function runAction(action: Parameters<typeof callCountdownAction>[1]) {
    setPending(true);
    dismissToast(`countdown-${screen}`);
    try {
      const slot = await callCountdownAction(screen, action);
      onApplied(slot);
      if (colorsNotApplied({ control: "countdown", params: action }, slot)) {
        showToast({
          key: `countdown-${screen}`,
          tone: "alert",
          title: "Custom colors weren't applied",
          detail: COLORS_UNSUPPORTED_MESSAGE,
        });
      }
    } catch (err) {
      showToast({
        key: `countdown-${screen}`,
        tone: "alert",
        title: "Couldn't change the countdown",
        detail: describeOrbitError(err),
      });
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
      </div>
    );
  }

  return <CountdownSetForm screen={screen} pending={pending} onStart={runAction} />;
}

function CountdownSetForm({
  pending,
  onStart,
}: {
  screen: number;
  pending: boolean;
  onStart: (action: Parameters<typeof callCountdownAction>[1]) => void;
}) {
  const { register, handleSubmit, setValue, watch } = useForm<CountdownSetFormValues>({
    resolver: zodResolver(countdownSetSchema),
    defaultValues: { durationSeconds: 300, label: "", color: COLORS.cyan },
  });

  return (
    <form
      className="control-form countdown-panel"
      onSubmit={handleSubmit((values) =>
        onStart({
          action: "set",
          durationSeconds: Number(values.durationSeconds),
          label: values.label || undefined,
          color: values.color,
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
        value={watch("color") ?? COLORS.cyan}
        onChange={(v) => setValue("color", v)}
      />
      <button type="submit" disabled={pending}>
        Start Countdown
      </button>
    </form>
  );
}
