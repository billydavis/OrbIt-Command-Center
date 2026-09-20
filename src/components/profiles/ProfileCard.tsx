import { useEffect, useRef, useState } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { useDeviceStore } from "../../stores/deviceStore";
import { applyProfile } from "../../lib/tauriCommands";
import { describeOrbitError, isConnectionLost, SCREEN_COUNT, type ControlType, type Profile } from "../../lib/types";
import { CONTROL_LABELS } from "../../lib/controlLabels";

interface ProfileCardProps {
  profile: Profile;
  onApplied: () => void;
}

// Deleting a profile can't be undone, so it's gated behind an explicit
// confirm step. A "click again to confirm" pattern on the *same* button
// would fail a plain double-click (both clicks land before the state update
// even registers) — the confirm control below renders at a different
// position than the original Delete button, and ignores input for a short
// window after it appears, so an accidental double-click can't land on it.
const CONFIRM_GUARD_MS = 350;
const CONFIRM_AUTO_REVERT_MS = 8000;

export function ProfileCard({ profile, onApplied }: ProfileCardProps) {
  const remove = useProfilesStore((s) => s.remove);
  const markLost = useDeviceStore((s) => s.markLost);
  const [busy, setBusy] = useState<"apply" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmGuardElapsed, setConfirmGuardElapsed] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!confirming) return;
    setConfirmGuardElapsed(false);
    const guard = setTimeout(() => setConfirmGuardElapsed(true), CONFIRM_GUARD_MS);
    revertTimer.current = setTimeout(() => setConfirming(false), CONFIRM_AUTO_REVERT_MS);
    return () => {
      clearTimeout(guard);
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, [confirming]);

  async function handleApply() {
    setBusy("apply");
    setError(null);
    try {
      await applyProfile(profile.id);
      onApplied();
    } catch (err) {
      const message = describeOrbitError(err);
      setError(message);
      if (isConnectionLost(err)) markLost(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirmGuardElapsed) return;
    setConfirming(false);
    setBusy("delete");
    setError(null);
    try {
      await remove(profile.id);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  const slotByScreen = new Map(profile.slots.map((s) => [s.screen, s]));

  return (
    <div className="profile-card">
      <div className="profile-card-info">
        <strong>{profile.name}</strong>
        <span className="field-hint">{new Date(profile.createdAt).toLocaleString()}</span>
        <div className="profile-card-preview">
          {Array.from({ length: SCREEN_COUNT }, (_, i) => {
            const slot = slotByScreen.get(i);
            const isSet = !!slot && slot.control !== "blank";
            const label = slot ? (CONTROL_LABELS[slot.control as ControlType] ?? slot.control) : "not saved";
            return (
              <span
                key={i}
                className={`profile-card-dot${isSet ? " profile-card-dot-set" : ""}`}
                title={`Screen ${i}: ${label}`}
              />
            );
          })}
        </div>
      </div>
      {confirming ? (
        <div className="button-row profile-card-confirm-delete">
          <span className="field-hint">Delete '{profile.name}'? Can't be undone.</span>
          <button type="button" disabled={busy !== null} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="destructive"
            disabled={busy !== null || !confirmGuardElapsed}
            onClick={handleDelete}
          >
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
        </div>
      ) : (
        <div className="button-row">
          <button type="button" disabled={busy !== null} onClick={handleApply}>
            {busy === "apply" ? "Applying…" : "Apply"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
