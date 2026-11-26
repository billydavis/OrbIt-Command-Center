// Clock faces for the analogClock control on firmware that takes clock face
// files (docs/orbit-api.md, "Clock faces"). The board draws only what moves;
// everything that stays still (background, photo, numerals, ticks) is one
// 240x240 picture made here, and each hand is an outline in face-radius
// units. One module makes both, so the builder's preview, the thumbnails and
// the screen tiles put them together the way the board does: what you see
// is the board's picture, not a likeness.
//
// What's saved for a clock face is its recipe (the builder's choices); the
// file is made from it whenever it's needed. Geometry and presets come from
// orbit-station's docs/mockups/analog-clock.html; the three built-in clock
// faces mirror orbit-station's AnalogClockControl.cpp.

import { rgb565ToHex } from "./rgb565";

// ---- recipes ----

export const DIAL_STYLES = ["classic", "track", "arabic", "roman", "platform", "dots", "none"] as const;
export const HAND_STYLES = ["line", "baton", "dauphine", "sword", "skeleton"] as const;
export const SECOND_STYLES = ["needle", "lollipop", "none"] as const;
export const BACKGROUND_STYLES = ["solid", "gradient", "nightSky", "photo"] as const;

export type DialStyle = (typeof DIAL_STYLES)[number];
export type HandStyle = (typeof HAND_STYLES)[number];
export type SecondStyle = (typeof SECOND_STYLES)[number];
export type BackgroundStyle = (typeof BACKGROUND_STYLES)[number];

export interface ClockFaceRecipe {
  dial: DialStyle;
  hands: HandStyle;
  seconds: SecondStyle;
  background: BackgroundStyle;
  /** A 240x240 JPEG data URL, for the "photo" background. */
  photo: string | null;
  /** Darkens the background by this percent (0-60), so the hands stand out. */
  dim: number;
  /** A date window at three o'clock. */
  date: boolean;
  /** The day's name under twelve. */
  weekday: boolean;
  /**
   * A thin dark edge round the hands. The board can't draw see-through
   * shadows, so this is how hands stay readable over a photo.
   */
  edges: boolean;
  /**
   * A ring round the rim that fills from twelve with the seconds, in the
   * second hand's colour (the hands' when there's no second hand).
   */
  ring: boolean;
  /**
   * A hand for a second time zone (the mockup's orange arrow, on a 24-hour
   * scale) and the city's name. Only a face with one takes a screen's
   * second time zone; which city is the screen's setting (`zone2`).
   */
  zone: boolean;
  colors: { background: string; dial: string; hands: string; second: string };
}

export const LABELS: Record<string, string> = {
  classic: "Classic",
  track: "Minute track",
  arabic: "Arabic",
  roman: "Roman",
  platform: "Platform",
  dots: "Dots",
  none: "None",
  line: "Line",
  baton: "Baton",
  dauphine: "Dauphine",
  sword: "Sword",
  skeleton: "Skeleton",
  needle: "Needle",
  lollipop: "Lollipop",
  solid: "Solid",
  gradient: "Gradient",
  nightSky: "Night sky",
  photo: "Photo",
  minimal: "Minimal",
};

/** The mockup's palette, offered one click away in the builder. */
export const SWATCHES: { name: string; hex: string }[] = [
  { name: "Black", hex: "#000000" },
  { name: "Navy", hex: "#0b1530" },
  { name: "Forest", hex: "#0f2a1e" },
  { name: "White", hex: "#ffffff" },
  { name: "Cream", hex: "#f3ead8" },
  { name: "Gold", hex: "#d8b46a" },
  { name: "Silver", hex: "#c9ccd1" },
  { name: "Red", hex: "#e8423a" },
  { name: "Orange", hex: "#d97757" },
  { name: "Lume", hex: "#b8f2c8" },
  { name: "Teal", hex: "#4fd1c5" },
  { name: "Grey", hex: "#6e6a64" },
];

