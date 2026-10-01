import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { gaugeParamsSchema, type GaugeParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { colorParam, COLORS } from "../../lib/rgb565";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type, not its
// inferred (post-coercion/default) output type.
type FormValues = z.input<typeof gaugeParamsSchema>;

export function GaugeForm({ initialParams, onChange }: ControlFormProps) {
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const { register, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(gaugeParamsSchema),
    defaultValues: {
      label: str(initialParams.label),
      value: num(initialParams.value, 0),
      min: num(initialParams.min, 0),
      max: num(initialParams.max, 100),
      color: colorParam(initialParams.color, COLORS.cyan),
      trackColor: colorParam(initialParams.trackColor, COLORS.darkgrey),
      style: (initialParams.style as GaugeParams["style"]) ?? "ring",
    },
  });

  const values = watch();
  useEmitOnChange(values, onChange);

  return (
    <div className="control-form">
      <label className="field">
        Label
        <input {...register("label")} placeholder="(none)" />
      </label>
      <div className="field-row">
        <label className="field">
          Value
          <input type="number" {...register("value")} />
        </label>
        <label className="field">
          Min
          <input type="number" {...register("min")} />
        </label>
        <label className="field">
          Max
          <input type="number" {...register("max")} />
        </label>
      </div>
      <label className="field">
        Style
        <select {...register("style")}>
          <option value="ring">Ring (full 360°)</option>
          <option value="speedometer">Speedometer (270° sweep)</option>
          <option value="instrument">Instrument (300° sweep, ticks)</option>
        </select>
      </label>
      <ColorInput
        id="gauge-color"
        label="Fill color"
        value={values.color ?? COLORS.cyan}
        onChange={(v) => setValue("color", v)}
      />
      <ColorInput
        id="gauge-trackColor"
        label="Track color"
        value={values.trackColor ?? COLORS.darkgrey}
        onChange={(v) => setValue("trackColor", v)}
      />
    </div>
  );
}
