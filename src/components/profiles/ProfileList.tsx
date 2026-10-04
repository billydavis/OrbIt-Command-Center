import { useEffect, useState } from "react";
import { useProfilesStore } from "../../stores/profilesStore";
import { useRailStore } from "../../stores/railStore";
import { RailSection } from "../rail/RailSection";
import { SaveProfileDialog } from "./SaveProfileDialog";
import { ProfileCard } from "./ProfileCard";

interface ProfileListProps {
  onApplied: () => void;
}

// The rail's Profiles section: its heading (with the button that saves the
// current layout as a new profile), then one row per saved profile.
export function ProfileList({ onApplied }: ProfileListProps) {
  const profiles = useProfilesStore((s) => s.profiles);
  const refresh = useProfilesStore((s) => s.refresh);
  const expand = useRailStore((s) => s.expand);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RailSection
      id="profiles"
      title="Profiles"
      actions={
        <button
          type="button"
          className="icon-button rail-heading-icon"
          aria-label="Save current layout as a profile"
          title="Save current layout as a profile"
          aria-expanded={saving}
          onClick={() => {
            // The dialog opens inside the section, so a folded one opens too.
            expand("profiles");
            setSaving((s) => !s);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      {saving && <SaveProfileDialog onClose={() => setSaving(false)} />}
      {profiles.length === 0 ? (
        !saving && (
          <p className="field-hint">
            None saved yet. A profile is all five screens as you see them now, to bring back later
            in one click.
          </p>
        )
      ) : (
        <div className="profile-list">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} onApplied={onApplied} />
          ))}
        </div>
      )}
    </RailSection>
  );
}
