import { SCREEN_COUNT, type ScreenSlot } from "../../lib/types";
import { ScreenTile } from "./ScreenTile";

interface ScreenGridProps {
  screens: ScreenSlot[];
}

// Renders the 5 slots read-only for now (step 3 of the build plan: prove the
// connect -> GET /screens -> render round-trip before adding editing).
export function ScreenGrid({ screens }: ScreenGridProps) {
  const bySlot = new Map(screens.map((s) => [s.screen, s]));

  return (
    <div className="screen-grid">
      {Array.from({ length: SCREEN_COUNT }, (_, i) => (
        <ScreenTile key={i} index={i} slot={bySlot.get(i)} />
      ))}
    </div>
  );
}
