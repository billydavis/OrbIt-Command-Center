import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { analogClockParamsSchema, type AnalogClockParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { colorParam, COLORS } from "../../lib/rgb565";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

const FIELDS: { name: keyof AnalogClockParams; label: string }[] = [
  { name: "background", label: "Background" },
  { name: "tickColor", label: "Tick marks" },
  { name: "hourColor", label: "Hour hand" },
  { name: "minuteColor", label: "Minute hand" },
  { name: "secondColor", label: "Second hand" },
];

// The fallbacks are the firmware's own defaults (AnalogClockControl.h), only
// used when switching a screen to this control — a live clock always reports
// all five colors.
export function AnalogClockForm({ initialParams, onChange }: ControlFormProps) {
  const { setValue, watch } = useForm<AnalogClockParams>({
    resolver: zodResolver(analogClockParamsSchema),
    defaultValues: {
      background: colorParam(initialParams.background, COLORS.black),
      tickColor: colorParam(initialParams.tickColor, COLORS.white),
      hourColor: colorParam(initialParams.hourColor, COLORS.white),
      minuteColor: colorParam(initialParams.minuteColor, COLORS.white),
      secondColor: colorParam(initialParams.secondColor, COLORS.red),
    },
  });

  const values = watch();
  useEmitOnChange(values, onChange);

  return (
    <div className="control-form">
      {FIELDS.map(({ name, label }) => (
        <ColorInput
          key={name}
          id={`analogClock-${name}`}
          label={label}
          value={values[name] ?? COLORS.black}
          onChange={(v) => setValue(name, v)}
        />
      ))}
    </div>
  );
}
