import type { ScreenSlot } from "../../lib/types";

interface ScreenTileProps {
  index: number;
  slot?: ScreenSlot;
}

// One round tile standing in for one of the device's physical screens.
export function ScreenTile({ index, slot }: ScreenTileProps) {
  return (
    <div className="screen-tile">
      <div className="screen-tile-circle">
        <span className="screen-tile-index">{index}</span>
        <span className="screen-tile-control">{slot?.control ?? "…"}</span>
      </div>
      <span className="screen-tile-label">Screen {index}</span>
    </div>
  );
}
