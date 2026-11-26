import { useEffect, useState } from "react";
import { applyLayout } from "../lib/tauriCommands";
import { isNotBuiltError, listOf } from "../lib/capabilities";
import { clockFaceMissing, sendClockFaces } from "../lib/clockFaceSync";
import { COLORS_UNSUPPORTED_MESSAGE, colorsNotApplied } from "../lib/rgb565";
import { describeOrbitError, type BulkScreenSlotInput } from "../lib/types";
import { isCurrentConnection, useDeviceStore } from "../stores/deviceStore";
import { useLayoutDraftStore } from "../stores/layoutDraftStore";

const APPLY_SUCCESS_AUTO_DISMISS_MS = 3_000;

/**
 * Apply Layout and Discard, with what there is to say about the last
 * apply. Shared by the main window's header and the tray flyout's bar,
 * which each show it their own way.
 */
export function useApplyLayout() {
  const connected = useDeviceStore((s) => s.status === "connected");
  const refreshCapabilities = useDeviceStore((s) => s.refreshCapabilities);
  const draft = useLayoutDraftStore((s) => s.draft);
  const live = useLayoutDraftStore((s) => s.live);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);
  const patchLive = useLayoutDraftStore((s) => s.patchLive);
  const discardAllDrafts = useLayoutDraftStore((s) => s.discardAllDrafts);

  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An apply the device accepted but didn't fully honor (see colorsNotApplied).
  const [warning, setWarning] = useState<{ title: string; detail: string } | null>(null);
  // dirtyCount hits 0 the instant a successful apply resyncs draft to live,
  // which is also when the apply controls disappear — so success and "the
  // button is gone" happen in the same tick, with no window to show
  // confirmation on the button itself. Tracked separately here instead.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), APPLY_SUCCESS_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [successMessage]);

  async function apply() {
    // countdown is excluded from bulk apply — it's action-driven and always
    // applied directly (see ScreenEditor/CountdownForm) — and only dirty
    // screens are sent, since bulk POST replaces exactly what's given. So
    // is a screen whose clock face the orb doesn't hold (reflashed, say),
    // even with nothing else changed.
    const toApply: BulkScreenSlotInput[] = Object.entries(draft)
      .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
      .filter((s) => s.control !== "countdown" && needsApply(s.screen));

    if (toApply.length === 0) return;

    setApplying(true);
    setError(null);
    // Captured before the await: the user can disconnect or switch to a
    // different device while this POST is in flight, and its answer must
    // not land on whatever's connected by the time it comes back.
    const generation = useDeviceStore.getState().generation;
    try {
      const sent = await sendClockFaces(toApply, live);
      if (!isCurrentConnection(generation)) return;
      const applied = await applyLayout(sent.slots);
      if (!isCurrentConnection(generation)) return;
      applied.forEach(patchLive);
      const colorsIgnored = applied.some((slot) => {
        const sent = toApply.find((s) => s.screen === slot.screen);
        return sent !== undefined && colorsNotApplied(sent, slot);
      });
      const screens = listOf(sent.unavailable.map(String));
      setWarning(
        colorsIgnored
          ? { title: "Custom colors weren't applied", detail: COLORS_UNSUPPORTED_MESSAGE }
          : sent.unavailable.length > 0
            ? {
                title: "A clock face wasn't sent",
                detail: `The clock face for screen${sent.unavailable.length === 1 ? "" : "s"} ${screens} isn't saved in this app, so the orb shows its built-in clock face there. Pick a clock face to send one.`,
              }
            : null,
      );
      setSuccessMessage(`Applied ${applied.length} screen${applied.length === 1 ? "" : "s"} to device`);
    } catch (err) {
      if (!isCurrentConnection(generation)) return;
      setError(describeOrbitError(err));
      // The app offered something the orb doesn't have, so what it knows
      // about the orb's build is out of date.
      if (isNotBuiltError(err)) void refreshCapabilities();
    } finally {
      setApplying(false);
    }
  }

  function discard() {
    discardAllDrafts();
    setError(null);
  }

  function needsApply(screen: number) {
    return isDirty(screen) || clockFaceMissing(live[screen], draft[screen]);
  }

  const dirtyCount = connected
    ? [0, 1, 2, 3, 4].filter((i) => needsApply(i) && draft[i]?.control !== "countdown").length
    : 0;

  return {
    dirtyCount,
    applying,
    apply,
    discard,
    error,
    warning,
    successMessage,
    dismissError: () => setError(null),
    dismissWarning: () => setWarning(null),
    dismissSuccess: () => setSuccessMessage(null),
  };
}
