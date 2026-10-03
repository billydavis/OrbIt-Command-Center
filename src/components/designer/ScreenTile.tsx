import type { ControlType, ScreenSlot } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";
import { boundFeeds } from "../../lib/feedBindings";

interface ScreenTileProps {
  index: number;
  slot?: ScreenSlot;
  selected: boolean;
  dirty: boolean;
  onSelect: (index: number) => void;
}

// One round tile standing in for one of the device's physical screens.
// Position alone identifies which screen this is (they're laid out in
// device order), so the tile carries no index number or "Screen N" text —
// just the assigned control's name and the dirty dot. controlIcons.tsx has
// a drawn glyph per control ready to swap in here, but those need a design
// pass before they're user-facing — text label stands in until then.
export function ScreenTile({ index, slot, selected, dirty, onSelect }: ScreenTileProps) {
  const control = (slot?.control as ControlType | undefined) ?? "blank";
  const label = CONTROL_LABELS[control] ?? slot?.control ?? "Unassigned";
  // The feed(s) this screen follows, if any — what makes two gauge tiles
  // tell apart at a glance.
  const feeds = slot ? Object.values(boundFeeds(slot.params)) : [];
  const description = feeds.length > 0 ? `${label}, following ${feeds.join(", ")}` : label;

  return (
    <button
      type="button"
      className={`screen-tile${selected ? " screen-tile-selected" : ""}`}
      onClick={() => onSelect(index)}
      aria-pressed={selected}
      aria-label={`Screen ${index}: ${description}`}
      title={`Screen ${index}: ${description}`}
    >
      <div className="screen-tile-circle">
        {dirty && <span className="screen-tile-dirty-dot" title="Unsaved changes" />}
        <span className="screen-tile-control">{label}</span>
        {feeds.length > 0 && <span className="screen-tile-feed">{feeds.join(", ")}</span>}
      </div>
    </button>
  );
}
