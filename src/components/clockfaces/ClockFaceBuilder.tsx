import { useEffect, useMemo, useRef, useState } from "react";
import {
  BACKGROUND_STYLES,
  clockFaceFile,
  DIAL_STYLES,
  drawingFor,
  HAND_STYLES,
  LABELS,
  MAX_FILE_BYTES,
  photoFromFile,
  PRESETS,
  SECOND_STYLES,
  SWATCHES,
  type ClockFaceRecipe,
} from "../../lib/clockFaceRenderer";
import { describeProfileError } from "../../lib/types";
import { listOf } from "../../lib/capabilities";
import { useClockFacesStore } from "../../stores/clockFacesStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { ClockFaceView, thumbnailTime, useClockNow } from "./ClockFaceLayer";

type ColorKey = keyof ClockFaceRecipe["colors"];
const COLOR_KEYS: { key: ColorKey; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "dial", label: "Dial" },
  { key: "hands", label: "Hands" },
  { key: "second", label: "Second hand" },
];

function Choices<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="clock-face-chips" role="radiogroup" aria-label={label}>
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={v === value} onClick={() => onChange(v)}>
            {LABELS[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorChoice({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <div className="field color-field">
      <span>{label}</span>
      <div className="color-field-row">
        <input type="color" aria-label={`${label}: any color`} value={value} onChange={(e) => onChange(e.currentTarget.value)} />
        <span className="mono-num color-field-hex">{value.toUpperCase()}</span>
      </div>
      <div className="color-presets" role="group" aria-label={`${label} presets`}>
        {SWATCHES.map((s) => (
          <button
            key={s.name}
            type="button"
            className="color-preset"
            style={{ backgroundColor: s.hex }}
            title={s.name}
            aria-label={s.name}
            aria-pressed={s.hex === value}
            onClick={() => onChange(s.hex)}
          />
        ))}
      </div>
    </div>
  );
}

/** The presets a new clock face starts from. */
function PresetGallery({ onPick }: { onPick: (name: string, recipe: ClockFaceRecipe) => void }) {
  const time = useMemo(thumbnailTime, []);
  return (
    <div className="clock-face-presets">
      {PRESETS.map((p) => (
        <button key={p.name} type="button" className="clock-face-preset" onClick={() => onPick(p.name, p.recipe)}>
          <ClockFaceView className="clock-face-preset-face" drawing={drawingFor(p.recipe)} now={time} />
          <span className="clock-face-preset-name">{p.name}</span>
          <span className="clock-face-preset-note">{p.note}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The clock face builder. It takes the place of the screen editor while
 * it's open: a large live preview (the orb's own picture, colours cut to
 * what the screens show) beside the choices. Saving stores the recipe in
 * the app; screens using it get it on the next Apply.
 */
export function ClockFaceBuilder() {
  const editor = useClockFacesStore((s) => s.editor)!;
  const editEditor = useClockFacesStore((s) => s.editEditor);
  const closeEditor = useClockFacesStore((s) => s.closeEditor);
  const save = useClockFacesStore((s) => s.save);
  const update = useClockFacesStore((s) => s.update);
  const remove = useClockFacesStore((s) => s.remove);
  const original = useClockFacesStore((s) => s.faces.find((f) => f.id === editor.id));
  const draft = useLayoutDraftStore((s) => s.draft);
  const replaceDraftSlot = useLayoutDraftStore((s) => s.replaceDraftSlot);

  const { recipe, name } = editor;
  const setRecipe = (change: Partial<ClockFaceRecipe>) => editEditor({ recipe: { ...recipe, ...change } });
  const setColor = (key: ColorKey, hex: string) => setRecipe({ colors: { ...recipe.colors, [key]: hex } });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const [zoom, setZoom] = useState(false);
  const [bytes, setBytes] = useState<number | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const now = useClockNow(!editor.choosingPreset);
  const drawing = useMemo(() => drawingFor(recipe), [recipe]);

  // The size of the file this would send, worked out a moment after the
  // choices settle.
  useEffect(() => {
    if (editor.choosingPreset) return;
    let live = true;
    const timer = setTimeout(() => {
      clockFaceFile(editor.id ?? "new", recipe).then(
        (f) => live && setBytes(f.bytes),
        () => live && setBytes(null),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [recipe, editor.id, editor.choosingPreset]);

  const usedOn = Object.entries(draft)
    .filter(([, input]) => input.control === "analogClock" && editor.id && input.params.clockFaceId === editor.id)
    .map(([screen]) => screen);
  const changed = original
    ? original.name !== name || JSON.stringify(original.recipe) !== JSON.stringify(recipe)
    : !editor.choosingPreset;
  const tooBig = bytes !== null && bytes > MAX_FILE_BYTES;
  const needsPhoto = recipe.background === "photo" && !recipe.photo;

  async function handleSave(asNew = false) {
    setBusy(true);
    setError(null);
    try {
      const finalName = name.trim() || "Untitled clock face";
      const face = editor.id && !asNew ? await update(editor.id, finalName, recipe) : await save(finalName, recipe);
      // A clock face started from a screen's settings goes on that screen.
      const screen = editor.forScreen;
      const input = screen !== null ? draft[screen] : undefined;
      if (screen !== null && input?.control === "analogClock") {
        const made = await clockFaceFile(face.id, face.recipe);
        replaceDraftSlot(screen, { ...input, params: { ...input.params, clockFaceId: face.id, clockFaceHash: made.hash } });
      }
      closeEditor();
    } catch (err) {
      setError(describeProfileError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editor.id) return;
    setBusy(true);
    try {
      await remove(editor.id);
      closeEditor();
    } catch (err) {
      setError(describeProfileError(err));
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setRecipe({ background: "photo", photo: await photoFromFile(file) });
    } catch (err) {
      setError(`Couldn't use that picture: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleClose() {
    if (changed && confirm !== "discard") setConfirm("discard");
    else closeEditor();
  }

  return (
    <section className="clock-face-builder" aria-labelledby="clock-face-builder-title">
      <div className="screen-editor-header">
        <h3 id="clock-face-builder-title">
          {editor.choosingPreset ? "New clock face: start from" : editor.id ? `Edit ${original?.name ?? "clock face"}` : "New clock face"}
        </h3>
        <button type="button" className="screen-editor-discard" onClick={handleClose}>
          {confirm === "discard" ? "Discard changes" : "Close"}
        </button>
      </div>

      {editor.choosingPreset ? (
        <PresetGallery onPick={(presetName, preset) => editEditor({ name: presetName, recipe: preset, choosingPreset: false })} />
      ) : (
        <div className="clock-face-builder-body">
          <div className="clock-face-builder-preview">
            <div className={`clock-face-bezel${zoom ? " clock-face-bezel-zoom" : ""}`}>
              <ClockFaceView drawing={drawing} now={now} />
            </div>
            <button type="button" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
              {zoom ? "Actual size" : "Zoom 2×"}
            </button>
            <p className="field-hint">
              {bytes === null ? "Working out the size…" : `${Math.ceil(bytes / 1024)} KB to send to each screen that uses it.`}
              {usedOn.length > 0 && ` Used on screen${usedOn.length === 1 ? "" : "s"} ${listOf(usedOn)}.`}
            </p>
            {tooBig && (
              <p className="field-error">
                Too big for the orb (the most it takes is 256 KB). A simpler background makes the picture smaller.
              </p>
            )}
          </div>

          <div className="clock-face-builder-options">
            <label className="field">
              Name
              <input value={name} placeholder="Untitled clock face" maxLength={60} onChange={(e) => editEditor({ name: e.target.value })} />
            </label>
            <Choices label="Dial" values={DIAL_STYLES} value={recipe.dial} onChange={(dial) => setRecipe({ dial })} />
            <Choices label="Hands" values={HAND_STYLES} value={recipe.hands} onChange={(hands) => setRecipe({ hands })} />
            <Choices label="Second hand" values={SECOND_STYLES} value={recipe.seconds} onChange={(seconds) => setRecipe({ seconds })} />
            <Choices
              label="Background"
              values={BACKGROUND_STYLES}
              value={recipe.background}
              onChange={(background) => {
                setRecipe({ background });
                if (background === "photo" && !recipe.photo) photoInput.current?.click();
              }}
            />
            {recipe.background === "photo" && (
              <div className="button-row">
                <button type="button" onClick={() => photoInput.current?.click()}>
                  {recipe.photo ? "Choose another photo" : "Choose a photo"}
                </button>
              </div>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void handlePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {needsPhoto && <p className="field-hint">Choose a photo; the middle square of it is used.</p>}
            {recipe.background !== "solid" && (
              <label className="field">
                Dim the background: {recipe.dim}%
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={recipe.dim}
                  onChange={(e) => setRecipe({ dim: Number(e.target.value) })}
                />
              </label>
            )}

            <div className="field">
              <span>Extras</span>
              <label className="field-checkbox">
                <input type="checkbox" checked={recipe.date} onChange={(e) => setRecipe({ date: e.target.checked })} />
                Date window
              </label>
              <label className="field-checkbox">
                <input type="checkbox" checked={recipe.weekday} onChange={(e) => setRecipe({ weekday: e.target.checked })} />
                Weekday under twelve
              </label>
              <label className="field-checkbox">
                <input type="checkbox" checked={recipe.ring} onChange={(e) => setRecipe({ ring: e.target.checked })} />
                Seconds ring round the rim (hidden when a screen turns the second hand off)
              </label>
              <label className="field-checkbox">
                <input
                  type="checkbox"
                  checked={recipe.edges}
                  disabled={recipe.hands === "skeleton"}
                  onChange={(e) => setRecipe({ edges: e.target.checked })}
                />
                Dark edges round the hands (good over a photo)
              </label>
            </div>

            <div className="clock-face-colors">
              {COLOR_KEYS.map(({ key, label }) => (
                <ColorChoice key={key} label={label} value={recipe.colors[key]} onChange={(hex) => setColor(key, hex)} />
              ))}
            </div>

            {error && <p className="field-error">{error}</p>}

            {confirm === "delete" ? (
              <div className="profile-row-confirm">
                <span className="field-hint">
                  Delete '{original?.name}'? Screens showing it keep it until you pick another. Can't be undone.
                </span>
                <div className="button-row">
                  <button type="button" onClick={() => setConfirm(null)}>
                    Keep it
                  </button>
                  <button type="button" className="destructive" disabled={busy} onClick={() => void handleDelete()}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="button-row clock-face-builder-actions">
                {editor.id && (
                  <button type="button" className="destructive" disabled={busy} onClick={() => setConfirm("delete")}>
                    Delete
                  </button>
                )}
                <span className="clock-face-builder-spacer" />
                {editor.id && (
                  <button type="button" disabled={busy || tooBig || needsPhoto} onClick={() => void handleSave(true)}>
                    Save as new
                  </button>
                )}
                <button
                  type="button"
                  className="clock-face-save"
                  disabled={busy || tooBig || needsPhoto || (!!editor.id && !changed)}
                  onClick={() => void handleSave()}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
