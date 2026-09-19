import { useEffect } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { SaveProfileDialog } from "./SaveProfileDialog";
import { ProfileCard } from "./ProfileCard";

interface ProfileListProps {
  onApplied: () => void;
}

export function ProfileList({ onApplied }: ProfileListProps) {
  const profiles = useProfilesStore((s) => s.profiles);
  const refresh = useProfilesStore((s) => s.refresh);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="profiles-section">
      <h2>Profiles</h2>
      <SaveProfileDialog />
      {profiles.length === 0 ? (
        <p className="field-hint">No saved profiles yet.</p>
      ) : (
        <div className="profile-list">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} onApplied={onApplied} />
          ))}
        </div>
      )}
    </section>
  );
}
