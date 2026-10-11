import { create } from "zustand";

export interface ToastItem {
  /** Names what the toast is about. Showing another with the same key replaces it. */
  key: string;
  tone: "alert" | "ok";
  title: string;
  detail?: string;
}

interface ToastState {
  toasts: ToastItem[];
  show: (toast: ToastItem) => void;
  dismiss: (key: string) => void;
}

// What ToastStack shows for the parts of the app that have something to
// report from deep inside it (a profile row, a form in the screen editor).
// Keyed, so trying the same thing again replaces its last result rather
// than stacking another, and whatever shows one can take it back down when
// the next attempt starts. Not shared between windows: each shows its own.
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  show: (toast) => set((s) => ({ toasts: [...s.toasts.filter((t) => t.key !== toast.key), toast] })),
  dismiss: (key) =>
    set((s) => (s.toasts.some((t) => t.key === key) ? { toasts: s.toasts.filter((t) => t.key !== key) } : s)),
}));