const base = (r: Partial<ClockFaceRecipe> & { colors: ClockFaceRecipe["colors"] }): ClockFaceRecipe => ({
  dial: "classic",
  hands: "baton",
  seconds: "needle",
  background: "solid",
  photo: null,
  dim: 0,
  date: false,
  weekday: false,
  edges: false,
  ring: false,
  zone: false,
  ...r,
});

/** Where "New clock face" starts: the mockup's finished designs. */
export const PRESETS: { name: string; note: string; recipe: ClockFaceRecipe }[] = [
  {
    name: "Dress",
    note: "Faceted dauphine hands and Roman numerals in gold over deep navy, with a date window.",
    recipe: base({
      dial: "roman", hands: "dauphine", background: "gradient", date: true,
      colors: { background: "#0b1530", dial: "#d8b46a", hands: "#d8b46a", second: "#f3ead8" },
    }),
  },
  {
    name: "Platform",
    note: "Bold bars and a red lollipop second hand. Easy to read across a room.",
    recipe: base({
      dial: "platform", seconds: "lollipop",
      colors: { background: "#ffffff", dial: "#000000", hands: "#000000", second: "#e8423a" },
    }),
  },
  {
    name: "Minimal",
    note: "Twelve dots, two soft batons and no second hand. The weekday sits under twelve.",
    recipe: base({
      dial: "dots", seconds: "none", weekday: true,
      colors: { background: "#000000", dial: "#6e6a64", hands: "#f3ead8", second: "#e8423a" },
    }),
  },
  {
    name: "Diver",
    note: "Minute track, outlined hands with lume, and the date.",
    recipe: base({
      dial: "track", hands: "skeleton", background: "gradient", date: true,
      colors: { background: "#0f2a1e", dial: "#b8f2c8", hands: "#c9ccd1", second: "#d97757" },
    }),
  },
  {
    name: "Photo",
    note: "Your own picture behind the hands, dimmed a little, with dark edges so the hands stand out.",
    recipe: base({
      dial: "dots", background: "photo", dim: 25, edges: true,
      colors: { background: "#000000", dial: "#ffffff", hands: "#ffffff", second: "#d97757" },
    }),
  },
  {
    name: "Night sky",
    note: "Stars, Arabic numerals and sword hands. Good with a second time zone.",
    recipe: base({
      dial: "arabic", hands: "sword", background: "nightSky", weekday: true, zone: true,
      colors: { background: "#000000", dial: "#c9ccd1", hands: "#ffffff", second: "#4fd1c5" },
    }),
  },
  {
    name: "Plain",
    note: "A thin ring and twelve ticks: the board's own clock, as a starting point.",
    recipe: base({
      dial: "classic", hands: "line",
      colors: { background: "#000000", dial: "#ffffff", hands: "#ffffff", second: "#e8423a" },
    }),
  },
];

/** A saved recipe as the current builder knows it; fills in anything missing or unknown. */
export function readRecipe(raw: unknown): ClockFaceRecipe {
  const r = (raw ?? {}) as Partial<ClockFaceRecipe>;
  const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
    list.includes(v as T) ? (v as T) : fallback;
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
  const c = (r.colors ?? {}) as Partial<ClockFaceRecipe["colors"]>;
  return {
    dial: pick(r.dial, DIAL_STYLES, "classic"),
    hands: pick(r.hands, HAND_STYLES, "baton"),
    seconds: pick(r.seconds, SECOND_STYLES, "needle"),
    background: pick(r.background, BACKGROUND_STYLES, "solid"),
    photo: typeof r.photo === "string" ? r.photo : null,
    dim: typeof r.dim === "number" ? Math.max(0, Math.min(60, r.dim)) : 0,
    date: !!r.date,
    weekday: !!r.weekday,
    edges: !!r.edges,
    ring: !!r.ring,
    zone: !!r.zone,
    colors: {
      background: hex(c.background, "#000000"),
      dial: hex(c.dial, "#ffffff"),
      hands: hex(c.hands, "#ffffff"),
      second: hex(c.second, "#e8423a"),
    },
  };
}

// ---- the file's moving parts ----

/** One part of a hand: an outline, a disc on the hand's line, or both. Face-radius units. */
export interface Part {
  color: string;
  points?: [number, number][];
  /** [along, radius] */
  disc?: [number, number];
}

