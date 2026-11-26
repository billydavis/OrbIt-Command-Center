import { useEffect, useId, useState } from "react";
import {
  as565,
  clockTime,
  DEFAULT_ZONE_LABEL,
  dialUrl,
  handAngles,
  placePart,
  WEEKDAYS,
  zoneAngle,
  zoneName,
  type DialSpec,
  type FaceDrawing,
  type Part,
  type SecondsRing,
  type TextSpot,
} from "../../lib/clockFaceRenderer";

export interface ClockFaceOptions {
  /** Show the second hand (the `seconds` param). */
  seconds?: boolean;
  sweep?: boolean;
  /** The hands' timezone (`timeZone`), "" for here. */
  timeZone?: string;
  /** A second timezone (`zone2`): its hand and name. */
  zone2?: string;
}

const FONT = "Roboto, 'Segoe UI', system-ui, sans-serif";

function useDialUrl(dial: DialSpec): string | null {
  const key = JSON.stringify(dial);
  const [url, setUrl] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    let live = true;
    dialUrl(dial).then(
      (made) => live && setUrl({ key, url: made }),
      () => {},
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // While a new picture is being made, the last one stays up rather than
  // flashing to nothing.
  return url?.url ?? null;
}

function Parts({ parts, deg }: { parts: Part[] | undefined; deg: number }) {
  if (!parts) return null;
  return (
    <>
      {parts.map((part, i) => {
        const { polygon, disc } = placePart(part, deg);
        const fill = as565(part.color);
        return (
          <g key={i} fill={fill}>
            {polygon && <polygon points={polygon.map((p) => p.join(",")).join(" ")} fillRule="nonzero" />}
            {disc && <circle cx={disc[0]} cy={disc[1]} r={disc[2]} />}
          </g>
        );
      })}
    </>
  );
}

// Where an outline crosses itself the board fills both loops (non-zero),
// so the polygons above do too.

/** The seconds ring as far as `deg`, from twelve: a round-capped arc. */
function Ring({ ring, deg }: { ring: SecondsRing; deg: number }) {
  if (deg <= 0) return null;
  const c = 120.5, r = ring.radius;
  const stroke = { fill: "none", stroke: as565(ring.color), strokeWidth: ring.width };
  if (deg >= 360) return <circle cx={c} cy={c} r={r} {...stroke} />;
  const a = (deg * Math.PI) / 180;
  const end = `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`;
  return <path d={`M ${c} ${c - r} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${end}`} strokeLinecap="round" {...stroke} />;
}

function Text({ spot, children }: { spot: TextSpot; children: string }) {
  return (
    <text
      x={spot.x + 0.5}
      y={spot.y + 0.5}
      fontSize={spot.size}
      fill={as565(spot.color)}
      fontFamily={FONT}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {children}
    </text>
  );
}

/**
 * One clock face at a moment, in the 240x240 pixels of the board's screen:
 * the still picture, then what the board draws over it in the order it
 * draws it (date, weekday and the second zone's name go into its copy of
 * the dial; then the seconds ring, the second zone's hand, hour, minute, second and cap).
 * An SVG group, for putting inside an <svg> with room for 240x240.
 */
export function ClockFaceLayer({ drawing, now, options = {} }: { drawing: FaceDrawing; now: Date; options?: ClockFaceOptions }) {
  const clip = useId();
  const url = useDialUrl(drawing.dial);
  const t = clockTime(now, options.timeZone);
  const a = handAngles(t, !!options.sweep);
  const zone2 = options.zone2 ? clockTime(now, options.zone2) : null;
  const date = drawing.date;
  const w = date?.width ?? 30, h = date?.height ?? 22;

  return (
    <g>
      <clipPath id={clip}>
        <circle cx="120" cy="120" r="120" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="240" height="240" fill={as565(drawing.dial.backgroundColor)} />
        {url && <image href={url} width="240" height="240" style={{ imageRendering: "pixelated" }} />}
      </g>
      {date && (
        <g>
          {date.background && (
            <rect x={date.x - Math.floor(w / 2)} y={date.y - Math.floor(h / 2)} width={w} height={h} fill={as565(date.background)} />
          )}
          {date.border && (
            <rect
              x={date.x - Math.floor(w / 2) + 0.5} y={date.y - Math.floor(h / 2) + 0.5} width={w - 1} height={h - 1}
              fill="none" stroke={as565(date.border)} strokeWidth="1"
            />
          )}
          <Text spot={date}>{String(t.day)}</Text>
        </g>
      )}
      {drawing.weekday && <Text spot={drawing.weekday}>{WEEKDAYS[t.weekday]}</Text>}
      {zone2 && options.zone2 && drawing.hands.zone && (
        <Text spot={drawing.zoneLabel ?? DEFAULT_ZONE_LABEL}>{zoneName(options.zone2)}</Text>
      )}
      {options.seconds !== false && drawing.secondsRing && <Ring ring={drawing.secondsRing} deg={a.second} />}
      {zone2 && <Parts parts={drawing.hands.zone} deg={zoneAngle(zone2)} />}
      <Parts parts={drawing.hands.hour} deg={a.hour} />
      <Parts parts={drawing.hands.minute} deg={a.minute} />
      {options.seconds !== false && <Parts parts={drawing.hands.second} deg={a.second} />}
      <Parts parts={drawing.cap} deg={0} />
    </g>
  );
}

/** A clock face on its own, round, filling its box. */
export function ClockFaceView({
  drawing,
  now,
  options,
  className,
}: {
  drawing: FaceDrawing;
  now: Date;
  options?: ClockFaceOptions;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 240 240" aria-hidden="true">
      <ClockFaceLayer drawing={drawing} now={now} options={options} />
    </svg>
  );
}

/** Ten past ten, the way watches are photographed: the hands frame the dial. */
export function thumbnailTime(): Date {
  const d = new Date();
  d.setHours(10, 9, 36, 0);
  return d;
}

/** The time now, ticking each second, or ten times a second for a sweep. */
export function useClockNow(running: boolean, sweep = false): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => setNow(new Date()), sweep && !reduce ? 100 : 1000);
    return () => clearInterval(timer);
  }, [running, sweep]);
  return now;
}
