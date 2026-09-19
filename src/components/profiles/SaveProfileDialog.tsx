import { useState } from "react";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { useProfilesStore } from "../../stores/profilesStore";
import type { BulkScreenSlotInput } from "../../lib/types";

// Saves whatever the designer currently shows (the draft, not necessarily
// what's live on the device yet) as a named profile. countdown screens are
// excluded: a profile is a full-state layout meant to be bulk-applied later,
// and countdown's live {label, durationSeconds, state, remainingSeconds}
// shape isn't valid input for that (it needs params.action, see
// CountdownForm.tsx) — same reasoning as excluding it from Apply Layout.
export function SaveProfileDialog() {
  const draft = useLayoutDraftStore((s) => s.draft);
  const save = useProfilesStore((s) => s.save);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const slots: BulkScreenSlotInput[] = Object.entries(draft)
      .map(([screenStr, input]) => ({ screen: Number(screenStr), ...input }))
      .filter((s) => s.control !== "countdown");

    setSaving(true);
    setError(null);
    try {
      await save(name.trim(), slots);
      setName("");
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Save current layout as profile…
      </button>
    );
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
      <button type="button" onClick={() => setOpen(false)} disabled={saving}>
        Cancel
      </button>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
