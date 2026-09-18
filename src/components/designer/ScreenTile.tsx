import type { ScreenSlot } from "../../lib/types";

interface ScreenTileProps {
  index: number;
  slot?: ScreenSlot;
  selected: boolean;
  dirty: boolean;
  onSelect: (index: number) => void;
}

// One round tile standing in for one of the device's physical screens.
export function ScreenTile({ index, slot, selected, dirty, onSelect }: ScreenTileProps) {
  return (
    <button
      type="button"
      className={`screen-tile${selected ? " screen-tile-selected" : ""}`}
      onClick={() => onSelect(index)}
    >
      <div className="screen-tile-circle">
        {dirty && <span className="screen-tile-dirty-dot" title="Unsaved changes" />}
        <span className="screen-tile-index">{index}</span>
        <span className="screen-tile-control">{slot?.control ?? "…"}</span>
      </div>
      <span className="screen-tile-label">Screen {index}</span>
    </button>
  );
}
