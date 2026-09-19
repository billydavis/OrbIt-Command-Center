import { useState } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { useDeviceStore } from "../../stores/deviceStore";
import { applyProfile } from "../../lib/tauriCommands";
import { describeOrbitError, isConnectionLost, type Profile } from "../../lib/types";

interface ProfileCardProps {
  profile: Profile;
  onApplied: () => void;
}

export function ProfileCard({ profile, onApplied }: ProfileCardProps) {
  const remove = useProfilesStore((s) => s.remove);
  const markLost = useDeviceStore((s) => s.markLost);
  const [busy, setBusy] = useState<"apply" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setBusy("delete");
    setError(null);
    try {
      await remove(profile.id);
    } catch (err) {
      setError(String(err));
      setBusy(null);
    }
  }

  return (
    <div className="profile-card">
      <div className="profile-card-info">
        <strong>{profile.name}</strong>
        <span className="field-hint">{new Date(profile.createdAt).toLocaleString()}</span>
      </div>
      <div className="button-row">
        <button type="button" disabled={busy !== null} onClick={handleApply}>
          {busy === "apply" ? "Applying…" : "Apply"}
        </button>
        <button type="button" disabled={busy !== null} onClick={handleDelete}>
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
