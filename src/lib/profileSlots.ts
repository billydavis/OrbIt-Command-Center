import type { BulkScreenSlotInput, ScreenSlotInput } from "./types";

// What a profile holds: whatever the designer currently shows (the draft,
// not necessarily what's live on the device yet). countdown screens are
// excluded: a profile is a full-state layout meant to be bulk-applied later,
// and countdown's live {label, durationSeconds, state, remainingSeconds}
// shape isn't valid input for that (it needs params.action, see
// CountdownForm.tsx) — same reasoning as excluding it from Apply Layout.
export function profileSlotsFromDraft(draft: Record<number, ScreenSlotInput>): BulkScreenSlotInput[] {
  return Object.entries(draft)
    .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
    .filter((s) => s.control !== "countdown");
}
