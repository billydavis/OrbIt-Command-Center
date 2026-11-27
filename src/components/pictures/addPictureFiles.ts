import { useState, type DragEvent } from "react";
import type { LibraryPicture } from "../../lib/types";
import { usePicturesStore } from "../../stores/picturesStore";
import { useToastStore } from "../../stores/toastStore";

/** What the file choosers offer: what the app can make a picture from. */
export const PICTURE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/bmp";

const TOAST_KEY = "pictures-add";

/**
 * Adds files to the picture library and says in a toast which couldn't be
 * added and why. Returns the pictures that were (or were already there),
 * in the order given.
 */
export async function addPictureFiles(files: File[]): Promise<LibraryPicture[]> {
  const toasts = useToastStore.getState();
  toasts.dismiss(TOAST_KEY);
  const { added, failed } = await usePicturesStore.getState().importFiles(files);
  if (failed.length === 1) {
    toasts.show({ key: TOAST_KEY, tone: "alert", title: `Couldn't add ${failed[0].name}`, detail: failed[0].message });
  } else if (failed.length > 1) {
    toasts.show({
      key: TOAST_KEY,
      tone: "alert",
      title: `Couldn't add ${failed.length} of the files`,
      detail: failed.map((f) => `${f.name}: ${f.message}`).join(" "),
    });
  }
  return added;
}

/**
 * Lets an element take files dropped on it. `dragging` is true while files
 * are held over it, for showing that it will take them.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const holdsFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  return {
    dragging,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (!holdsFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      },
      onDragLeave: (e: DragEvent) => {
        // Leaving for one of its own children isn't leaving.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        if (!holdsFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      },
    },
  };
}
