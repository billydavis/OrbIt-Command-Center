import { useEffect, useState } from "react";
import { applyProfile } from "../../lib/tauriCommands";
import { describeOrbitError, isConnectionLost, type Profile } from "../../lib/types";
import { useDeviceStore } from "../../stores/deviceStore";
import { useProfilesStore } from "../../stores/profilesStore";

interface FlyoutProfilesProps {
  onApplied: () => void;
}

// The flyout's profiles: one button each, applied on click. Saving,
// updating and deleting them stay in the full window's rail
// (ProfileList.tsx), where there's room to confirm.
export function FlyoutProfiles({ onApplied }: FlyoutProfilesProps) {
  const profiles = useProfilesStore((s) => s.profiles);
  const activeId = useProfilesStore((s) => s.activeId);
  const setActive = useProfilesStore((s) => s.setActive);
  const refresh = useProfilesStore((s) => s.refresh);
  const markLost = useDeviceStore((s) => s.markLost);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApply(profile: Profile) {
    setBusyId(profile.id);
    setError(null);
    try {
      await applyProfile(profile.id);
      setActive(profile.id);
      onApplied();
    } catch (err) {
      const message = describeOrbitError(err);
      setError(message);
      if (isConnectionLost(err)) markLost(message);
    } finally {
      setBusyId(null);
    }
  }

  if (profiles.length === 0) return null;

  return (
    <section className="flyout-profiles" aria-label="Profiles">
      <div className="flyout-profile-list">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`flyout-profile${profile.id === activeId ? " flyout-profile-active" : ""}`}
            aria-pressed={profile.id === activeId}
            disabled={busyId !== null}
            title={`Apply ${profile.name}`}
            onClick={() => void handleApply(profile)}
          >
            {busyId === profile.id ? "Applying…" : profile.name}
          </button>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
