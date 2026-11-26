import { useEffect } from "react";
import { wantedHash } from "../lib/clockFaceSync";
import { useClockFacesStore } from "../stores/clockFacesStore";
import { useLayoutDraftStore } from "../stores/layoutDraftStore";

/**
 * Keeps each screen showing a saved clock face asking for that clock face
 * as it's drawn now. Editing one changes its file, and so its hash: every
 * screen using it then reads as changed, and the next Apply sends it.
 * Also loads the saved clock faces for the window it runs in.
 */
export function useClockFaceDrafts() {
  const hashes = useClockFacesStore((s) => s.hashes);
  const loaded = useClockFacesStore((s) => s.loaded);
  const refresh = useClockFacesStore((s) => s.refresh);
  const draft = useLayoutDraftStore((s) => s.draft);
  const replaceDraftSlot = useLayoutDraftStore((s) => s.replaceDraftSlot);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    for (const [screenStr, input] of Object.entries(draft)) {
      if (input.control !== "analogClock") continue;
      const id = input.params.clockFaceId;
      if (typeof id !== "string" || !id) continue;
      const hash = hashes[id];
      if (hash && wantedHash(input.params) !== hash) {
        replaceDraftSlot(Number(screenStr), { ...input, params: { ...input.params, clockFaceHash: hash } });
      }
    }
  }, [draft, hashes, replaceDraftSlot]);
}
