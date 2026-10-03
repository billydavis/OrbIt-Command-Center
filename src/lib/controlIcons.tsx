import type { ControlType } from "./types";

interface ControlIconProps {
  control: ControlType;
  className?: string;
}

const SHARED_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// One glyph per device control, drawn rather than emoji so every tile reads
// consistently in currentColor against either tile fill. Position (which
// circle) plus icon (which control) is meant to be enough on its own — see
// CONTROL_LABELS for the text these stand in for, still used for the
// accessible name and the control picker.
const ICON_PATHS: Record<ControlType, React.ReactNode> = {
  blank: <circle cx="12" cy="12" r="7" strokeDasharray="2.5 3" />,
  time: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  analogClock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20" />
      <path d="M12 12l-2.5-4M12 12l4 1.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16l4-6.5" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sysMonitor: (
    <>
      <rect x="3.5" y="5" width="17" height="12" rx="1.5" />
      <path d="M8.5 20h7M12 17v3" />
      <path d="M7 14v-3M11 14V8M15 14v-5" />
    </>
  ),
  weather: (
    <>
      <path d="M9.5 8.2a3 3 0 1 1 0 6" />
      <path d="M6.8 17.5h9.7a3.2 3.2 0 0 0 .5-6.36 4.6 4.6 0 0 0-8.9-1.34 3.6 3.6 0 0 0-1.3 7.7z" />
    </>
  ),
  ticker: (
    <>
      <path d="M4 8h16M4 12h10M4 16h13" />
    </>
  ),
  custom: (
    <>
      <path d="M9 5 4 12l5 7" />
      <path d="M15 5l5 7-5 7" />
    </>
  ),
  screensaver: (
    <>
      <path d="M7.5 4.5 11 3.5l3.5 1.8 2.7 3.4-.8 3.6-2.7 2.7-4.4.9-3.6-1.7-1.8-3.6.8-3.6z" />
      <circle cx="10.5" cy="9.5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12.5" r=".6" fill="currentColor" stroke="none" />
    </>
  ),
  countdown: (
    <>
      <path d="M6.5 3h11M6.5 21h11" />
      <path d="M7.5 3c0 4 4.5 5.5 4.5 5.5S16.5 7 16.5 3" />
      <path d="M7.5 21c0-4 4.5-5.5 4.5-5.5s4.5 1.5 4.5 5.5" />
    </>
  ),
};

export function ControlIcon({ control, className }: ControlIconProps) {
  return (
    <svg {...SHARED_PROPS} width="30" height="30" className={className}>
      {ICON_PATHS[control] ?? ICON_PATHS.blank}
    </svg>
  );
}
