import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  CLAUDE_USAGE_FEEDS,
  CLAUDE_USAGE_STYLES,
  claudeUsageParamsSchema,
  type ClaudeUsageReading,
  type ClaudeUsageStyle,
} from "../../lib/controlSchemas";
import type { Feed } from "../../lib/types";
import { useFeedsStore } from "../../stores/feedsStore";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type.
type FormValues = z.input<typeof claudeUsageParamsSchema>;

const STYLE_LABELS: Record<ClaudeUsageStyle, string> = {
  pace: "Pace (bars, with how far through each window you are)",
  orbit: "Orbit (two rings with planets)",
  tanks: "Twin tanks (two tanks of liquid)",
};

const READINGS: { param: ClaudeUsageReading; label: string; time: boolean }[] = [
  { param: "session", label: "Session used", time: false },
  { param: "week", label: "Week used", time: false },
  { param: "sessionResetsAt", label: "Session resets", time: true },
  { param: "weekResetsAt", label: "Week resets", time: true },
];

/** "in 2h 14m", "in 3d 6h", or "passed": how the board will count it. */
function untilLabel(epochSeconds: number): string {
  const minutes = Math.ceil((epochSeconds * 1000 - Date.now()) / 60000);
  if (minutes <= 0) return "passed";
  if (minutes >= 1440) return `in ${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
  if (minutes >= 60) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `in ${minutes}m`;
}

function readingLabel(feed: Feed | undefined, time: boolean): string {
  if (!feed) return "—";
  return time ? untilLabel(feed.value) : `${Math.round(feed.value)}%`;
}

// Claude plan usage: Orbit Station's own control, offered only when the
// board reports it. Its only settings are how it looks; the readings always
// come from the claude.* feeds (bound on the Rust side, see built_in in
// src-tauri/src/feeds/bindings.rs), so they're shown here, not chosen.
export function ClaudeUsageForm({ initialParams, onChange }: ControlFormProps) {
  const { register, watch } = useForm<FormValues>({
    resolver: zodResolver(claudeUsageParamsSchema),
    defaultValues: {
      style: CLAUDE_USAGE_STYLES.includes(initialParams.style as ClaudeUsageStyle)
        ? (initialParams.style as ClaudeUsageStyle)
        : "pace",
      animate: initialParams.animate !== false,
    },
  });
  const feeds = useFeedsStore((s) => s.feeds);

  const values = watch();
  useEmitOnChange({ style: values.style, animate: values.animate }, onChange);

  const publishing = READINGS.some(({ param }) => feeds.some((f) => f.id === CLAUDE_USAGE_FEEDS[param]));

  return (
    <div className="control-form">
      <label className="field">
        Style
        <select {...register("style")}>
          {CLAUDE_USAGE_STYLES.map((style) => (
            <option key={style} value={style}>
              {STYLE_LABELS[style]}
            </option>
          ))}
        </select>
      </label>
      <label className="field-checkbox">
        <input type="checkbox" {...register("animate")} /> Animate while usage is changing
      </label>

      <div className="field-row">
        {READINGS.slice(0, 2).map(({ param, label, time }) => (
          <Reading key={param} param={param} label={label} time={time} feeds={feeds} />
        ))}
      </div>
      <div className="field-row">
        {READINGS.slice(2).map(({ param, label, time }) => (
          <Reading key={param} param={param} label={label} time={time} feeds={feeds} />
        ))}
      </div>

      {publishing ? (
        <p className="field-hint">
          From the claude.* feeds, which Claude Code's status line publishes after every reply.
          Readings are never saved on the board: after it restarts, the app sends them again as soon
          as it sees the board back.
        </p>
      ) : (
        <p className="field-hint">
          Nothing is publishing the claude.* feeds yet. Claude Code's status line can:
          examples/claude-usage-statusline.ps1 pushes them after every reply. Until then the screen
          says it's waiting for data.
        </p>
      )}
    </div>
  );
}

function Reading({
  param,
  label,
  time,
  feeds,
}: {
  param: ClaudeUsageReading;
  label: string;
  time: boolean;
  feeds: Feed[];
}) {
  const id = CLAUDE_USAGE_FEEDS[param];
  return (
    <label className="field">
      {label}
      <input
        className="mono-num"
        readOnly
        value={readingLabel(
          feeds.find((f) => f.id === id),
          time,
        )}
        title={`From the ${id} feed`}
      />
    </label>
  );
}
