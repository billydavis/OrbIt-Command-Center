import { useEffect, useRef, useState } from "react";
import type { LibraryPicture } from "../../lib/types";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { usePictureLibrary, usePicturesStore } from "../../stores/picturesStore";
import { useRailStore } from "../../stores/railStore";
import { RailSection } from "../rail/RailSection";
import { PICTURE_ACCEPT, addPictureFiles, useFileDrop } from "./addPictureFiles";
import { PictureThumb } from "./PictureThumb";

// The rail's Pictures section: the app's picture library, as round
// thumbnails. Files dropped on it (or chosen with +) are added; picking one
// shows its details, to rename or delete it. Screens pick from the library
// in their own settings.
export function PictureList() {
  usePictureLibrary();
  const pictures = usePicturesStore((s) => s.pictures);
  const importing = usePicturesStore((s) => s.importing);
  const expand = useRailStore((s) => s.expand);
  const [openHash, setOpenHash] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const open = pictures.find((p) => p.hash === openHash) ?? null;

  const { dragging, dropProps } = useFileDrop((files) => void addPictureFiles(files));

  return (
    <RailSection
      id="pictures"
      title="Pictures"
      actions={
        <button
          type="button"
          className="icon-button rail-heading-icon"
          aria-label="Add pictures"
          title="Add pictures"
          disabled={importing > 0}
          onClick={() => {
            expand("pictures");
            fileInput.current?.click();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      }
    >
      <div className={`picture-rail${dragging ? " picture-drop-active" : ""}`} {...dropProps}>
        {pictures.length === 0 ? (
          <p className="field-hint">
            {importing > 0
              ? "Adding…"
              : "None yet. Drop photos or GIFs here, then pick them for any Pictures screen."}
          </p>
        ) : (
          <>
            <div className="picture-library picture-library-rail">
              {pictures.map((picture) => (
                <button
                  key={picture.hash}
                  type="button"
                  className="picture-library-item"
                  aria-pressed={openHash === picture.hash}
                  title={picture.name}
                  onClick={() => setOpenHash(openHash === picture.hash ? null : picture.hash)}
                >
                  <PictureThumb hash={picture.hash} />
                  <span>{picture.name}</span>
                </button>
              ))}
            </div>
            {importing > 0 && <p className="field-hint">Adding {importing === 1 ? "a picture" : `${importing} pictures`}…</p>}
            {open && <PictureDetails key={open.hash} picture={open} onDeleted={() => setOpenHash(null)} />}
          </>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={PICTURE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void addPictureFiles(files);
        }}
      />
    </RailSection>
  );
}

const FORMAT_LABELS: Record<LibraryPicture["format"], string> = { jpeg: "JPEG", png: "PNG", gif: "GIF" };

function describe(picture: LibraryPicture): string {
  const size = picture.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(picture.bytes / 1024))} KB` : `${(picture.bytes / 1048576).toFixed(1)} MB`;
  const frames = picture.frames > 1 ? `, ${picture.frames} frames` : "";
  return `${FORMAT_LABELS[picture.format]}, ${size}${frames}`;
}

function PictureDetails({ picture, onDeleted }: { picture: LibraryPicture; onDeleted: () => void }) {
  const rename = usePicturesStore((s) => s.rename);
  const remove = usePicturesStore((s) => s.remove);
  // Screens set to show it now, in the draft (what's being edited).
  const draft = useLayoutDraftStore((s) => s.draft);
  const usedOn = Object.entries(draft)
    .filter(
      ([, slot]) =>
        slot.control === "picture" && Array.isArray(slot.params.pictures) && slot.params.pictures.includes(picture.hash),
    )
    .map(([screen]) => Number(screen) + 1);
  const [name, setName] = useState(picture.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A second click within a moment of the first could be a double click,
  // not a decision, so the confirm waits a beat before it takes one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    setArmed(false);
    const timer = setTimeout(() => setArmed(true), 400);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === picture.name) {
      setName(picture.name);
      return;
    }
    try {
      await rename(picture.hash, trimmed);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete() {
    try {
      await remove(picture.hash);
      onDeleted();
    } catch (err) {
      setError(String(err));
      setConfirming(false);
    }
  }

  return (
    <div className="picture-details">
      <label className="field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(picture.name);
          }}
        />
      </label>
      <p className="field-hint">
        {describe(picture)}
        {usedOn.length > 0 && ` · on screen ${usedOn.join(", ")}`}
      </p>
      {confirming ? (
        <div className="button-row">
          <button type="button" className="destructive" disabled={!armed} onClick={() => void handleDelete()}>
            Delete from the app
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          Delete…
        </button>
      )}
      {confirming && (
        <p className="field-hint">
          {usedOn.length > 0
            ? "Screens showing it keep it while the orb has the file, but this app can't send it again."
            : "The orb keeps its copy until it needs the room."}
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
