import type { ControlType, ScreenSlot } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";
import { boundFeeds } from "../../lib/feedBindings";
import { ScreenPreview } from "./ScreenPreview";

interface ScreenTileProps {
  index: number;
  slot?: ScreenSlot;
  selected: boolean;
  dirty: boolean;
  onSelect: (index: number) => void;
}

// One round tile standing in for one of the device's physical screens: a
// drawing of what that screen shows (ScreenPreview), with its index and
// what's on it named underneath. A screen following a feed is named by the
// feed, since that's what tells two gauges apart.
export function ScreenTile({ index, slot, selected, dirty, onSelect }: ScreenTileProps) {
  const control = (slot?.control as ControlType | undefined) ?? "blank";
  const label = CONTROL_LABELS[control] ?? slot?.control ?? "Unassigned";
  const feeds = slot ? Object.values(boundFeeds(slot.params)) : [];
  const description = feeds.length > 0 ? `${label}, following ${feeds.join(", ")}` : label;

  return (
    <button
      type="button"
      className={`screen-tile${selected ? " screen-tile-selected" : ""}`}
      onClick={() => onSelect(index)}
      aria-pressed={selected}
      aria-label={`Screen ${index}: ${description}${dirty ? ", not applied yet" : ""}`}
      title={`Screen ${index}: ${description}`}
    >
      <div className="screen-tile-circle">
        <ScreenPreview control={slot?.control ?? "blank"} params={slot?.params ?? {}} />
        {dirty && <span className="screen-tile-dirty-dot" title="Unsaved changes" />}
      </div>
      <span className="screen-tile-nameplate">
        <span className="screen-tile-index mono-num">{index}</span>
        <span className={`screen-tile-control${feeds.length > 0 ? " screen-tile-feed" : ""}`}>
          {feeds.length > 0 ? feeds.join(", ") : label}
        </span>
      </span>
    </button>
  );
}
