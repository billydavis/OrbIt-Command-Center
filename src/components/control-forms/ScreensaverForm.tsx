import { useForm } from "react-hook-form";
import { ColorInput } from "../shared/ColorInput";
import { colorParam } from "../../lib/rgb565";
import {
  SCREENSAVER_EFFECTS,
  SCREENSAVER_EFFECT_COLORS,
  type ScreensaverEffect,
} from "../../lib/controlSchemas";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

type EffectChoice = ScreensaverEffect | "cycle";

const EFFECT_LABELS: Record<EffectChoice, string> = {
  asteroids: "Asteroids",
  matrix: "Matrix rain",
  warp: "Warp tunnel",
  orrery: "Orrery",
  radar: "Radar",
  cycle: "Cycle through all",
};

const EFFECT_HINTS: Record<EffectChoice, string> = {
  asteroids: "Drifting starfield, a ringed planet and wireframe rocks. Color tints the planet.",
  matrix: "Falling columns of glyphs. Color tints the rain.",
  warp: "Stars streaking down a winding tunnel. Color tints the rings.",
  orrery: "Planets circling a sun. Color tints the sun.",
  radar: "A sweeping beam lighting up contacts. Color tints the whole scope.",
  cycle: "Shows each effect in turn, starting from Asteroids.",
};

interface FormValues {
  effect: EffectChoice;
  cycleSeconds: number;
  customColor: boolean;
  color: number;
}

// The device reports `color` only when one was set and `cycleSeconds` only
// for "cycle" (see "screensaver control" in docs/orbit-api.md), so the
// params emitted here leave them out the same way — otherwise a screen
// nobody has touched would read as dirty straight after connecting.
export function ScreensaverForm({ initialParams, onChange }: ControlFormProps) {
  const initialEffect: EffectChoice =
    initialParams.effect === "cycle" || SCREENSAVER_EFFECTS.includes(initialParams.effect as ScreensaverEffect)
      ? (initialParams.effect as EffectChoice)
      : "asteroids";
  const { register, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      effect: initialEffect,
      cycleSeconds: typeof initialParams.cycleSeconds === "number" ? initialParams.cycleSeconds : 300,
      customColor: typeof initialParams.color === "number",
      color: colorParam(initialParams.color, defaultColorFor(initialEffect)),
    },
  });

  const values = watch();
  const params: Record<string, unknown> = { effect: values.effect };
  if (values.effect === "cycle" && Number.isFinite(values.cycleSeconds)) {
    params.cycleSeconds = values.cycleSeconds;
  }
  if (values.customColor) {
    params.color = values.color;
  }
  useEmitOnChange(params, onChange);

  return (
    <div className="control-form">
      <label className="field">
        Effect
        <select
          {...register("effect", {
            // Until a color is picked, follow the new effect's own default so
            // ticking "Custom color" starts from what's already on screen.
            onChange: (e) => {
              if (!values.customColor) setValue("color", defaultColorFor(e.target.value));
            },
          })}
        >
          {(Object.keys(EFFECT_LABELS) as EffectChoice[]).map((effect) => (
            <option key={effect} value={effect}>
              {EFFECT_LABELS[effect]}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">{EFFECT_HINTS[values.effect]}</p>
      {values.effect === "cycle" && (
        <>
          <label className="field">
            Seconds per effect
            <input type="number" {...register("cycleSeconds", { valueAsNumber: true })} />
          </label>
          <p className="field-hint">Device clamps this to between 30 seconds and 24 hours.</p>
        </>
      )}
      <label className="field-checkbox">
        <input type="checkbox" {...register("customColor")} /> Custom color
      </label>
      {values.customColor ? (
        <ColorInput
          id="screensaver-color"
          label="Color"
          value={values.color}
          onChange={(v) => setValue("color", v)}
        />
      ) : (
        <p className="field-hint">
          {values.effect === "cycle" ? "Each effect uses its own color." : "Uses the effect's own color."}
        </p>
      )}
    </div>
  );
}

function defaultColorFor(effect: string): number {
  return SCREENSAVER_EFFECT_COLORS[effect as ScreensaverEffect] ?? SCREENSAVER_EFFECT_COLORS.asteroids;
}
