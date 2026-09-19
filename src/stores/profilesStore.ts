import { create } from "zustand";
import { deleteProfile, listProfiles, saveProfile } from "../lib/tauriCommands";
import type { BulkScreenSlotInput, Profile } from "../lib/types";

interface ProfilesState {
  profiles: Profile[];
  refresh: () => Promise<void>;
  save: (name: string, slots: BulkScreenSlotInput[]) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],

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
    set({ profiles: get().profiles.filter((p) => p.id !== id) });
  },
}));
