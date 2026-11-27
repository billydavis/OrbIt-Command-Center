import { useRef, useState } from "react";
import { builtTransitions } from "../../lib/capabilities";
import { TRANSITION_LABELS } from "../../lib/controlLabels";
import { PICTURE_HASH, PICTURE_MAX_COUNT, type PictureOrder } from "../../lib/controlSchemas";
import { useDeviceStore } from "../../stores/deviceStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { usePictureLibrary, usePicturesStore } from "../../stores/picturesStore";
import { PICTURE_ACCEPT, addPictureFiles, useFileDrop } from "../pictures/addPictureFiles";
import { PictureThumb } from "../pictures/PictureThumb";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

interface Params extends Record<string, unknown> {
  pictures: string[];
  seconds: number;
  order: PictureOrder;
  transition: string;
}

const DEFAULT_SECONDS = 30;
const NONE: string[] = [];

/**
 * Your own pictures on a screen: one, or a slideshow — Orbit Station's
 * addition to orbit-api, offered only on firmware with a picture store
 * (controlBuilt in capabilities.ts). The screen lists pictures by hash;
 * the files come from the app's library (rail: Pictures), and Apply sends
 * the ones the orb doesn't have.
 */
export function PictureForm({ screen, initialParams, onChange }: ControlFormProps) {
  usePictureLibrary();
  const capabilities = useDeviceStore((s) => s.capabilities);
  const transitions = builtTransitions(capabilities);
  const library = usePicturesStore((s) => s.pictures);
  const importing = usePicturesStore((s) => s.importing);
  // The same empty list each time: a new [] per call would read to zustand
  // as a change on every render, and re-render forever.
  const notOnOrb = useLayoutDraftStore((s) => s.live[screen]?.picturesMissing ?? NONE);
  const fileInput = useRef<HTMLInputElement>(null);

  // Every param, always: the orb reports all four back, so leaving one out
  // would make the screen look unapplied for good.
  const [params, setParams] = useState<Params>(() => {
    const listed = Array.isArray(initialParams.pictures) ? initialParams.pictures : [];
    const transition = typeof initialParams.transition === "string" ? initialParams.transition : "";
    return {
      pictures: listed.filter((h): h is string => typeof h === "string" && PICTURE_HASH.test(h)),
      seconds: typeof initialParams.seconds === "number" ? initialParams.seconds : DEFAULT_SECONDS,
      order: initialParams.order === "shuffle" ? "shuffle" : "list",
      transition: transitions.includes(transition) ? transition : transitions[0],
    };
  });
  const [secondsText, setSecondsText] = useState(String(params.seconds));
  useEmitOnChange(params, onChange);

  const set = (change: Partial<Params>) => setParams((p) => ({ ...p, ...change }));
  const full = params.pictures.length >= PICTURE_MAX_COUNT;

  const add = (hashes: string[]) =>
    setParams((p) => {
      const pictures = [...p.pictures];
      for (const hash of hashes) {
        if (!pictures.includes(hash) && pictures.length < PICTURE_MAX_COUNT) pictures.push(hash);
      }
      return { ...p, pictures };
    });
  const remove = (hash: string) => setParams((p) => ({ ...p, pictures: p.pictures.filter((h) => h !== hash) }));
  const move = (from: number, to: number) =>
    setParams((p) => {
      const pictures = [...p.pictures];
      const [hash] = pictures.splice(from, 1);
      pictures.splice(to, 0, hash);
      return { ...p, pictures };
    });

  async function addFiles(files: File[]) {
    const added = await addPictureFiles(files);
    add(added.map((p) => p.hash));
  }
  const { dragging, dropProps } = useFileDrop((files) => void addFiles(files));

  const missingCount = params.pictures.filter((h) => notOnOrb.includes(h)).length;
  const unknownCount = params.pictures.filter((h) => !library.some((p) => p.hash === h)).length;
  const nameOf = (hash: string) => library.find((p) => p.hash === hash)?.name ?? "A picture not in this app";

  return (
    <div className={`control-form picture-form${dragging ? " picture-drop-active" : ""}`} {...dropProps}>
      <div className="field">
        <span id={`picture-chosen-${screen}`}>
          On this screen{" "}
          <span className="field-hint-inline">
            {params.pictures.length} of {PICTURE_MAX_COUNT}
          </span>
        </span>
        {params.pictures.length === 0 ? (
          <p className="field-hint">
            None yet: pick some below, or drop picture files here. With one, it just shows; with more, they take
            turns.
          </p>
        ) : (
          <ol className="picture-chosen" aria-labelledby={`picture-chosen-${screen}`}>
            {params.pictures.map((hash, i) => (
              <li key={hash} className="picture-chosen-item" title={nameOf(hash)}>
                <PictureThumb hash={hash} />
                {notOnOrb.includes(hash) && (
                  <span className="picture-badge" title="Not on the orb yet">
                    new
                  </span>
                )}
                <span className="picture-chosen-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${nameOf(hash)} earlier`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Take ${nameOf(hash)} off this screen`}
                    onClick={() => remove(hash)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${nameOf(hash)} later`}
                    disabled={i === params.pictures.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {missingCount > 0 && (
        <p className="field-hint">
          {missingCount === 1 ? "One of these isn't" : `${missingCount} of these aren't`} on the orb yet, so it
          skips {missingCount === 1 ? "it" : "them"}. Apply Layout sends {missingCount === 1 ? "it" : "them"}.
        </p>
      )}
      {unknownCount > 0 && (
        <p className="field-hint">
          {unknownCount === 1 ? "One picture here isn't" : `${unknownCount} pictures here aren't`} in this
          app's library (added on another computer, or deleted). The orb keeps showing{" "}
          {unknownCount === 1 ? "it" : "them"} while it has the file.
        </p>
      )}

      <div className="field">
        <span id={`picture-library-${screen}`}>Your pictures</span>
        <div className="picture-library" role="group" aria-labelledby={`picture-library-${screen}`}>
          {library.map((picture) => {
            const chosen = params.pictures.includes(picture.hash);
            return (
              <button
                key={picture.hash}
                type="button"
                className="picture-library-item"
                aria-pressed={chosen}
                disabled={!chosen && full}
                title={chosen ? `Take ${picture.name} off this screen` : `Show ${picture.name} on this screen`}
                onClick={() => (chosen ? remove(picture.hash) : add([picture.hash]))}
              >
                <PictureThumb hash={picture.hash} />
                <span>{picture.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="picture-library-item picture-library-add"
            disabled={importing > 0}
            onClick={() => fileInput.current?.click()}
          >
            <span className="picture-thumb picture-thumb-add" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span>{importing > 0 ? "Adding…" : "Add files"}</span>
          </button>
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
            if (files.length) void addFiles(files);
          }}
        />
        <p className="field-hint">
          JPEG, PNG, GIF, WebP or BMP. The middle square is used; animated GIFs play.
        </p>
      </div>

      {params.pictures.length > 1 && (
        <>
          <label className="field">
            Seconds per picture
            <input
              type="number"
              min={5}
              max={86400}
              value={secondsText}
              onChange={(e) => {
                setSecondsText(e.target.value);
                const seconds = Number(e.target.value);
                if (Number.isInteger(seconds) && seconds > 0) set({ seconds });
              }}
            />
          </label>
          <p className="field-hint">The orb keeps this between 5 seconds and 24 hours. An animation loops for that long.</p>
          <label className="field">
            Order
            <select value={params.order} onChange={(e) => set({ order: e.target.value as PictureOrder })}>
              <option value="list">In this order</option>
              <option value="shuffle">Shuffled</option>
            </select>
          </label>
          <label className="field">
            Transition
            <select value={params.transition} onChange={(e) => set({ transition: e.target.value })}>
              {transitions.map((transition) => (
                <option key={transition} value={transition}>
                  {TRANSITION_LABELS[transition] ?? transition}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
