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

// makapix is Orbit Station's addition, not part of orbit-api v1 — info-orbs
// doesn't build it (see "control" in capabilities.ts). Its "transition"
// choice isn't a fixed list here: it comes from the device's own
// capabilities (builtTransitions in capabilities.ts).
export const MAKAPIX_CHANNELS = ["all", "promoted", "user", "by_user", "hashtag", "reactions"] as const;
export type MakapixChannel = (typeof MAKAPIX_CHANNELS)[number];

export const MAKAPIX_SORTS = ["random", "server_order", "created_at"] as const;
export type MakapixSort = (typeof MAKAPIX_SORTS)[number];

export const MAKAPIX_FITS = ["crisp", "fill"] as const;
export type MakapixFit = (typeof MAKAPIX_FITS)[number];

export const makapixParamsSchema = z.object({
  channel: z.enum(MAKAPIX_CHANNELS).default("all"),
  // Required for "by_user"/"reactions" and "hashtag" respectively — enforced
  // in MakapixForm, not here, the same way WeatherForm handles its
  // channel-dependent fields.
  user: z.string().max(64).optional(),
  hashtag: z.string().optional(),
  sort: z.enum(MAKAPIX_SORTS).default("random"),
  // Device clamps to 10-86400s; surfaced as a hint, not enforced
  // client-side, so the device's own behavior stays the source of truth.
  changeSeconds: z.coerce.number().int().positive().default(120),
  fit: z.enum(MAKAPIX_FITS).default("crisp"),
  transition: z.string().optional(),
});
export type MakapixParams = z.infer<typeof makapixParamsSchema>;

// picture is Orbit Station's addition too: your own pictures, shown from the
// board's picture store, each named by its hash (the first 16 hex digits of
// its file's SHA-256). Offered only when capabilities.pictures is there.
// Like makapix, its "transition" comes from the device's capabilities.
export const PICTURE_MAX_COUNT = 24;
export const PICTURE_HASH = /^[0-9a-f]{16}$/;
export const PICTURE_ORDERS = ["list", "shuffle"] as const;
export type PictureOrder = (typeof PICTURE_ORDERS)[number];

export const pictureParamsSchema = z.object({
  pictures: z.array(z.string().regex(PICTURE_HASH)).max(PICTURE_MAX_COUNT).default([]),
  // Device clamps to 5-86400s, as makapix's changeSeconds is clamped.
  seconds: z.coerce.number().int().positive().default(30),
  order: z.enum(PICTURE_ORDERS).default("list"),
  transition: z.string().optional(),
});
export type PictureParams = z.infer<typeof pictureParamsSchema>;

// claudeUsage is Orbit Station's addition too. Only `style` and `animate` are
// settings; the four readings are live, never typed in or chosen here: they
// always follow CLAUDE_USAGE_FEEDS (bound on the Rust side, built_in in
// src-tauri/src/feeds/bindings.rs), which Claude Code's status line
// publishes (examples/claude-usage-statusline.ps1).
export const CLAUDE_USAGE_STYLES = ["pace", "orbit", "tanks"] as const;
export type ClaudeUsageStyle = (typeof CLAUDE_USAGE_STYLES)[number];

export const claudeUsageParamsSchema = z.object({
  style: z.enum(CLAUDE_USAGE_STYLES).default("pace"),
  animate: z.boolean().default(true),
});
export type ClaudeUsageParams = z.infer<typeof claudeUsageParamsSchema>;

/** Each live param, and the feed it always follows. Keep in step with built_in in bindings.rs. */
export const CLAUDE_USAGE_FEEDS = {
  session: "claude.session",
  week: "claude.week",
  sessionResetsAt: "claude.sessionResetsAt",
  weekResetsAt: "claude.weekResetsAt",
} as const;
export type ClaudeUsageReading = keyof typeof CLAUDE_USAGE_FEEDS;
