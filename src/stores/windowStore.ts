import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WindowState {
  /**
   * Windows only: whether the app has a taskbar button while its window is
   * open. Off by default — the app is tray-resident, so the tray icon is
   * its home (see src-tauri/src/tray/mod.rs).
   */
  showInTaskbar: boolean;
  setShowInTaskbar: (show: boolean) => void;
}

export const useWindowStore = create<WindowState>()(
  persist(
    (set) => ({
      showInTaskbar: false,
      setShowInTaskbar: (showInTaskbar) => set({ showInTaskbar }),
    }),
    { name: "orbit-window" },
  ),
);