export interface TextSpot {
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface DateSpot extends TextSpot {
  width?: number;
  height?: number;
  background?: string;
  border?: string;
}

export interface DialSpec {
  style: DialStyle;
  background: BackgroundStyle;
  backgroundColor: string;
  dialColor: string;
  photo: string | null;
  dim: number;
}

/** Everything that makes one clock face: the still picture and the moving parts. */
export interface FaceDrawing {
  dial: DialSpec;
  hands: { hour: Part[]; minute: Part[]; second?: Part[]; zone?: Part[] };
  cap?: Part[];
  date?: DateSpot;
  weekday?: TextSpot;
  zoneLabel?: TextSpot;
  secondsRing?: SecondsRing;
}

/**
 * The seconds ring: a round-capped arc about the middle of pixel 120, from
 * twelve round to the second hand. Pixels, as the file has them.
 */
export interface SecondsRing {
  radius: number;
  width: number;
  color: string;
}

/** The mockup's ring, and the board's for built-in clock faces: just inside the rim. */
const RING = { radius: 116, width: 3 };

const SIZE = 240;
/** The face's radius in pixels: 1 in the file's units. */
const R = 110;
/** The middle of pixel 120, where the board turns the hands. */
const C = 120.5;
const EDGE = "#0a0a0a";
const LUME = "#b8f2c8";
const PIN = "#111111";
const ZONE_COLOR = "#d97757";
const FONT = "Roboto, 'Segoe UI', system-ui, sans-serif";

// Pixels to the file's units, rounded so the file stays small (a thousandth
// of the radius is a ninth of a pixel).
const u = (px: number) => Math.round((px / R) * 1000) / 1000;
const pts = (list: [number, number][]): [number, number][] => list.map(([x, y]) => [u(x), u(y)]);
const disc = (along: number, radius: number): [number, number] => [u(along), u(radius)];

/** A bar from r0 to r1 pixels along the hand, `half` pixels either side. */
const bar = (r0: number, r1: number, half: number): [number, number][] => [
  [-half, r0], [-half, r1], [half, r1], [half, r0],
];
/** Tapered: `w0` either side at r0, `w1` at r1. */
const wedge = (r0: number, r1: number, w0: number, w1: number): [number, number][] => [
  [-w0, r0], [-w1, r1], [w1, r1], [w0, r0],
];

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** One hand of `style`, `len` pixels long and about `width` wide. At most 4 parts. */
function handParts(style: HandStyle, len: number, width: number, color: string, edges: boolean): Part[] {
  const g = edges ? 1.3 : 0;
  const out: Part[] = [];
  switch (style) {
    case "line": {
      const half = len < 70 ? 1 : 0.75;
      if (edges) out.push({ color: EDGE, points: pts(bar(-g, len + g, half + g)) });
      out.push({ color, points: pts(bar(0, len, half)) });
      break;
    }
    case "baton": {
      const w0 = width * 0.55, w1 = width * 0.4;
      if (edges) {
        out.push({ color: EDGE, points: pts(wedge(-14, len, w0 + g, w1 + g)), disc: disc(-14, w0 + g) });
        out.push({ color: EDGE, disc: disc(len, w1 + g) });
      }
      out.push({ color, points: pts(wedge(-14, len, w0, w1)), disc: disc(-14, w0) });
      out.push({ color, disc: disc(len, w1) });
      break;
    }
    case "dauphine": {
      const w = width * 0.85, b = len * 0.1;
      if (edges) out.push({ color: EDGE, points: pts([[0, -12 - g * 1.5], [w + g, b], [0, len + g * 2], [-(w + g), b]]) });
      out.push({ color: shade(color, 1.18), points: pts([[0, -12], [w, b], [0, len]]) });
      out.push({ color: shade(color, 0.62), points: pts([[0, -12], [-w, b], [0, len]]) });
      break;
    }
    case "sword": {
      const p = width * 0.55, q = width * 0.2, m = len * 0.72;
      const shape = (e: number): [number, number][] => [
        [q + e, -10 - e], [p + e, m], [0, len + e * 2], [-(p + e), m], [-(q + e), -10 - e],
      ];
      if (edges) out.push({ color: EDGE, points: pts(shape(g)) });
      out.push({ color, points: pts(shape(0)) });
      break;
    }
    case "skeleton": {
      // Already four parts, and outlined by its own design: no edge.
      const w = width * 0.55, l = width * 0.32;
      out.push({ color, points: pts(wedge(-12, len, w, w)), disc: disc(-12, w) });
      out.push({ color, disc: disc(len, w) });
      out.push({ color: LUME, points: pts(wedge(len * 0.3, len - 3, l, l)), disc: disc(len * 0.3, l) });
      out.push({ color: LUME, disc: disc(len - 3, l) });
      break;
    }
  }
  return out;
}

function secondParts(style: SecondStyle, color: string, edges: boolean): Part[] | undefined {
  const g = edges ? 1.3 : 0;
  const [r0, r1, half, at, radius] = style === "lollipop" ? [-26, 74, 1.2, 74, 8.5] : [-24, 100, 0.8, -24, 3];
  if (style === "none") return undefined;
  const out: Part[] = [];
  if (edges) out.push({ color: EDGE, points: pts(bar(r0 - g, r1 + g, half + g)), disc: disc(at, radius + g) });
  out.push({ color, points: pts(bar(r0, r1, half)), disc: disc(at, radius) });
  return out;
}

/** What a recipe draws. */
export function drawingFor(recipe: ClockFaceRecipe): FaceDrawing {
  const { colors } = recipe;
  const hubColor = recipe.seconds !== "none" ? colors.second : colors.hands;
  const hub = recipe.hands === "line" ? 4 : 5.5;
  const cap: Part[] = [];
  if (recipe.edges) cap.push({ color: EDGE, disc: [0, u(hub + 1.3)] });
  cap.push({ color: hubColor, disc: [0, u(hub)] });
  if (recipe.hands !== "line") cap.push({ color: PIN, disc: [0, u(2)] });

  const drawing: FaceDrawing = {
    dial: {
      style: recipe.dial,
      background: recipe.background,
      backgroundColor: colors.background,
      dialColor: colors.dial,
      photo: recipe.background === "photo" ? recipe.photo : null,
      dim: recipe.dim,
    },
    hands: {
      hour: handParts(recipe.hands, 58, 9, colors.hands, recipe.edges),
      minute: handParts(recipe.hands, 88, 7, colors.hands, recipe.edges),
      second: secondParts(recipe.seconds, colors.second, recipe.edges),
      ...(recipe.zone ? { zone: DEFAULT_ZONE_HAND } : {}),
    },
    cap,
  };
  if (recipe.date) {
    drawing.date = {
      x: recipe.dial === "arabic" || recipe.dial === "roman" ? 175 : 183,
      y: 120, width: 30, height: 22, size: 15,
      color: "#111111", background: "#f5f2ea", border: colors.dial,
    };
  }
  if (recipe.weekday) drawing.weekday = { x: 120, y: 72, size: 14, color: colors.dial };
  if (recipe.ring) drawing.secondsRing = { ...RING, color: hubColor };
  return drawing;
}

// ---- the board's built-in clock faces (AnalogClockControl.cpp) ----

const hex565 = (v: unknown, fallback: string) => (typeof v === "number" ? rgb565ToHex(v) : fallback);

/** A built-in clock face by its `clockFace` name; classic takes the colour params. */
export function builtInDrawing(name: string, params: Record<string, unknown>): FaceDrawing {
  // The built-in faces all take a second time zone, with the board's own hand.
  const drawing = builtInFace(name, params);
  drawing.hands.zone = DEFAULT_ZONE_HAND;
  // The `secondsRing` param: the second hand's colour, or the hour hand's
  // on a face without one (minimal).
  if (params.secondsRing === true) {
    const hand = drawing.hands.second ?? drawing.hands.hour;
    drawing.secondsRing = { ...RING, color: hand[hand.length - 1].color };
  }
  return drawing;
}

function builtInFace(name: string, params: Record<string, unknown>): FaceDrawing {
  const solid = (backgroundColor: string, dialColor: string, style: DialStyle): DialSpec => ({
    style, background: "solid", backgroundColor, dialColor, photo: null, dim: 0,
  });
  const baton = (len: number, width: number, color: string): Part[] => handParts("baton", len, width, color, false);
  if (name === "platform") {
    const red = "#e8423a";
    return {
      dial: solid("#ffffff", "#000000", "platform"),
      hands: { hour: baton(58, 9, "#000000"), minute: baton(88, 7, "#000000"), second: secondParts("lollipop", red, false) },
      cap: [{ color: red, disc: [0, u(5.5)] }, { color: PIN, disc: [0, u(2)] }],
    };
  }
  if (name === "minimal") {
    const cream = "#f3ead8", grey = "#6e6a64";
    return {
      dial: solid("#000000", grey, "dots"),
      hands: { hour: baton(58, 9, cream), minute: baton(88, 7, cream) },
      cap: [{ color: cream, disc: [0, u(5.5)] }, { color: PIN, disc: [0, u(2)] }],
      weekday: { x: 120, y: 72, size: 14, color: grey },
    };
  }
  const hourColor = hex565(params.hourColor, "#ffffff");
  return {
    dial: solid(hex565(params.background, "#000000"), hex565(params.tickColor, "#ffffff"), "classic"),
    hands: {
      hour: [{ color: hourColor, points: pts(bar(0, 55, 1)) }],
      minute: [{ color: hex565(params.minuteColor, "#ffffff"), points: pts(bar(0, 85, 0.75)) }],
      second: [{ color: hex565(params.secondColor, "#ff0000"), points: pts(bar(0, 95, 0.5)) }],
    },
    cap: [{ color: hourColor, disc: [0, u(4)] }],
  };
}

/** The board's own second-zone hand, for clock faces that don't give one. */
export const DEFAULT_ZONE_HAND: Part[] = [
  { color: ZONE_COLOR, points: pts(bar(0, 92, 1)) },
  { color: ZONE_COLOR, points: pts([[-6, 90], [0, 104], [6, 90]]) },
];
export const DEFAULT_ZONE_LABEL: TextSpot = { x: 120, y: 170, size: 11, color: ZONE_COLOR };

// ---- the still picture ----

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number): [number, number] => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];

