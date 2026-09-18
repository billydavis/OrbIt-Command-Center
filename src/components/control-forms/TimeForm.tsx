import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { timeParamsSchema } from "../../lib/controlSchemas";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// react-hook-form's generic must match the schema's *input* type (what the
// resolver accepts before defaults/coercion apply), not zod's inferred
// output type — otherwise optional/coerced fields don't typecheck against
// useForm's required-output generic.
type FormValues = z.input<typeof timeParamsSchema>;

export function TimeForm({ initialParams, onChange }: ControlFormProps) {
  const { register, watch } = useForm<FormValues>({
    resolver: zodResolver(timeParamsSchema),
    defaultValues: {
      showDate: Boolean(initialParams.showDate),
      showDay: Boolean(initialParams.showDay),
      format24Hour: Boolean(initialParams.format24Hour),
    },
  });

  useEmitOnChange(watch(), onChange);

  return (
    <div className="control-form">
      <label className="field-checkbox">
        <input type="checkbox" {...register("showDate")} /> Show date
      </label>
      <label className="field-checkbox">
        <input type="checkbox" {...register("showDay")} /> Show day of week
      </label>
      <label className="field-checkbox">
        <input type="checkbox" {...register("format24Hour")} /> 24-hour format
      </label>
    </div>
  );
}
