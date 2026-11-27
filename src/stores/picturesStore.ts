import { create } from "zustand";
import {
  deletePicture,
  importPicture,
  listPictures,
  readPicture,
  renamePicture,
} from "../lib/tauriCommands";
import type { LibraryPicture } from "../lib/types";

// The app's picture library (src-tauri/src/pictures): every picture someone
// has added, as the 240x240 file the orb takes. Screens name pictures by
// hash; this is where the app finds the file to show or send for one.

const MIME: Record<LibraryPicture["format"], string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

export interface ImportResult {
  added: LibraryPicture[];
  /** Files that couldn't be made into pictures, with why, to show as is. */
  failed: { name: string; message: string }[];
}

interface PicturesState {
  pictures: LibraryPicture[];
  loaded: boolean;
  /** How many dropped or chosen files are still being made into pictures. */
  importing: number;
  /** Object URLs of the files loaded so far, by hash; see `loadUrl`. */
  urls: Record<string, string>;
  refresh: () => Promise<void>;
  /**
   * Adds files to the library, one at a time (a big GIF takes a few
   * seconds). One that's already there comes back as it is.
   */
  importFiles: (files: File[]) => Promise<ImportResult>;
  rename: (hash: string, name: string) => Promise<void>;
  remove: (hash: string) => Promise<void>;
  /** Loads a picture's file for showing; its URL then appears in `urls`. */
  loadUrl: (hash: string) => Promise<string | undefined>;
}

/** "beach.jpeg" -> "beach". */
export function nameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export const usePicturesStore = create<PicturesState>((set, get) => {
  // One read per picture, however many tiles ask for it at once.
  const loading = new Map<string, Promise<string | undefined>>();

  return {
    pictures: [],
    loaded: false,
    importing: 0,
    urls: {},

    refresh: async () => {
      set({ pictures: await listPictures(), loaded: true });
    },

    importFiles: async (files) => {
      const result: ImportResult = { added: [], failed: [] };
      set({ importing: get().importing + files.length });
      for (const file of files) {
        try {
          const picture = await importPicture(nameFromFile(file.name), await file.arrayBuffer());
          result.added.push(picture);
          if (!get().pictures.some((p) => p.hash === picture.hash)) {
            set({ pictures: [...get().pictures, picture] });
          }
        } catch (err) {
          result.failed.push({ name: file.name, message: String(err) });
        } finally {
          set({ importing: get().importing - 1 });
        }
      }
      return result;
    },

    rename: async (hash, name) => {
      const renamed = await renamePicture(hash, name);
      set({ pictures: get().pictures.map((p) => (p.hash === hash ? renamed : p)) });
    },

    remove: async (hash) => {
      await deletePicture(hash);
      const { [hash]: url, ...urls } = get().urls;
      if (url) URL.revokeObjectURL(url);
      loading.delete(hash);
      set({ pictures: get().pictures.filter((p) => p.hash !== hash), urls });
    },

    loadUrl: (hash) => {
      const known = get().urls[hash];
      if (known) return Promise.resolve(known);
      let pending = loading.get(hash);
      if (!pending) {
        pending = (async () => {
          const picture = get().pictures.find((p) => p.hash === hash);
          if (!picture) return undefined;
          try {
            const blob = new Blob([await readPicture(hash)], { type: MIME[picture.format] });
            const url = URL.createObjectURL(blob);
            set({ urls: { ...get().urls, [hash]: url } });
            return url;
          } catch {
            loading.delete(hash); // let a later ask try again
            return undefined;
          }
        })();
        loading.set(hash, pending);
      }
      return pending;
    },
  };
});

/** The library's pictures, loading them first if this window hasn't yet. */
export async function loadedPictures(): Promise<LibraryPicture[]> {
  const store = usePicturesStore.getState();
  if (!store.loaded) await store.refresh();
  return usePicturesStore.getState().pictures;
}
