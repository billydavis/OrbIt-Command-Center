import { sendClockFaces } from "./clockFaceSync";
import { sendPictures } from "./pictureSync";
import { applyLayout } from "./tauriCommands";
import type { Profile, ScreenSlot } from "./types";
import { useLayoutDraftStore } from "../stores/layoutDraftStore";

/**
 * Writes a saved profile to the orb, sending the clock faces it uses first
 * to the screens that don't hold them, and the pictures it uses that the
 * orb doesn't hold. A profile keeps a clock face by its
 * id, so it shows the clock face as it was last edited, not as it was when
 * the profile was saved.
 */
export async function applyProfile(profile: Profile): Promise<ScreenSlot[]> {
  const { slots } = await sendClockFaces(profile.slots, useLayoutDraftStore.getState().live);
  await sendPictures(slots);
  return applyLayout(slots);
}
