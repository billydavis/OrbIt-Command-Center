import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { gaugeParamsSchema, type GaugeParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { colorParam, COLORS } from "../../lib/rgb565";
import { boundFeed, withBoundFeed } from "../../lib/feedBindings";
import { useFeedsStore } from "../../stores/feedsStore";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type, not its
// inferred (post-coercion/default) output type.
type FormValues = z.input<typeof gaugeParamsSchema>;

export function GaugeForm({ initialParams, onChange }: ControlFormProps) {
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : fallback);
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const { register, setValue, getValues, watch } = useForm<FormValues>({
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

  // Which feed `value` follows ("" = typed in by hand). Not a device param:
  // it travels in the params as `$bind` and the app keeps the gauge's value
  // current from then on (see lib/feedBindings.ts).
  const [source, setSource] = useState(() => boundFeed(initialParams, "value"));
  const feeds = useFeedsStore((s) => s.feeds);
  const sourceFeed = feeds.find((f) => f.id === source);

  const values = watch();
  useEmitOnChange(withBoundFeed(values, "value", source), onChange);

  function handleSourceChange(next: string) {
    setSource(next);
    // The feed's own suggestions fill in whatever is still at its default;
    // anything already set here is left alone.
    const feed = feeds.find((f) => f.id === next);
    if (!feed) return;
    const current = getValues();
    if (!current.label && feed.label) setValue("label", feed.label);
    if (Number(current.min) === 0 && Number(current.max) === 100) {
      if (feed.min !== undefined) setValue("min", feed.min);
      if (feed.max !== undefined) setValue("max", feed.max);
    }
  }

  return (
    <div className="control-form">
      <label className="field">
        Label
        <input {...register("label")} placeholder="(none)" />
      </label>
      <label className="field">
        Value source
        <select value={source} onChange={(e) => handleSourceChange(e.currentTarget.value)}>
          <option value="">Manual</option>
          {feeds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id}
            </option>
          ))}
          {source && !sourceFeed && <option value={source}>{source} (not publishing)</option>}
        </select>
      </label>
      {source && !sourceFeed && (
        <p className="field-hint">
          Nothing is publishing {source} right now. The gauge keeps its last value until something
          does.
        </p>
      )}
      <div className="field-row">
        {source ? (
          <label className="field">
            Value
            <input
              className="mono-num"
              readOnly
              value={sourceFeed ? String(sourceFeed.value) : "—"}
              title={`Follows the ${source} feed`}
            />
          </label>
        ) : (
          <label className="field">
            Value
            <input type="number" {...register("value")} />
          </label>
        )}
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
