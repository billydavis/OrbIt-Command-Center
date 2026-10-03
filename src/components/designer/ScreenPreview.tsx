import { useEffect, useState, type ReactNode } from "react";
import { boundFeed } from "../../lib/feedBindings";
import { rgb565ToHex } from "../../lib/rgb565";
import type { Feed } from "../../lib/types";
import { useFeedsStore } from "../../stores/feedsStore";

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

    case "analogClock": {
      const tick = color(p.tickColor, WHITE);
      const second = color(p.secondColor, "#ff3b30");
      const hourAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
      return (
        <>
          <circle cx="50" cy="50" r="50" fill={color(p.background, GLASS)} />
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1="50"
              y1="10"
              x2="50"
              y2={i % 3 ? 14 : 17}
              stroke={tick}
              strokeWidth={i % 3 ? 1 : 2}
              transform={`rotate(${i * 30} 50 50)`}
            />
          ))}
          <line
            x1="50" y1="50" x2="50" y2="28" strokeWidth="3.2" strokeLinecap="round"
            stroke={color(p.hourColor, WHITE)} transform={`rotate(${hourAngle} 50 50)`}
          />
          <line
            x1="50" y1="50" x2="50" y2="17" strokeWidth="2.2" strokeLinecap="round"
            stroke={color(p.minuteColor, WHITE)} transform={`rotate(${now.getMinutes() * 6} 50 50)`}
          />
          <line
            x1="50" y1="56" x2="50" y2="15" strokeWidth="1"
            stroke={second} transform={`rotate(${now.getSeconds() * 6} 50 50)`}
          />
          <circle cx="50" cy="50" r="2.2" fill={second} />
        </>
      );
    }

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
      return (
        <>
          {icon(0, 0.6)}
          <text x="50" y="66" fontSize="12" fontWeight="600">
            {element === "temperature" ? "Temperature" : "Condition"}
          </text>
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
