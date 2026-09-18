import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { analogClockParamsSchema, type AnalogClockParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// Note: GET read-back reports colors as raw RGB565 ints, not the names this
// form edits (docs/orbit-api.md, analogClock row) — so `initialParams`
// coming from a live device slot won't prefill these as color names. That's
// fine: POST always replaces the whole slot, so leaving a field blank here
// and applying just means "use the device's default for that field."
export function AnalogClockForm({ initialParams, onChange }: ControlFormProps) {
  const asString = (v: unknown) => (typeof v === "string" ? v : "");
  const { register, watch } = useForm<AnalogClockParams>({
    resolver: zodResolver(analogClockParamsSchema),
    defaultValues: {
      background: asString(initialParams.background),
      tickColor: asString(initialParams.tickColor),
      hourColor: asString(initialParams.hourColor),
      minuteColor: asString(initialParams.minuteColor),
      secondColor: asString(initialParams.secondColor),
    },
  });

  const values = watch();
  useEmitOnChange(values, onChange);

  return (
    <div className="control-form">
      <ColorField name="background" label="Background" register={register} watch={watch} />
      <ColorField name="tickColor" label="Tick marks" register={register} watch={watch} />
      <ColorField name="hourColor" label="Hour hand" register={register} watch={watch} />
      <ColorField name="minuteColor" label="Minute hand" register={register} watch={watch} />
      <ColorField name="secondColor" label="Second hand" register={register} watch={watch} />
    </div>
  );
}

// react-hook-form's register() returns event handlers, not a controlled
// value/onChange pair, which ColorInput (a plain controlled input, reused
// across forms) expects — this small adapter bridges the two without
// duplicating ColorInput as an uncontrolled variant.
function ColorField({
  name,
  label,
  register,
  watch,
}: {
  name: keyof AnalogClockParams;
  label: string;
  register: ReturnType<typeof useForm<AnalogClockParams>>["register"];
  watch: ReturnType<typeof useForm<AnalogClockParams>>["watch"];
}) {
  const field = register(name);
  return (
    <ColorInput
      id={`analogClock-${name}`}
      label={label}
      value={(watch(name) as string) ?? ""}
      onChange={(v) => field.onChange({ target: { name, value: v } })}
    />
  );
}
