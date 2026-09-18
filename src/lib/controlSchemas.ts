import { z } from "zod";

// One zod schema per control's params shape, matching docs/orbit-api.md's
// control table. These validate what the *form* produces before it's sent
// as an outgoing POST — they are not used to validate GET read-back, which
// can be lossy (analogClock colors as raw ints, custom as elementCount) per
// the spec's own caveats.

export const timeParamsSchema = z.object({
  showDate: z.boolean().default(false),
  showDay: z.boolean().default(false),
  format24Hour: z.boolean().default(false),
});
export type TimeParams = z.infer<typeof timeParamsSchema>;

// Color fields are names (e.g. "cyan", "white"), parsed device-side via
// Utils::stringToColor() — same convention analogClock/gauge/countdown use.
export const analogClockParamsSchema = z.object({
  background: z.string().optional(),
  tickColor: z.string().optional(),
  hourColor: z.string().optional(),
  minuteColor: z.string().optional(),
  secondColor: z.string().optional(),
});
export type AnalogClockParams = z.infer<typeof analogClockParamsSchema>;

export const gaugeParamsSchema = z.object({
  label: z.string().optional(),
  value: z.coerce.number().default(0),
  min: z.coerce.number().default(0),
  max: z.coerce.number().default(100),
  color: z.string().optional(),
  trackColor: z.string().optional(),
  style: z.enum(["ring", "speedometer", "instrument"]).default("ring"),
});
export type GaugeParams = z.infer<typeof gaugeParamsSchema>;

// sysMonitor's numeric fields are driven by the app's background push loop,
// not user-entered — no schema needed for a form the user doesn't fill in.

export const weatherParamsSchema = z.object({
  element: z.enum(["icon", "temperature", "condition"]).default("icon"),
});
export type WeatherParams = z.infer<typeof weatherParamsSchema>;

export const tickerParamsSchema = z.object({
  symbol: z.string().min(1, "Symbol is required (e.g. BTC/USD)"),
  // Device silently clamps below 300s; surfaced as a hint, not enforced
  // client-side, so the device's own behavior stays the source of truth.
  pollIntervalSeconds: z.coerce.number().int().positive().default(900),
});
export type TickerParams = z.infer<typeof tickerParamsSchema>;

// custom's params are a WebDataWidget "displays" entry — either a plain
// string (word-wrapped centered text) or an element-primitive array. v1
// edits this as raw JSON (see plan decision: raw textarea over a visual
// drawing-primitive builder), so validation is deliberately permissive:
// just "is this valid JSON that could plausibly be these params."
export const customParamsSchema = z.record(z.string(), z.unknown());
export type CustomParams = z.infer<typeof customParamsSchema>;

export const countdownSetSchema = z.object({
  durationSeconds: z.coerce.number().int().positive(),
  label: z.string().optional(),
  color: z.string().optional(),
});
export type CountdownSetParams = z.infer<typeof countdownSetSchema>;
