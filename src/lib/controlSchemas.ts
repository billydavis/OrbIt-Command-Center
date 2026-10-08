import { z } from "zod";

// One zod schema per control's params shape, matching docs/orbit-api.md's
// control table. These validate what the *form* produces before it's sent
// as an outgoing POST — they are not used to validate GET read-back.

export const timeParamsSchema = z.object({
  showDate: z.boolean().default(false),
  showDay: z.boolean().default(false),
  format24Hour: z.boolean().default(false),
});
export type TimeParams = z.infer<typeof timeParamsSchema>;

// Colors are RGB565 integers, the same form the device reports them in (see
// lib/rgb565.ts) — analogClock, gauge, countdown and screensaver all use this.
const rgb565Schema = z.number().int().min(0).max(0xffff);

export const analogClockParamsSchema = z.object({
  background: rgb565Schema.optional(),
  tickColor: rgb565Schema.optional(),
  hourColor: rgb565Schema.optional(),
  minuteColor: rgb565Schema.optional(),
  secondColor: rgb565Schema.optional(),
});
export type AnalogClockParams = z.infer<typeof analogClockParamsSchema>;

export const gaugeParamsSchema = z.object({
  label: z.string().optional(),
  value: z.coerce.number().default(0),
  min: z.coerce.number().default(0),
  max: z.coerce.number().default(100),
  color: rgb565Schema.optional(),
  trackColor: rgb565Schema.optional(),
  style: z.enum(["ring", "speedometer", "instrument"]).default("ring"),
});
export type GaugeParams = z.infer<typeof gaugeParamsSchema>;

// sysMonitor's numeric fields are driven by the app's background push loop,
// not user-entered — no schema needed for a form the user doesn't fill in.

// Everything but `element` is optional, and the device reports each one only
// when it was set (see "weather control" in docs/orbit-api.md).
export const WEATHER_LOCATION_MAX_LENGTH = 64;

export const weatherParamsSchema = z.object({
  element: z.enum(["icon", "temperature", "condition"]).default("icon"),
  location: z.string().max(WEATHER_LOCATION_MAX_LENGTH).optional(),
  showCity: z.boolean().optional(),
  showHighLow: z.boolean().optional(),
  color: rgb565Schema.optional(),
  background: rgb565Schema.optional(),
  highColor: rgb565Schema.optional(),
  lowColor: rgb565Schema.optional(),
  cityColor: rgb565Schema.optional(),
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
  color: rgb565Schema.optional(),
});
export type CountdownSetParams = z.infer<typeof countdownSetSchema>;

// screensaver's effects, in the order the device cycles through them, and
// each one's default color (ScreensaverControl in the firmware) — the color
// it draws in when `params.color` is left out.
export const SCREENSAVER_EFFECTS = ["asteroids", "matrix", "warp", "orrery", "radar"] as const;
export type ScreensaverEffect = (typeof SCREENSAVER_EFFECTS)[number];

export const SCREENSAVER_EFFECT_COLORS: Record<ScreensaverEffect, number> = {
  asteroids: 64800,
  matrix: 2016,
  warp: 34429,
  orrery: 65184,
  radar: 2016,
};
