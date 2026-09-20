import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { analogClockParamsSchema, type AnalogClockParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { resolveColorField } from "../../lib/colorRoundTrip";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// Note: GET read-back reports colors as raw RGB565 ints, not the names this
// form edits (docs/orbit-api.md, analogClock row) — so `initialParams`
// coming from a live device slot won't prefill these as color names.
// resolveColorField() tells each field apart from a genuinely-unset one so
// the form never implies it knows a color it actually can't read back (see
// colorRoundTrip.ts and the "unknown" state in ColorInput).
//
// Confirmed via a direct device test: the apply response itself echoes
// colors back as numbers immediately, not just a later GET — so if this
// were recomputed from `initialParams` on every render (instead of once at
// mount, same as react-hook-form's own `defaultValues`), applying a color
// the user just picked would immediately re-flag that same field as
// "unknown," even though the app obviously knows what it just sent. Captured
// once here so it reflects what was true when this screen/control was first
// opened, not every echo that follows from the app's own writes.
export function AnalogClockForm({ initialParams, onChange }: ControlFormProps) {
  const [background] = useState(() => resolveColorField(initialParams.background));
  const [tickColor] = useState(() => resolveColorField(initialParams.tickColor));
  const [hourColor] = useState(() => resolveColorField(initialParams.hourColor));
  const [minuteColor] = useState(() => resolveColorField(initialParams.minuteColor));
  const [secondColor] = useState(() => resolveColorField(initialParams.secondColor));

  const { register, watch } = useForm<AnalogClockParams>({
    resolver: zodResolver(analogClockParamsSchema),
    defaultValues: {
      background: background.unknown ? "" : background.value || "black",
      tickColor: tickColor.unknown ? "" : tickColor.value || "white",
      hourColor: hourColor.unknown ? "" : hourColor.value || "white",
      minuteColor: minuteColor.unknown ? "" : minuteColor.value || "cyan",
      secondColor: secondColor.unknown ? "" : secondColor.value || "red",
    },
  });

  const values = watch();
  useEmitOnChange(values, onChange);

  return (
    <div className="control-form">
      <ColorField
        name="background"
        label="Background"
        register={register}
        watch={watch}
        unknownDeviceValue={background.unknown}
      />
      <ColorField
        name="tickColor"
        label="Tick marks"
        register={register}
        watch={watch}
        unknownDeviceValue={tickColor.unknown}
      />
      <ColorField
        name="hourColor"
        label="Hour hand"
        register={register}
        watch={watch}
        unknownDeviceValue={hourColor.unknown}
      />
      <ColorField
        name="minuteColor"
        label="Minute hand"
        register={register}
        watch={watch}
        unknownDeviceValue={minuteColor.unknown}
      />
      <ColorField
        name="secondColor"
        label="Second hand"
        register={register}
        watch={watch}
        unknownDeviceValue={secondColor.unknown}
      />
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
  unknownDeviceValue,
}: {
  name: keyof AnalogClockParams;
  label: string;
  register: ReturnType<typeof useForm<AnalogClockParams>>["register"];
  watch: ReturnType<typeof useForm<AnalogClockParams>>["watch"];
  unknownDeviceValue?: boolean;
}) {
  const field = register(name);
  return (
    <ColorInput
      id={`analogClock-${name}`}
      label={label}
      value={(watch(name) as string) ?? ""}
      onChange={(v) => field.onChange({ target: { name, value: v } })}
      unknownDeviceValue={unknownDeviceValue}
    />
  );
}
