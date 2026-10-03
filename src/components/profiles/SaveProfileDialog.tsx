import { useState } from "react";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { useProfilesStore } from "../../stores/profilesStore";
import { profileSlotsFromDraft } from "../../lib/profileSlots";

// Saves whatever the designer currently shows as a new named profile (see
// lib/profileSlots.ts for exactly what goes in).
interface SaveProfileDialogProps {
  /** Called when the form is done with, saved or cancelled. */
  onClose: () => void;
}

// The form only; the rail's Profiles heading has the button that shows it
// (ProfileList.tsx).
export function SaveProfileDialog({ onClose }: SaveProfileDialogProps) {
  const draft = useLayoutDraftStore((s) => s.draft);
  const save = useProfilesStore((s) => s.save);
  const setActive = useProfilesStore((s) => s.setActive);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await save(name.trim(), profileSlotsFromDraft(draft));
      // The layout on screen is this profile now.
      setActive(saved.id);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="connection-settings-row" onSubmit={handleSave}>
      <input
        autoFocus
        placeholder="Profile name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        disabled={saving}
      />
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
