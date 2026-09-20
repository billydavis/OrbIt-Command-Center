import { useEffect, useRef } from "react";
import { ProfileList } from "./ProfileList";

interface ProfilesDrawerProps {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

// A quick dip, not a mode change: the screen grid/editor stays mounted and
// visible behind the scrim, so applying a profile and glancing back at the
// live tiles doesn't require leaving and re-entering a separate view.
export function ProfilesDrawer({ open, onClose, onApplied }: ProfilesDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`profiles-drawer-scrim ${open ? "profiles-drawer-scrim-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`profiles-drawer ${open ? "profiles-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Profiles"
        inert={!open}
      >
        <div className="profiles-drawer-header">
          <h2>Profiles</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="profiles-drawer-close"
            aria-label="Close profiles"
            onClick={onClose}
          >
            &#10005;
          </button>
        </div>
        <ProfileList onApplied={onApplied} />
      </div>
    </>
  );
}
