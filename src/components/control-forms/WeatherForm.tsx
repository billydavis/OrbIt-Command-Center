import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { weatherParamsSchema, type WeatherParams } from "../../lib/controlSchemas";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type.
type FormValues = z.input<typeof weatherParamsSchema>;

export function WeatherForm({ initialParams, onChange }: ControlFormProps) {
  const { register, watch } = useForm<FormValues>({
    resolver: zodResolver(weatherParamsSchema),
    defaultValues: {
      element: (initialParams.element as WeatherParams["element"]) ?? "icon",
    },
  });

  useEmitOnChange(watch(), onChange);

  return (
    <div className="control-form">
      <label className="field">
        Element
        <select {...register("element")}>
          <option value="icon">Icon</option>
          <option value="temperature">Temperature</option>
          <option value="condition">Condition</option>
        </select>
      </label>
    </div>
  );
}
