import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RailState {
  /** The rail's sections that are folded away, by section id. One not listed is open. */
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
  expand: (id: string) => void;
}

export const useRailStore = create<RailState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggle: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
      expand: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: false } })),
    }),
    { name: "orbit-rail" },
  ),
);