function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("couldn't read the picture"));
    img.src = src;
  });
}

async function paintBackground(c: CanvasRenderingContext2D, d: DialSpec) {
  const col = d.backgroundColor;
  if (d.background === "gradient") {
    const g = c.createRadialGradient(C, C * 0.8, 10, C, C, 130);
    g.addColorStop(0, shade(col === "#000000" ? "#26221d" : col, 1.35));
    g.addColorStop(1, col);
    c.fillStyle = g;
    c.fillRect(0, 0, SIZE, SIZE);
  } else if (d.background === "nightSky") {
    const rnd = seeded(9 * 977);
    c.fillStyle = "#05060d";
    c.fillRect(0, 0, SIZE, SIZE);
    for (const [glow, x, y, r] of [["#3b1f6b", 70, 80, 120], ["#0f4d5e", 170, 160, 110], ["#6b1f4f", 150, 60, 80]] as const) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, glow + "cc");
      g.addColorStop(1, glow + "00");
      c.fillStyle = g;
      c.fillRect(0, 0, SIZE, SIZE);
    }
    for (let i = 0; i < 230; i++) {
      const r = rnd() < 0.08 ? 1.3 : 0.6;
      c.globalAlpha = 0.4 + rnd() * 0.6;
      c.beginPath();
      c.arc(rnd() * SIZE, rnd() * SIZE, r, 0, 2 * Math.PI);
      c.fillStyle = "#ffffff";
      c.fill();
    }
    c.globalAlpha = 1;
  } else {
    c.fillStyle = col;
    c.fillRect(0, 0, SIZE, SIZE);
    if (d.background === "photo" && d.photo) {
      try {
        c.drawImage(await loadImage(d.photo), 0, 0, SIZE, SIZE);
      } catch {
        // A photo that won't load leaves the plain colour.
      }
    }
  }
  if (d.dim) {
    c.fillStyle = `rgba(0,0,0,${d.dim / 100})`;
    c.fillRect(0, 0, SIZE, SIZE);
  }
}

