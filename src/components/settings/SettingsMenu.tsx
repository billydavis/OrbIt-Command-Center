import { useEffect, useRef, useState } from "react";
import appIcon from "../../assets/app-icon.png";
import { AppearanceSettings } from "../theme/AppearanceSettings";

interface SettingsMenuProps {
  /** Refresh and Disconnect are only offered while a device is connected. */
  connected: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}

// Everything that isn't the layout itself, behind the app's own icon at the
// start of the header (where a Windows title bar keeps its window menu):
// the two connection actions, and appearance. Appearance opens
// in this same panel rather than a modal — its changes apply instantly, and
// the point is to watch the app behind it change.
export function SettingsMenu({ connected, refreshing, onRefresh, onDisconnect }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "appearance">("menu");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggle() {
    // With no device there's nothing in the menu but Appearance, so the
    // icon goes straight to it.
    setView(connected ? "menu" : "appearance");
    setOpen((o) => !o);
  }

  return (
    <div className="settings-menu" ref={containerRef}>
      <button
        type="button"
        className="settings-menu-trigger"
        aria-label="Menu"
        title="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        <img src={appIcon} alt="" />
      </button>

      {open && view === "menu" && (
        <div className="settings-menu-panel" role="menu" aria-label="Settings">
          <button
            type="button"
            role="menuitem"
            disabled={refreshing}
            onClick={() => {
              setOpen(false);
              onRefresh();
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh from orb"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
          >
            Disconnect
          </button>
          <hr className="settings-menu-divider" />
          <button type="button" role="menuitem" onClick={() => setView("appearance")}>
            Appearance…
          </button>
        </div>
      )}

      {open && view === "appearance" && (
        <div className="settings-menu-panel theme-control-panel" role="dialog" aria-label="Appearance">
          {connected && (
            <button type="button" className="settings-menu-back" onClick={() => setView("menu")}>
              ‹ Settings
            </button>
          )}
          <AppearanceSettings />
        </div>
      )}
    </div>
  );
}
