import { useEffect, useState, type ReactNode } from "react";
import { CLAUDE_USAGE_FEEDS, type ClaudeUsageReading } from "../../lib/controlSchemas";
import { boundFeed } from "../../lib/feedBindings";
import { rgb565ToHex } from "../../lib/rgb565";
import type { Feed } from "../../lib/types";
import { useFeedsStore } from "../../stores/feedsStore";
import { useClockFacesStore } from "../../stores/clockFacesStore";
import { builtInDrawing, drawingFor } from "../../lib/clockFaceRenderer";
import { ClockFaceLayer } from "../clockfaces/ClockFaceLayer";

interface ScreenPreviewProps {
  control: string;
  params: Record<string, unknown>;
  /**
   * A fixed picture rather than a live one: no clock of its own. For the
   * small previews (control picker, saved profiles) where a ticking second
   * hand would only be noise.
   */
  still?: boolean;
}

// The orb's own palette (TFT colors on black glass), not the app's: this
// is a picture of the device's screen, so it looks the same in either theme.
const GLASS = "#06080b";
const WHITE = "#f3f6f8";
const DIM = "#93a3ad";
const TRACK = "#39424a";

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" ? v : Number(v) || fallback);
const color = (v: unknown, fallback: string) => (typeof v === "number" ? rgb565ToHex(v) : fallback);

function useNow(still: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [still]);
  return now;
}

/**
 * A drawing of what one screen of the orb shows for a given control and
 * params. It's a likeness, not a simulation: values the app knows are real
 * (the time, a gauge's feed, the sysMonitor readings), while things only
 * the device fetches (weather, a ticker's price) are drawn as their shape.
 */
export function ScreenPreview({ control, params, still = false }: ScreenPreviewProps) {
  const now = useNow(still);
  const feeds = useFeedsStore((s) => s.feeds);

  return (
    <svg className="screen-preview" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill={GLASS} />
      <g fill={WHITE} textAnchor="middle">
        {draw(control, params, now, feeds)}
      </g>
    </svg>
  );
}