function mark(c: CanvasRenderingContext2D, deg: number, r0: number, r1: number, width: number, color: string) {
  const [x0, y0] = at(deg, r0), [x1, y1] = at(deg, r1);
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = width;
  c.lineCap = "butt";
  c.strokeStyle = color;
  c.stroke();
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.beginPath();
  c.arc(x, y, r, 0, 2 * Math.PI);
  c.fillStyle = color;
  c.fill();
}

function ring(c: CanvasRenderingContext2D, r: number, color: string) {
  c.beginPath();
  c.arc(C, C, r, 0, 2 * Math.PI);
  c.lineWidth = 1;
  c.strokeStyle = color;
  c.stroke();
}

function label(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string) {
  c.font = `${size}px ${FONT}`;
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(s, x, y);
}

const ROMAN = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

function paintMarks(c: CanvasRenderingContext2D, d: DialSpec) {
  const col = d.dialColor;
  switch (d.style) {
    case "classic":
      ring(c, R, col);
      for (let i = 0; i < 12; i++) mark(c, i * 30, R - 10, R, 1, col);
      break;
    case "track":
      for (let i = 0; i < 60; i++) {
        if (i % 5) mark(c, i * 6, 102, 109, 1.2, col);
        else mark(c, i * 6, 92, 109, i % 15 ? 3 : 5, col);
      }
      break;
    case "arabic":
      for (let i = 0; i < 60; i++) if (i % 5) dot(c, ...at(i * 6, 106), 1, col);
      for (let i = 0; i < 12; i++) {
        const [x, y] = at(i * 30, 88);
        label(c, String(i || 12), x, y + 1, i % 3 ? 18 : 24, col);
      }
      break;
    case "roman":
      ring(c, 104, col);
      for (let i = 0; i < 60; i++) mark(c, i * 6, 100, 104, i % 5 ? 1 : 2, col);
      for (let i = 0; i < 12; i++) {
        const [x, y] = at(i * 30, 84);
        label(c, ROMAN[i], x, y + 1, i % 3 ? 15 : 18, col);
      }
      break;
    case "platform":
      for (let i = 0; i < 60; i++) {
        if (i % 5) mark(c, i * 6, 99, 108, 2.5, col);
        else mark(c, i * 6, 78, 108, 7, col);
      }
      break;
    case "dots":
      for (let i = 0; i < 12; i++) dot(c, ...at(i * 30, 100), i % 3 ? 3 : 5.5, col);
      break;
  }
}

