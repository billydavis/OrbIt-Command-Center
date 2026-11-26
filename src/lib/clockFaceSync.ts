import { clockFaceFile } from "./clockFaceRenderer";
import { uploadClockFace } from "./tauriCommands";
import { describeOrbitError, type BulkScreenSlotInput, type ScreenSlot, type ScreenSlotInput } from "./types";
import { loadedClockFaces } from "../stores/clockFacesStore";
import { useDeviceStore } from "../stores/deviceStore";

// Getting clock faces onto the orb. A screen picks an uploaded clock face
// with its `clockFaceId` and `clockFaceHash` params, but the file itself
// goes separately (PUT /screens/{n}/clock-face), one per screen, and only
// when the orb doesn't already hold it: each upload writes its flash.

/** The clock face file a screen's settings ask for, or "" for a built-in one. */
export function wantedHash(params: Record<string, unknown>): string {
  return typeof params.clockFaceHash === "string" ? params.clockFaceHash : "";
}

/**
 * Whether a screen asks for a clock face file the orb doesn't hold (a new
 * pick, an edited clock face, or a reflashed board): Apply has to send it.
 */
export function clockFaceMissing(live: ScreenSlot | undefined, draft: ScreenSlotInput | undefined): boolean {
  if (!live || !draft || draft.control !== "analogClock") return false;
  const wanted = wantedHash(draft.params);
  return wanted !== "" && live.clockFaceHeld !== undefined && live.clockFaceHeld !== wanted;
}

export interface SentClockFaces {
  /** `slots`, with each clock face's hash as it's drawn now. */
  slots: BulkScreenSlotInput[];
  /**
   * Screens asking for a clock face this app doesn't have saved (deleted,
   * or made on another computer) and the orb doesn't hold: they'll show
   * their built-in clock face.
   */
  unavailable: number[];
}

/**
 * Sends the clock faces `slots` use to the screens that need them, before
 * those slots are written. One at a time: the orb handles one request at a
 * time anyway. Throws a plain message naming the clock face and screen.
 */
export async function sendClockFaces(
  slots: BulkScreenSlotInput[],
  live: Record<number, ScreenSlot>,
): Promise<SentClockFaces> {
  const wanting = slots.filter((s) => s.control === "analogClock" && typeof s.params.clockFaceId === "string" && s.params.clockFaceId);
  // Firmware without clock face files has nowhere to put one.
  if (wanting.length === 0 || !useDeviceStore.getState().capabilities?.clockFaces) return { slots, unavailable: [] };

  const faces = await loadedClockFaces();
  const unavailable: number[] = [];
  const out: BulkScreenSlotInput[] = [];
  for (const slot of slots) {
    if (!wanting.includes(slot)) {
      out.push(slot);
      continue;
    }
    const face = faces.find((f) => f.id === slot.params.clockFaceId);
    const held = live[slot.screen]?.clockFaceHeld;
    if (!face) {
      if (held !== wantedHash(slot.params)) unavailable.push(slot.screen);
      out.push(slot);
      continue;
    }
    const made = await clockFaceFile(face.id, face.recipe);
    if (held !== made.hash) {
      try {
        await uploadClockFace(slot.screen, made.file);
      } catch (err) {
        throw `Couldn't send the clock face '${face.name}' to screen ${slot.screen}: ${describeOrbitError(err)}`;
      }
    }
    out.push({ ...slot, params: { ...slot.params, clockFaceHash: made.hash } });
  }
  return { slots: out, unavailable };
}
