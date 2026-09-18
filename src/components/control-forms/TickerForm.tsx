import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { tickerParamsSchema } from "../../lib/controlSchemas";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type.
type FormValues = z.input<typeof tickerParamsSchema>;

export function TickerForm({ initialParams, onChange }: ControlFormProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(tickerParamsSchema),
    defaultValues: {
      symbol: typeof initialParams.symbol === "string" ? initialParams.symbol : "",
      pollIntervalSeconds:
        typeof initialParams.pollIntervalSeconds === "number"
          ? initialParams.pollIntervalSeconds
          : 900,
    },
  });

  useEmitOnChange(watch(), onChange);

  return (
    <div className="control-form">
      <label className="field">
        Symbol
        <input {...register("symbol")} placeholder="BTC/USD" />
      </label>
      {errors.symbol && <p className="field-error">{errors.symbol.message}</p>}
      <label className="field">
        Poll interval (seconds)
        <input type="number" {...register("pollIntervalSeconds")} />
      </label>
      <p className="field-hint">
        Device clamps this up to a 300s floor to stay within twelvedata's free-tier budget.
      </p>
    </div>
  );
}
