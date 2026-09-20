import { useLayoutEffect } from "react";
import { useThemeStore } from "../stores/themeStore";
import { accentActiveColor, accentColor, effectiveIsDark } from "../lib/theme";

// Bridges the persisted theme choice onto the document: an explicit
// light/dark pins `data-theme` (App.css defines a dark block guarded by
// both the media query and this attribute, per the light/dark pattern);
// "system" removes it so the existing prefers-color-scheme query decides.
// The accent is layered on top as inline custom properties, since it can
// change independently of, and needs a different value per, light vs dark.
export function useApplyTheme() {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);

  useLayoutEffect(() => {
    const root = document.documentElement;

    function apply() {
      if (mode === "system") {
        root.removeAttribute("data-theme");
      } else {
        root.dataset.theme = mode;
      }
      const dark = effectiveIsDark(mode);
      root.style.setProperty("--color-signal", accentColor(accent, dark));
      root.style.setProperty("--color-signal-active", accentActiveColor(accent, dark));
    }

    apply();

    if (mode !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, [mode, accent]);
}
