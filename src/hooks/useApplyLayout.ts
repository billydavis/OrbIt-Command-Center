import { useEffect, useState } from "react";
import { applyLayout } from "../lib/tauriCommands";
import { COLORS_UNSUPPORTED_MESSAGE, colorsNotApplied } from "../lib/rgb565";
import { describeOrbitError, isConnectionLost, type BulkScreenSlotInput } from "../lib/types";
import { useDeviceStore } from "../stores/deviceStore";
import { useLayoutDraftStore } from "../stores/layoutDraftStore";

const APPLY_SUCCESS_AUTO_DISMISS_MS = 3_000;

/**
 * Apply Layout and Discard, with what there is to say about the last
 * apply. Shared by the main window's header and the tray flyout's bar,
 * which each show it their own way.
 */
export function useApplyLayout() {
  const connected = useDeviceStore((s) => s.status === "connected");
  const markLost = useDeviceStore((s) => s.markLost);
  const draft = useLayoutDraftStore((s) => s.draft);
  const isDirty = useLayoutDraftStore((s) => s.isDirty);
  const patchLive = useLayoutDraftStore((s) => s.patchLive);
  const discardAllDrafts = useLayoutDraftStore((s) => s.discardAllDrafts);

  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An apply the device accepted but didn't fully honor (see colorsNotApplied).
  const [warning, setWarning] = useState<string | null>(null);
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
    // screens are sent, since bulk POST replaces exactly what's given.
    const toApply: BulkScreenSlotInput[] = Object.entries(draft)
      .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
      .filter((s) => s.control !== "countdown" && isDirty(s.screen));

    if (toApply.length === 0) return;

    setApplying(true);
    setError(null);
    try {
      const applied = await applyLayout(toApply);
      applied.forEach(patchLive);
      const colorsIgnored = applied.some((slot) => {
        const sent = toApply.find((s) => s.screen === slot.screen);
        return sent !== undefined && colorsNotApplied(sent, slot);
      });
      setWarning(colorsIgnored ? COLORS_UNSUPPORTED_MESSAGE : null);
      setSuccessMessage(`Applied ${applied.length} screen${applied.length === 1 ? "" : "s"} to device`);
    } catch (err) {
      setError(describeOrbitError(err));
      if (isConnectionLost(err)) markLost(describeOrbitError(err));
    } finally {
      setApplying(false);
    }
  }

  function discard() {
    discardAllDrafts();
    setError(null);
  }

  const dirtyCount = connected
    ? [0, 1, 2, 3, 4].filter((i) => isDirty(i) && draft[i]?.control !== "countdown").length
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
