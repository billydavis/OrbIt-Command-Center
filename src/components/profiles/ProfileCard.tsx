import { useEffect, useRef, useState } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { useToastStore } from "../../stores/toastStore";
import { applyProfile } from "../../lib/tauriCommands";
import { profileSlotsFromDraft } from "../../lib/profileSlots";
import { isNotBuiltError, keptOn, listOf, notBuiltIn } from "../../lib/capabilities";
import { useDeviceStore } from "../../stores/deviceStore";
import { describeOrbitError, SCREEN_COUNT, type Profile } from "../../lib/types";
import { ScreenPreview } from "../designer/ScreenPreview";

interface ProfileCardProps {
  profile: Profile;
  onApplied: () => void;
}

// Deleting a profile, or replacing what it holds, can't be undone, so both
// are gated behind an explicit confirm step. So is applying one over a
// screen the orb is keeping settings for (ScreenSlot.savedControl). A "click again to confirm"
// pattern on the *same* button would fail a plain double-click (both clicks
// land before the state update even registers) — the confirm control below
// renders at a different position than what opened it, and ignores input
// for a short window after it appears, so an accidental double-click can't
// land on it.
const CONFIRM_GUARD_MS = 350;
const CONFIRM_AUTO_REVERT_MS = 8000;

export function ProfileCard({ profile, onApplied }: ProfileCardProps) {
  const remove = useProfilesStore((s) => s.remove);
  const update = useProfilesStore((s) => s.update);
  const active = useProfilesStore((s) => s.activeId === profile.id);
  const setActive = useProfilesStore((s) => s.setActive);
  const [busy, setBusy] = useState<"apply" | "delete" | "update" | null>(null);
  const showToast = useToastStore((s) => s.show);
  const dismissToast = useToastStore((s) => s.dismiss);
  // One toast per profile: its last failure, until the next thing tried on it.
  const toastKey = `profile-${profile.id}`;
  // What the profile holds that this orb's firmware was built without. The
  // orb takes a profile whole or not at all, so one with any of it can't be
  // applied here; it's dimmed, and says why when clicked.
  const missing = useDeviceStore((s) => listOf(notBuiltIn(profile.slots, s.capabilities)));
  const refreshCapabilities = useDeviceStore((s) => s.refreshCapabilities);
  // Settings the orb is keeping, for controls this firmware lacks, on
  // screens this profile writes to. Applying it throws them away.
  const kept = useLayoutDraftStore((s) =>
    listOf(
      keptOn(
        s.live,
        profile.slots.map((slot) => slot.screen),
      ),
    ),
  );
  const [confirming, setConfirming] = useState<"delete" | "update" | "apply" | null>(null);
  const [confirmGuardElapsed, setConfirmGuardElapsed] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where the row's right-click menu is open, in window coordinates.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    // Anything else the pointer or the window does dismisses it; the menu
    // stops its own mousedown so a click on one of its items still lands.
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  // Right-click, or the keyboard's menu key / Shift+F10 on the focused row
  // (which reports no pointer position, so the menu opens under the row).
  function handleContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (busy !== null) return;
    if (event.clientX === 0 && event.clientY === 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.left + 8, y: rect.bottom });
    } else {
      setMenu({ x: event.clientX, y: event.clientY });
    }
  }

  useEffect(() => {
    if (!confirming) return;
    setConfirmGuardElapsed(false);
    const guard = setTimeout(() => setConfirmGuardElapsed(true), CONFIRM_GUARD_MS);
    revertTimer.current = setTimeout(() => setConfirming(null), CONFIRM_AUTO_REVERT_MS);
    return () => {
      clearTimeout(guard);
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, [confirming]);

  // A click on the row, or Apply in its menu. `confirmed` is the second
  // click, on the confirm that a profile overwriting kept settings gets.
  async function handleApply(confirmed = false) {
    if (confirmed && !confirmGuardElapsed) return;
    setConfirming(null);
    if (missing) {
      showToast({
        key: toastKey,
        tone: "alert",
        title: `Can't apply '${profile.name}' to this orb`,
        detail: `It uses ${missing}, which this orb's firmware was built without.`,
      });
      return;
    }
    if (kept && !confirmed) {
      setConfirming("apply");
      return;
    }
    setBusy("apply");
    dismissToast(toastKey);
    try {
      await applyProfile(profile.id);
      setActive(profile.id);
      onApplied();
    } catch (err) {
      showToast({
        key: toastKey,
        tone: "alert",
        title: `Couldn't apply '${profile.name}'`,
        detail: describeOrbitError(err),
      });
      if (isNotBuiltError(err)) void refreshCapabilities();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirmGuardElapsed) return;
    setConfirming(null);
    setBusy("delete");
    dismissToast(toastKey);
    try {
      await remove(profile.id);
    } catch (err) {
      showToast({
        key: toastKey,
        tone: "alert",
        title: `Couldn't delete '${profile.name}'`,
        detail: String(err),
      });
      setBusy(null);
    }
  }

  // Replaces what this profile holds with the layout as it is in the app
  // right now — the same thing a new profile would save. Afterwards this is
  // the profile the layout matches, so it becomes the highlighted one.
  async function handleUpdate() {
    setConfirming(null);
    setBusy("update");
    dismissToast(toastKey);
    try {
      const { draft, live } = useLayoutDraftStore.getState();
      await update(profile.id, profileSlotsFromDraft(draft, live));
      setActive(profile.id);
    } catch (err) {
      showToast({
        key: toastKey,
        tone: "alert",
        title: `Couldn't update '${profile.name}'`,
        detail: String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  const slotByScreen = new Map(profile.slots.map((s) => [s.screen, s]));

  // One row: the profile's name and a picture of each of its screens.
  // Clicking the row applies it. Update and Delete are in the row's
  // right-click menu, so nothing in the row moves on hover, and both ask
  // first.
  return (
    <div className="profile-row-wrap">
      {confirming ? (
        <div className="profile-row-confirm">
          <span className="field-hint">
            {confirming === "delete"
              ? `Delete '${profile.name}'? Can't be undone.`
              : confirming === "apply"
                ? `Apply '${profile.name}'? It replaces the ${kept} settings the orb is keeping until its firmware has ${kept.includes(" ") ? "them" : "it"} again. Can't be undone.`
                : `Replace '${profile.name}' with the layout as it is now? Can't be undone.`}
          </span>
          <div className="button-row">
            <button type="button" disabled={busy !== null} onClick={() => setConfirming(null)}>
              Cancel
            </button>
            {confirming === "delete" ? (
              <button
                type="button"
                className="destructive"
                disabled={busy !== null || !confirmGuardElapsed}
                onClick={handleDelete}
              >
                Delete
              </button>
            ) : confirming === "apply" ? (
              <button
                type="button"
                disabled={busy !== null || !confirmGuardElapsed}
                onClick={() => void handleApply(true)}
              >
                Apply
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null || !confirmGuardElapsed}
                onClick={() => {
                  if (confirmGuardElapsed) void handleUpdate();
                }}
              >
                Replace
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={`profile-row${active ? " profile-row-active" : ""}${missing ? " profile-row-unavailable" : ""}`}
        >
          <button
            type="button"
            className="profile-row-apply"
            aria-current={active ? "true" : undefined}
            disabled={busy !== null}
            title={
              missing
                ? `Uses ${missing}, which this orb's firmware was built without. Right-click for more.`
                : `Apply ${profile.name} (saved ${new Date(profile.createdAt).toLocaleString()}). Right-click for more.`
            }
            aria-haspopup="menu"
            onClick={() => void handleApply()}
            onContextMenu={handleContextMenu}
          >
            <span className="profile-row-name">
              {busy === "apply"
                ? "Applying…"
                : busy === "update"
                  ? "Updating…"
                  : busy === "delete"
                    ? "Deleting…"
                    : profile.name}
            </span>
            <span className="profile-card-preview">
              {Array.from({ length: SCREEN_COUNT }, (_, i) => {
                const slot = slotByScreen.get(i);
                return (
                  <span
                    key={i}
                    className={`profile-card-screen${slot ? "" : " profile-card-screen-unsaved"}`}
                  >
                    {slot && <ScreenPreview control={slot.control} params={slot.params} still />}
                  </span>
                );
              })}
            </span>
          </button>
        </div>
      )}

      {menu && (
        <div
          className="settings-menu-panel context-menu"
          role="menu"
          aria-label={`Profile ${profile.name}`}
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setMenu(null);
              void handleApply();
            }}
          >
            Apply to orb
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setConfirming("update");
            }}
          >
            Update with current layout…
          </button>
          <button
            type="button"
            role="menuitem"
            className="context-menu-destructive"
            onClick={() => {
              setMenu(null);
              setConfirming("delete");
            }}
          >
            Delete…
          </button>
        </div>
      )}
    </div>
  );
}