/** The still picture, cut to RGB565 as the board will show it. */
export async function renderDial(d: DialSpec): Promise<HTMLCanvasElement> {
  if (document.fonts) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]);
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("no canvas to draw the clock face on");
  await paintBackground(c, d);
  paintMarks(c, d);
  const img = c.getImageData(0, 0, SIZE, SIZE);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i] &= 0xf8;
    px[i + 1] &= 0xfc;
    px[i + 2] &= 0xf8;
    px[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return canvas;
}

// The pictures already made, by what they show. Kept small: a recipe being
// edited makes a new one for every change.
const dialCache = new Map<string, Promise<string>>();
const DIAL_CACHE_SIZE = 40;

/** The still picture as a PNG data URL, made once per look. */
export function dialUrl(d: DialSpec): Promise<string> {
  const key = JSON.stringify(d);
  let found = dialCache.get(key);
  if (found) {
    dialCache.delete(key);
    dialCache.set(key, found);
    return found;
  }
  found = renderDial(d).then((canvas) => canvas.toDataURL("image/png"));
  dialCache.set(key, found);
  if (dialCache.size > DIAL_CACHE_SIZE) dialCache.delete(dialCache.keys().next().value!);
  found.catch(() => dialCache.delete(key));
  return found;
}

// ---- the file ----

/** The most the board takes (docs/orbit-api.md). */
export const MAX_FILE_BYTES = 256 * 1024;