function draw(control: string, p: Record<string, unknown>, now: Date, feeds: Feed[]): ReactNode {
  const feedValue = (id: string) => feeds.find((f) => f.id === id)?.value;

  switch (control) {
    case "time": {
      let hour = now.getHours();
      if (!p.format24Hour) hour = hour % 12 || 12;
      const minute = String(now.getMinutes()).padStart(2, "0");
      return (
        <>
          {!!p.showDay && (
            <text x="50" y="31" fontSize="8.5" fill={DIM} letterSpacing=".8">
              {now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase()}
            </text>
          )}
          <text x="50" y="59" fontSize="27" fontWeight="600">
            {hour}:{minute}
          </text>
          {!!p.showDate && (
            <text x="50" y="76" fontSize="9" fill={DIM}>
              {now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          )}
        </>
      );
    }

    case "analogClock":
      return <AnalogClockPreview params={p} now={now} />;

    case "gauge": {
      const source = boundFeed(p, "value");
      const value = (source ? feedValue(source) : undefined) ?? num(p.value, 0);
      const min = num(p.min, 0);
      const max = num(p.max, 100);
      const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
      const style = str(p.style, "ring");
      // Sweep and start angle per style, as GaugeControl draws them.
      const sweep = style === "ring" ? 1 : style === "speedometer" ? 0.75 : 300 / 360;
      const start = style === "ring" ? -90 : style === "speedometer" ? 135 : 120;
      const width = style === "instrument" ? 5 : 8;
      const arc = (length: number, stroke: string) => (
        <circle
          cx="50" cy="50" r="39" fill="none" stroke={stroke} strokeWidth={width} pathLength={100}
          strokeDasharray={`${(length * 100).toFixed(2)} 100`} transform={`rotate(${start} 50 50)`}
        />
      );
      // The device adds "%" only for the default 0-100 range.
      const percent = min === 0 && max === 100;
      return (
        <>
          {arc(sweep, color(p.trackColor, TRACK))}
          {fraction > 0 && arc(sweep * fraction, color(p.color, "#19e0ff"))}
          {style === "instrument" &&
            Array.from({ length: 11 }, (_, i) => (
              <line
                key={i} x1="50" y1="19" x2="50" y2="23" stroke={DIM} strokeWidth="1"
                transform={`rotate(${start + 90 + i * 30} 50 50)`}
              />
            ))}
          <text x="50" y="57" fontSize={percent ? 21 : 23} fontWeight="600" className="mono-num">
            {Math.round(value)}
            {percent ? "%" : ""}
          </text>
          <text x="50" y="71" fontSize="8.5" fill={DIM} letterSpacing=".6">
            {str(p.label)}
          </text>
        </>
      );
    }

    case "sysMonitor": {
      // The loop's own readings where there's a feed for them; the device
      // shows the rest too, but the app doesn't hold those on their own.
      const quadrant = (x: number, y: number, fill: string, label: string, reading?: number) => (
        <g key={label}>
          <text x={x} y={y} fontSize="13" fontWeight="600" fill={fill} className="mono-num">
            {reading === undefined ? "--" : Math.round(reading)}
          </text>
          <text x={x} y={y + 8} fontSize="5.5" fill={DIM}>
            {label}
          </text>
          <rect x={x - 10} y={y + 11} width="20" height="2" fill={TRACK} />
          <rect x={x - 10} y={y + 11} width={Math.min(20, (reading ?? 0) / 5)} height="2" fill={fill} />
        </g>
      );
      return (
        <>
          {quadrant(32, 34, "#19e0ff", "CPU", feedValue("sys.cpu") ?? num(p.cpu, 0))}
          {quadrant(68, 34, "#ff5fd2", "GPU", feedValue("sys.gpu") ?? num(p.gpu, 0))}
          {quadrant(32, 66, "#ff9a2e", "RAM", feedValue("sys.ram") ?? num(p.ram, 0))}
          {quadrant(68, 66, "#ff4d4d", "SSD", typeof p.ssdTemp === "number" ? p.ssdTemp : undefined)}
        </>
      );
    }

    case "weather": {
      const element = str(p.element, "icon");
      const icon = (dy: number, scale: number) => (
        <g transform={`translate(${50 - 50 * scale} ${dy}) scale(${scale})`}>
          <circle cx="40" cy="38" r="12" fill="#ffd23f" />
          <g fill="#dfe7ec">
            <ellipse cx="54" cy="48" rx="17" ry="10" />
            <circle cx="46" cy="44" r="9" />
            <circle cx="58" cy="41" r="10" />
          </g>
        </g>
      );
      if (element === "icon") return icon(6, 1.1);

      const main = color(p.color, WHITE);
      const cityFill = color(p.cityColor, main);
      const backdrop = <circle cx="50" cy="50" r="50" fill={color(p.background, GLASS)} />;
      // The device shows the first part of the address the weather service
      // resolved; the first part of what was typed is the nearest thing here.
      const place = str(p.location).split(",")[0].trim() || "City";
      const city = place.length > 12 ? `${place.slice(0, 11)}…` : place;
      if (element === "condition") {
        return (
          <>
            {backdrop}
            <text x="50" y="38" fontSize="12" fontWeight="600" fill={cityFill}>
              {city}
            </text>
            <text x="50" y="58" fontSize="8.5" fill={main}>
              Condition
            </text>
          </>
        );
      }

      // Both defaults as the device has them when the param is left out.
      const showHighLow = p.showHighLow !== false;
      const showCity = typeof p.showCity === "boolean" ? p.showCity : str(p.location).trim() !== "";
      const reading = (x: number, label: string, fill: string) => (
        <g fill={fill} fontSize="8">
          <text x={x} y="73">
            {label}
          </text>
          <text x={x} y="87" className="mono-num">
            --
          </text>
        </g>
      );
      return (
        <>
          {backdrop}
          {showCity && (
            <text x="50" y="20" fontSize="7.5" fill={cityFill}>
              {city}
            </text>
          )}
          <text
            x="50"
            y={(showHighLow ? 51 : 62) + (showCity ? 2 : 0)}
            fontSize={(showHighLow ? 30 : 40) - (showCity ? 4 : 0)}
            fontWeight="600"
            fill={main}
            className="mono-num"
          >
            --°
          </text>
          {showHighLow && reading(33, "High", color(p.highColor, main))}
          {showHighLow && reading(67, "Low", color(p.lowColor, main))}
        </>
      );
    }

    case "ticker":
      return (
        <>
          <text x="50" y="40" fontSize="11" fontWeight="600" letterSpacing=".4">
            {str(p.symbol, "Symbol")}
          </text>
          <polyline
            points="22,66 32,60 40,64 50,54 60,58 70,48 78,52" fill="none" stroke="#5ee07a"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
        </>
      );

    case "screensaver":
    case "asteroids":
      return screensaver(control === "asteroids" ? "asteroids" : str(p.effect, "asteroids"), p);

    case "countdown": {
      const remaining = num(p.remainingSeconds, num(p.durationSeconds, 0));
      const total = num(p.durationSeconds, 0);
      const accent = color(p.color, "#19e0ff");
      const left = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
      const clock = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`;
      return (
        <>
          <circle cx="50" cy="50" r="40" fill="none" stroke={TRACK} strokeWidth="5" />
          {left > 0 && (
            <circle
              cx="50" cy="50" r="40" fill="none" stroke={accent} strokeWidth="5" pathLength={100}
              strokeDasharray={`${(left * 100).toFixed(2)} 100`} transform="rotate(-90 50 50)"
            />
          )}
          <text x="50" y="57" fontSize="20" fontWeight="600" className="mono-num">
            {clock}
          </text>
          <text x="50" y="71" fontSize="8" fill={DIM} letterSpacing=".8">
            {str(p.label).toUpperCase()}
          </text>
        </>
      );
    }

    case "makapix": {
      // The device shows whatever artwork is current, which this doesn't
      // fetch — a sample block of pixels stands in for "some pixel art".
      const PIXELS = [
        "#ff5fd2", "#ff5fd2", "#19e0ff", "#19e0ff",
        "#ff5fd2", "#2a3238", "#2a3238", "#19e0ff",
        "#ffc21a", "#2a3238", "#2a3238", "#5ee07a",
        "#ffc21a", "#ffc21a", "#5ee07a", "#5ee07a",
      ];
      const size = 72 / 4;
      return (
        <>
          <rect x="14" y="14" width="72" height="72" fill="#000" />
          {PIXELS.map((fill, i) => (
            <rect
              key={i}
              x={14 + (i % 4) * size}
              y={14 + Math.floor(i / 4) * size}
              width={size}
              height={size}
              fill={fill}
            />
          ))}
        </>
      );
    }

    case "claudeUsage":
      return claudeUsage(p, feedValue);

    case "custom":
      // A plain string is drawn as centered text on the device; anything
      // else is a list of drawing primitives this doesn't try to render.
      return typeof p.data === "string" && p.data ? (
        <text x="50" y="54" fontSize="11" fontWeight="600">
          {p.data.length > 14 ? `${p.data.slice(0, 13)}…` : p.data}
        </text>
      ) : (
        <text x="50" y="57" fontSize="22" fill={DIM} className="mono-num">
          {"{ }"}
        </text>
      );

    default:
      return null;
  }
}

// ClaudeUsageControl's colours: the logo and session, and the week.
const CLAUDE_ORANGE = "#d97757";
const CLAUDE_SAND = "#eadfca";

/** The Claude spark: twelve tapered rays of uneven length. */
function spark(x: number, y: number, r: number, fill: string): ReactNode {
  const rays = [1, 0.78, 0.93, 0.72, 0.98, 0.8, 0.9, 0.7, 1, 0.76, 0.94, 0.82];
  return rays.map((length, i) => (
    <line
      key={i} x1={x} y1={y - r * 0.08} x2={x} y2={y - r * length}
      stroke={fill} strokeWidth={r * 0.16} strokeLinecap="round"
      transform={`rotate(${i * 30 + 7} ${x} ${y})`}
    />
  ));
}

function claudeUsage(p: Record<string, unknown>, feedValue: (id: string) => number | undefined): ReactNode {
  // The claude.* feed, as the device will show it; without one, whatever the
  // params hold (the control picker's sample).
  const reading = (param: ClaudeUsageReading): number | undefined => {
    const value = feedValue(CLAUDE_USAGE_FEEDS[param]) ?? (typeof p[param] === "number" ? (p[param] as number) : undefined);
    return value === undefined ? undefined : Math.max(0, Math.min(100, value));
  };
  const session = reading("session");
  const week = reading("week");
  const logo = session === undefined && week === undefined ? DIM : CLAUDE_ORANGE;
  const label = (v: number | undefined) => (v === undefined ? "--" : `${Math.round(v)}%`);
  const style = str(p.style, "pace");

  if (style === "orbit") {
    const ring = (r: number, v: number | undefined, stroke: string) => (
      <>
        <circle cx="50" cy="50" r={r} fill="none" stroke={TRACK} strokeWidth="1.2" />
        {v !== undefined && v > 0 && (
          <circle
            cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round"
            pathLength={100} strokeDasharray={`${v.toFixed(2)} 100`} transform="rotate(-90 50 50)"
          />
        )}
      </>
    );
    return (
      <>
        {ring(46.5, week, CLAUDE_SAND)}
        {ring(41, session, CLAUDE_ORANGE)}
        {spark(50, 32, 11, logo)}
        <text x="32.5" y="59" fontSize="12" fontWeight="600" fill={CLAUDE_ORANGE} className="mono-num">
          {label(session)}
        </text>
        <text x="67.5" y="59" fontSize="12" fontWeight="600" fill={CLAUDE_SAND} className="mono-num">
          {label(week)}
        </text>
        <text x="32.5" y="68" fontSize="4.5" letterSpacing=".4">SESSION</text>
        <text x="67.5" y="68" fontSize="4.5" letterSpacing=".4">WEEK</text>
      </>
    );
  }

  if (style === "tanks") {
    const level = (v: number | undefined) => 98 - (v ?? 0) * 0.97;
    return (
      <>
        <clipPath id="claude-tanks">
          <circle cx="50" cy="50" r="49.5" />
        </clipPath>
        <g clipPath="url(#claude-tanks)">
          <rect x="0" y={level(session)} width="49" height="100" fill="#5c3024" />
          <rect x="0" y={level(session) - 0.4} width="49" height="0.9" fill={CLAUDE_ORANGE} />
          <rect x="51" y={level(week)} width="49" height="100" fill="#4b463c" />
          <rect x="51" y={level(week) - 0.4} width="49" height="0.9" fill={CLAUDE_SAND} />
        </g>
        <circle cx="50" cy="22.5" r="10.5" fill={GLASS} />
        {spark(50, 22.5, 8.5, logo)}
        <text x="26" y="55" fontSize="12" fontWeight="600" className="mono-num">{label(session)}</text>
        <text x="74" y="55" fontSize="12" fontWeight="600" className="mono-num">{label(week)}</text>
        <text x="26" y="63" fontSize="4.5" letterSpacing=".4">SESSION</text>
        <text x="74" y="63" fontSize="4.5" letterSpacing=".4">WEEK</text>
      </>
    );
  }

  // pace
  const row = (y: number, name: string, v: number | undefined, fill: string) => (
    <g key={name}>
      <text x="12" y={y} fontSize="5" textAnchor="start" letterSpacing=".4">{name}</text>
      <text x="88" y={y + 0.5} fontSize="11" fontWeight="600" textAnchor="end" fill={fill} className="mono-num">
        {label(v)}
      </text>
      <rect x="12" y={y + 5.5} width="76" height="3.3" fill={TRACK} />
      {v !== undefined && <rect x="12" y={y + 5.5} width={(76 * v) / 100} height="3.3" fill={fill} />}
    </g>
  );
  return (
    <>
      {spark(34.5, 18, 6.5, logo)}
      <text x="44" y="21.5" fontSize="9" textAnchor="start">Claude</text>
      {row(36, "SESSION", session, CLAUDE_ORANGE)}
      {row(61, "WEEK", week, CLAUDE_SAND)}
    </>
  );
}

function screensaver(effect: string, p: Record<string, unknown>): ReactNode {
  switch (effect) {
    case "matrix": {
      const rain = color(p.color, "#22d04a");
      return Array.from({ length: 9 }, (_, column) => {
        const head = 24 + ((column * 37) % 60);
        return Array.from({ length: 6 }, (_, k) => (
          <rect
            key={`${column}-${k}`} x={12 + column * 9} y={head - k * 7} width="4" height="5"
            fill={k ? rain : WHITE} opacity={1 - k / 6}
          />
        ));
      });
    }
    case "warp": {
      const rings = color(p.color, "#86c1ed");
      return (
        <>
          {[8, 17, 27, 38, 48].map((r) => (
            <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={rings} strokeWidth={r / 22 + 0.3} opacity={r / 50} />
          ))}
          {Array.from({ length: 10 }, (_, k) => {
            const angle = k * 0.63 + 1;
            const r = 8 + ((k * 13) % 36);
            return (
              <line
                key={k} stroke={WHITE} strokeWidth=".8"
                x1={50 + r * Math.cos(angle)} y1={50 + r * Math.sin(angle)}
                x2={50 + r * 1.2 * Math.cos(angle)} y2={50 + r * 1.2 * Math.sin(angle)}
              />
            );
          })}
        </>
      );
    }
    case "orrery":
      return (
        <>
          <circle cx="50" cy="50" r="6" fill={color(p.color, "#ffc21a")} />
          {(
            [
              [14, 0.6, "#8fb8ff", 2.2],
              [23, 2.4, "#ff8a5c", 3],
              [33, 4.1, "#7de0c0", 2.6],
              [42, 5.3, "#d6b3ff", 2],
            ] as const
          ).map(([r, angle, fill, size]) => (
            <g key={r}>
              <circle cx="50" cy="50" r={r} fill="none" stroke="#2a3238" strokeWidth=".7" />
              <circle cx={50 + r * Math.cos(angle)} cy={50 + r * Math.sin(angle)} r={size} fill={fill} />
            </g>
          ))}
        </>
      );
    case "radar": {
      const scope = color(p.color, "#3cff6e");
      return (
        <>
          <g fill="none" stroke={scope} strokeWidth=".7" opacity=".45">
            <circle cx="50" cy="50" r="14" />
            <circle cx="50" cy="50" r="28" />
            <circle cx="50" cy="50" r="42" />
            <line x1="8" y1="50" x2="92" y2="50" />
            <line x1="50" y1="8" x2="50" y2="92" />
          </g>
          <line x1="50" y1="50" x2="50" y2="8" stroke={scope} strokeWidth="1.4" transform="rotate(48 50 50)" />
          <circle cx="68" cy="34" r="1.8" fill={scope} />
          <circle cx="30" cy="62" r="1.8" fill={scope} opacity=".5" />
        </>
      );
    }
    case "cycle":
      return (
        <>
          <path
            d="M50 24a26 26 0 1 1-24.6 17.6" fill="none" stroke={DIM} strokeWidth="4" strokeLinecap="round"
          />
          <polygon points="18,34 31,37 24,48" fill={DIM} />
          <text x="50" y="54" fontSize="9" fontWeight="600">
            CYCLE
          </text>
        </>
      );
    default: {
      const planet = color(p.color, "#ff8a1f");
      return (
        <>
          {(
            [
              [20, 30], [70, 22], [82, 58], [30, 74], [55, 84], [14, 54], [62, 40],
            ] as const
          ).map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".8" fill={WHITE} />
          ))}
          <ellipse cx="50" cy="52" rx="19" ry="5" fill="none" stroke={planet} strokeWidth="1.2" opacity=".7" />
          <circle cx="50" cy="52" r="11" fill={planet} />
          <polygon points="22,40 28,36 31,42 26,46" fill="none" stroke={WHITE} strokeWidth=".9" />
          <polygon points="72,70 79,68 80,75 74,77" fill="none" stroke={WHITE} strokeWidth=".9" />
        </>
      );
    }
  }
}

/**
 * The clock as the orb draws it: the saved clock face the screen picks
 * (`clockFaceId`), or else the built-in one it names (`clockFace`, classic
 * with its colour params by default) — which is also what the orb falls
 * back to when it doesn't hold the file.
 */
function AnalogClockPreview({ params: p, now }: { params: Record<string, unknown>; now: Date }) {
  const face = useClockFacesStore((s) => s.faces.find((f) => f.id === p.clockFaceId));
  const drawing = face ? drawingFor(face.recipe) : builtInDrawing(str(p.clockFace, "classic"), p);
  return (
    <g transform="scale(0.416667)">
      <ClockFaceLayer
        drawing={drawing}
        now={now}
        options={{ seconds: p.seconds !== false, timeZone: str(p.timeZone), zone2: str(p.zone2) }}
      />
    </g>
  );
}
