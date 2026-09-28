import type { ControlType, ScreenSlot } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";

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

  return (
    <button
      type="button"
      className={`screen-tile${selected ? " screen-tile-selected" : ""}`}
      onClick={() => onSelect(index)}
      aria-pressed={selected}
      aria-label={`Screen ${index}: ${label}`}
      title={`Screen ${index}: ${label}`}
    >
      <div className="screen-tile-circle">
        {dirty && <span className="screen-tile-dirty-dot" title="Unsaved changes" />}
        <span className="screen-tile-control">{label}</span>
      </div>
    </button>
  );
}
