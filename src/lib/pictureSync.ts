import { listOrbPictures, uploadPicture } from "./tauriCommands";
import { describeOrbitError, type BulkScreenSlotInput, type OrbitError, type ScreenSlot, type ScreenSlotInput } from "./types";
import { loadedPictures } from "../stores/picturesStore";
import { useDeviceStore } from "../stores/deviceStore";
import { useToastStore } from "../stores/toastStore";

// Getting pictures onto the orb. A picture screen lists its pictures by
// hash; the files go separately, to the orb's picture store (PUT
// /pictures/{hash}), shared by every screen. Uploads are slow (the orb
// writes its flash at ~40-50 KB/s and answers nothing else meanwhile), so
// only what it lacks is sent, one at a time, before the screen write that
// lists them (orbit-station's docs/pictures.md).

const PROGRESS_TOAST = "pictures-send";

/** The pictures a screen's settings list. */
export function listedPictures(params: Record<string, unknown>): string[] {
  return Array.isArray(params.pictures) ? params.pictures.filter((h): h is string => typeof h === "string") : [];
}

/**
 * Whether a picture screen lists pictures the orb doesn't hold (a reflashed
 * or wiped board, or one that cleared them for room): Apply has to send
 * them, even with no settings changed.
 */
export function picturesMissing(live: ScreenSlot | undefined, draft: ScreenSlotInput | undefined): boolean {
  if (!live?.picturesMissing?.length || !draft || draft.control !== "picture") return false;
  const missing = live.picturesMissing;
  return listedPictures(draft.params).some((h) => missing.includes(h));
}

export interface SentPictures {
  /** How many were uploaded. */
  sent: number;
  /**
   * Pictures the slots list that the orb doesn't hold and this app doesn't
   * have (added on another computer, or deleted here): the orb skips them.
   */
  unavailable: string[];
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * Sends the pictures `slots` list that the orb doesn't hold, before those
 * slots are written. Shows its progress in a toast, since a big GIF takes
 * ~20 s. Throws a plain message naming the picture.
 */
export async function sendPictures(slots: BulkScreenSlotInput[]): Promise<SentPictures> {
  const wanted = [...new Set(slots.filter((s) => s.control === "picture").flatMap((s) => listedPictures(s.params)))];
  // Firmware without a picture store has nowhere to put one.
  if (wanted.length === 0 || !useDeviceStore.getState().capabilities?.pictures) return { sent: 0, unavailable: [] };

  const store = await listOrbPictures();
  const held = new Set(store.pictures.map((p) => p.hash));
  const library = await loadedPictures();
  const lacking = wanted.filter((h) => !held.has(h));
  const toSend = lacking.flatMap((h) => library.filter((p) => p.hash === h));
  const unavailable = lacking.filter((h) => !library.some((p) => p.hash === h));
  if (toSend.length === 0) return { sent: 0, unavailable };

  // roomBytes counts what unused pictures would give up, oldest first, and
  // each one sent here is newer than those: if they all fit, none of them
  // pushes out another before the screen write lists it.
  const needed = toSend.reduce((sum, p) => sum + p.bytes, 0);
  if (needed > store.roomBytes) {
    throw `Not enough room on the orb for ${toSend.length === 1 ? "this picture" : "these pictures"}: ${mb(needed)} to send, ${mb(store.roomBytes)} free. Take some pictures off its screens and apply that first, or use fewer or smaller ones.`;
  }

  const toasts = useToastStore.getState();
  try {
    for (const [i, picture] of toSend.entries()) {
      toasts.show({
        key: PROGRESS_TOAST,
        tone: "ok",
        title: toSend.length === 1 ? "Sending a picture to the orb" : `Sending pictures to the orb: ${i + 1} of ${toSend.length}`,
        detail: `${picture.name}. The orb pauses everything else until it's stored.`,
      });
      try {
        await uploadPicture(picture.hash);
      } catch (err) {
        const e = err as OrbitError;
        const outOfRoom = e?.kind === "DeviceRejected" && e.message.status === 507;
        const why = outOfRoom ? "the orb is out of room." : describeOrbitError(err);
        throw `Couldn't send the picture '${picture.name}': ${why}`;
      }
    }
  } finally {
    toasts.dismiss(PROGRESS_TOAST);
  }
  return { sent: toSend.length, unavailable };
}

/** The warning for pictures that couldn't be sent, or null if there were none. */
export function unavailableWarning(unavailable: string[]): { title: string; detail: string } | null {
  if (unavailable.length === 0) return null;
  const one = unavailable.length === 1;
  return {
    title: one ? "A picture wasn't sent" : `${unavailable.length} pictures weren't sent`,
    detail: `${one ? "It isn't" : "They aren't"} in this app's picture library, so the orb skips ${one ? "it" : "them"}. Add ${one ? "it" : "them"} here again to send ${one ? "it" : "them"}.`,
  };
}
