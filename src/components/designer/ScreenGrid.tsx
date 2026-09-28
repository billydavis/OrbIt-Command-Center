import { SCREEN_COUNT } from "../../lib/types";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { ScreenTile } from "./ScreenTile";

interface ScreenGridProps {
  selected: number | null;
  onSelect: (index: number) => void;
}

export function ScreenGrid({ selected, onSelect }: ScreenGridProps) {
  const draft = useLayoutDraftStore((s) => s.draft);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);

  return (
    <div className={`screen-grid${selected !== null ? " screen-grid-has-selection" : ""}`}>
      {Array.from({ length: SCREEN_COUNT }, (_, i) => (
        <ScreenTile
          key={i}
          index={i}
          slot={draft[i] ? { screen: i, updatedAt: 0, ...draft[i] } : undefined}
          selected={selected === i}
          dirty={isDirty(i)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
