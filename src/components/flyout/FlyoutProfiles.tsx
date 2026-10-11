import { useEffect, useState } from "react";
import { applyProfile } from "../../lib/tauriCommands";
import { describeOrbitError, type Profile } from "../../lib/types";
import { useProfilesStore } from "../../stores/profilesStore";
import { keptOn, listOf, notBuiltIn } from "../../lib/capabilities";
import { useDeviceStore } from "../../stores/deviceStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";

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
  const capabilities = useDeviceStore((s) => s.capabilities);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApply(profile: Profile) {
    // The orb takes a profile whole or not at all (see ProfileCard.tsx).
    const missing = listOf(notBuiltIn(profile.slots, capabilities));
    if (missing) {
      setError(`'${profile.name}' uses ${missing}, which this orb's firmware was built without.`);
      return;
    }
    // Overwriting settings the orb is keeping needs a confirm, and the
    // room for one is in the full window's rail.
    const kept = listOf(
      keptOn(
        useLayoutDraftStore.getState().live,
        profile.slots.map((slot) => slot.screen),
      ),
    );
    if (kept) {
      setError(
        `'${profile.name}' would replace the ${kept} settings the orb is keeping. Apply it from the full window to confirm.`,
      );
      return;
    }
    setBusyId(profile.id);
    setError(null);
    try {
      await applyProfile(profile.id);
      setActive(profile.id);
      onApplied();
    } catch (err) {
      const message = describeOrbitError(err);
      setError(message);
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
            className={`flyout-profile${profile.id === activeId ? " flyout-profile-active" : ""}${
              notBuiltIn(profile.slots, capabilities).length > 0 ? " flyout-profile-unavailable" : ""
            }`}
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
