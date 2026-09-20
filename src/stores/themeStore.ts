import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccentKey, ThemeMode } from "../lib/theme";

interface ThemeState {
  mode: ThemeMode;
  accent: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentKey) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      accent: "cyan",
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
    }),
    { name: "orbit-theme" },
  ),
);
