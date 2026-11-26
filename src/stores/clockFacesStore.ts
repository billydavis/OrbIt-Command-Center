import { create } from "zustand";
import {
  deleteClockFace,
  listClockFaces,
  saveClockFace,
  updateClockFace,
} from "../lib/tauriCommands";
import { clockFaceFile, readRecipe, type ClockFaceRecipe } from "../lib/clockFaceRenderer";
import type { SavedClockFace } from "../lib/types";

/** A saved clock face with its recipe read into the shape the builder knows. */
export interface ClockFace extends Omit<SavedClockFace, "recipe"> {
  recipe: ClockFaceRecipe;
}

/** What the builder is working on, while it's open. */
export interface ClockFaceEditor {
  /** The saved clock face being changed, or null for a new one. */
  id: string | null;
  name: string;
  recipe: ClockFaceRecipe;
  /** A new clock face shows the presets to start from until one is picked. */
  choosingPreset: boolean;
  /** The screen a new clock face was started from, which gets it once it's saved. */
  forScreen: number | null;
}

interface ClockFacesState {
  faces: ClockFace[];
  loaded: boolean;
  /**
   * The hash of each saved clock face's file as it's drawn now, by id:
   * what a screen showing it should report holding. Filled in shortly
   * after the faces load or change (drawing a file takes a moment).
   */
  hashes: Record<string, string>;
  refresh: () => Promise<void>;
  save: (name: string, recipe: ClockFaceRecipe) => Promise<ClockFace>;
  update: (id: string, name: string, recipe: ClockFaceRecipe) => Promise<ClockFace>;
  remove: (id: string) => Promise<void>;

  editor: ClockFaceEditor | null;
  /**
   * Opens the builder on a saved clock face, or on the presets for a new
   * one (for `forScreen`, if it was started from a screen's settings).
   */
  openEditor: (id: string | null, forScreen?: number) => void;
  editEditor: (change: Partial<Omit<ClockFaceEditor, "id" | "forScreen">>) => void;
  closeEditor: () => void;
}

const toFace = (saved: SavedClockFace): ClockFace => ({ ...saved, recipe: readRecipe(saved.recipe) });

export const useClockFacesStore = create<ClockFacesState>((set, get) => {
  // Works the hashes out for whatever's saved now; a later call wins.
  let hashRun = 0;
  async function rehash() {
    const run = ++hashRun;
    const hashes: Record<string, string> = {};
    for (const face of get().faces) {
      try {
        hashes[face.id] = (await clockFaceFile(face.id, face.recipe)).hash;
      } catch {
        // Left out: a screen showing it keeps the hash it has.
      }
    }
    if (run === hashRun) set({ hashes });
  }

  return {
    faces: [],
    loaded: false,
    hashes: {},
    editor: null,

    refresh: async () => {
      const faces = (await listClockFaces()).map(toFace);
      set({ faces, loaded: true });
      void rehash();
    },

    save: async (name, recipe) => {
      const face = toFace(await saveClockFace(name, recipe));
      set({ faces: [...get().faces, face] });
      void rehash();
      return face;
    },

    update: async (id, name, recipe) => {
      const face = toFace(await updateClockFace(id, name, recipe));
      set({ faces: get().faces.map((f) => (f.id === id ? face : f)) });
      void rehash();
      return face;
    },

    remove: async (id) => {
      await deleteClockFace(id);
      set({ faces: get().faces.filter((f) => f.id !== id) });
      void rehash();
    },

    openEditor: (id, forScreen) => {
      const face = id ? get().faces.find((f) => f.id === id) : undefined;
      set({
        editor: face
          ? { id: face.id, name: face.name, recipe: face.recipe, choosingPreset: false, forScreen: null }
          : { id: null, name: "", recipe: readRecipe({}), choosingPreset: true, forScreen: forScreen ?? null },
      });
    },

    editEditor: (change) => {
      const editor = get().editor;
      if (editor) set({ editor: { ...editor, ...change } });
    },

    closeEditor: () => set({ editor: null }),
  };
});

/** The saved clock faces, loading them first if this window hasn't yet. */
export async function loadedClockFaces(): Promise<ClockFace[]> {
  const store = useClockFacesStore.getState();
  if (!store.loaded) await store.refresh();
  return useClockFacesStore.getState().faces;
}