export interface ClockFaceFile {
  /** The body to send, byte for byte. */
  file: string;
  /** First 16 hex digits of its SHA-256: what the board will report. */
  hash: string;
  bytes: number;
}

async function hashOf(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

const fileCache = new Map<string, Promise<ClockFaceFile>>();

/** The clock face file for a recipe, as the board takes it. */
export function clockFaceFile(id: string, recipe: ClockFaceRecipe): Promise<ClockFaceFile> {
  const key = id + JSON.stringify(recipe);
  let found = fileCache.get(key);
  if (found) return found;
  found = (async () => {
    const drawing = drawingFor(recipe);
    const png = (await dialUrl(drawing.dial)).split(",")[1];
    const body: Record<string, unknown> = { version: 1, id, dial: png, hands: drawing.hands };
    if (!drawing.hands.second) delete (body.hands as Record<string, unknown>).second;
    if (drawing.cap) body.cap = drawing.cap;
    if (drawing.date) body.date = drawing.date;
    if (drawing.weekday) body.weekday = drawing.weekday;
    if (drawing.secondsRing) body.secondsRing = drawing.secondsRing;
    const file = JSON.stringify(body);
    const bytes = new TextEncoder().encode(file);
    return { file, hash: await hashOf(bytes), bytes: bytes.length };
  })();
  fileCache.set(key, found);
  found.catch(() => fileCache.delete(key));
  return found;
}

/** A photo, cropped to the middle square and made 240x240, as a JPEG data URL. */
export async function photoFromFile(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no canvas to draw the photo on");
    c.imageSmoothingQuality = "high";
    c.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- time and angles (as the board works them out) ----

export interface ClockTime {
  hour: number; // 0-23
  minute: number;
  second: number;
  ms: number;
  day: number; // of the month
  weekday: number; // 0 = Sunday
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The time in `timeZone` (an IANA name), or here for "" or one this browser doesn't know. */
export function clockTime(now: Date, timeZone = ""): ClockTime {
  const local = (): ClockTime => ({
    hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(), ms: now.getMilliseconds(),
    day: now.getDate(), weekday: now.getDay(),
  });
  if (!timeZone) return local();
  if (!formatters.has(timeZone)) {
    try {
      formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
        timeZone, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric", day: "numeric", weekday: "short",
      }));
    } catch {
      formatters.set(timeZone, null);
    }
  }
  const f = formatters.get(timeZone);
  if (!f) return local();
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second), ms: now.getMilliseconds(),
    day: Number(parts.day), weekday: WEEKDAY_INDEX[parts.weekday] ?? now.getDay(),
  };
}

export function handAngles(t: ClockTime, sweep: boolean) {
  const sec = t.second + (sweep ? t.ms / 1000 : 0);
  return {
    hour: (t.hour % 12) * 30 + t.minute * 0.5 + sec / 120,
    minute: t.minute * 6 + sec * 0.1,
    second: sec * 6,
  };
}

/** The second zone's hand goes round once a day, at 12 for midnight. */
export const zoneAngle = (t: ClockTime) => (t.hour + t.minute / 60) * 15;

/** "America/New_York" -> "NEW YORK", as the board labels it. */
export function zoneName(tz: string): string {
  return tz.slice(tz.lastIndexOf("/") + 1).replace(/_/g, " ").toUpperCase();
}

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** A part turned to `deg`, in pixels of the 240x240 picture. */
export function placePart(part: Part, deg: number): { polygon?: [number, number][]; disc?: [number, number, number] } {
  const a = rad(deg), sin = Math.sin(a), cos = Math.cos(a);
  // Along the hand is (sin, -cos) on screen, across it (cos, sin).
  const place = (x: number, y: number): [number, number] => [C + R * (y * sin + x * cos), C + R * (-y * cos + x * sin)];
  return {
    polygon: part.points?.map(([x, y]) => place(x, y)),
    disc: part.disc ? [...place(0, part.disc[0]), part.disc[1] * R] : undefined,
  };
}

/** A colour as the screens show it. */
export function as565(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xf8, g = (n >> 8) & 0xfc, b = n & 0xf8;
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
