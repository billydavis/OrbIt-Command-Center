import { create } from "zustand";
import { deleteProfile, listProfiles, saveProfile, updateProfile } from "../lib/tauriCommands";
import type { BulkScreenSlotInput, Profile } from "../lib/types";

interface ProfilesState {
  profiles: Profile[];
  /**
   * The profile the layout on screen matches: set when one is applied,
   * saved or updated from the layout; cleared by the first change made
   * after that (App.tsx) or when the connection goes. Only remembered
   * while the app runs — after a restart there's no telling whether the
   * orb still matches a profile.
   */
  activeId: string | null;
  setActive: (id: string | null) => void;
  update: (id: string, slots: BulkScreenSlotInput[]) => Promise<Profile>;
  refresh: () => Promise<void>;
  save: (name: string, slots: BulkScreenSlotInput[]) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  activeId: null,

  setActive: (id) => set({ activeId: id }),

  update: async (id, slots) => {
    const profile = await updateProfile(id, slots);
    set({ profiles: get().profiles.map((p) => (p.id === id ? profile : p)) });
    return profile;
  },

  refresh: async () => {
    set({ profiles: await listProfiles() });
  },

  save: async (name, slots) => {
    const profile = await saveProfile(name, slots);
    set({ profiles: [...get().profiles, profile] });
    return profile;
  },

  remove: async (id) => {
    await deleteProfile(id);
    set({
      profiles: get().profiles.filter((p) => p.id !== id),
      activeId: get().activeId === id ? null : get().activeId,
    });
  },
}));
