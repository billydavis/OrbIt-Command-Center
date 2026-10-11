import type { BulkScreenSlotInput, ScreenSlot, ScreenSlotInput } from "./types";

// What a profile holds: whatever the designer currently shows (the draft,
// not necessarily what's live on the device yet). countdown screens are
// excluded: a profile is a full-state layout meant to be bulk-applied later,
// and countdown's live {label, durationSeconds, state, remainingSeconds}
// shape isn't valid input for that (it needs params.action, see
// CountdownForm.tsx) — same reasoning as excluding it from Apply Layout.
//
// So is a screen that's only blank because the orb's firmware was built
// without its control (`savedControl`), while it's still left blank: the
// orb is keeping that screen's settings, and a profile that said "blank"
// there would throw them away each time it was applied.
export function profileSlotsFromDraft(
  draft: Record<number, ScreenSlotInput>,
  live: Record<number, ScreenSlot>,
): BulkScreenSlotInput[] {
  return Object.entries(draft)
    .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
    .filter((s) => s.control !== "countdown")
    .filter((s) => !(s.control === "blank" && live[s.screen]?.savedControl));
}
