import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { analogClockParamsSchema, type AnalogClockParams } from "../../lib/controlSchemas";
import { ColorInput } from "../shared/ColorInput";
import { colorParam, COLORS } from "../../lib/rgb565";
import { builtInDrawing, drawingFor, LABELS } from "../../lib/clockFaceRenderer";
import { clockFaceMissing } from "../../lib/clockFaceSync";
import { useDeviceStore } from "../../stores/deviceStore";
import { useClockFacesStore } from "../../stores/clockFacesStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";
import { ClockFaceView, thumbnailTime } from "../clockfaces/ClockFaceLayer";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

const FIELDS: { name: keyof AnalogClockParams; label: string }[] = [
  { name: "background", label: "Background" },
  { name: "tickColor", label: "Tick marks" },
  { name: "hourColor", label: "Hour hand" },
  { name: "minuteColor", label: "Minute hand" },
  { name: "secondColor", label: "Second hand" },
];

/**
 * Firmware with clock face files (capabilities.clockFaces) gets the clock
 * face picker; anything older keeps the colour form it has always had.
 */
export function AnalogClockForm(props: ControlFormProps) {
  const clockFaces = useDeviceStore((s) => s.capabilities?.clockFaces ?? null);
  return clockFaces ? <ClockFaceForm {...props} builtIn={clockFaces.builtIn} /> : <ColorsForm {...props} />;
}

// The fallbacks are the firmware's own defaults (AnalogClockControl.h), only
// used when switching a screen to this control — a live clock always reports
// all five colors.
function colorDefaults(initialParams: Record<string, unknown>): Required<AnalogClockParams> {
  return {
    background: colorParam(initialParams.background, COLORS.black),
    tickColor: colorParam(initialParams.tickColor, COLORS.white),
    hourColor: colorParam(initialParams.hourColor, COLORS.white),
    minuteColor: colorParam(initialParams.minuteColor, COLORS.white),
    secondColor: colorParam(initialParams.secondColor, COLORS.red),
  };
}

function ColorFields({ values, onChange }: { values: AnalogClockParams; onChange: (name: keyof AnalogClockParams, v: number) => void }) {
  return (
    <>
      {FIELDS.map(({ name, label }) => (
        <ColorInput
          key={name}
          id={`analogClock-${name}`}
          label={label}
          value={values[name] ?? COLORS.black}
          onChange={(v) => onChange(name, v)}
        />
      ))}
    </>
  );
}

function ColorsForm({ initialParams, onChange }: ControlFormProps) {
  const { setValue, watch } = useForm<AnalogClockParams>({
    resolver: zodResolver(analogClockParamsSchema),
    defaultValues: colorDefaults(initialParams),
  });

  const values = watch();
  useEmitOnChange(values, onChange);

  return (
    <div className="control-form">
      <ColorFields values={values} onChange={(name, v) => setValue(name, v)} />
    </div>
  );
}

const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * The orb's own clock face settings: which clock face (one built into the
 * firmware, or one saved here), and the options that work with any of them.
 * Every param goes out on every change, since a screen write replaces all
 * of them: switching clock face keeps classic's colours, and params this
 * form doesn't know about are passed straight back.
 */
function ClockFaceForm({ screen, initialParams, onChange, builtIn }: ControlFormProps & { builtIn: string[] }) {
  const faces = useClockFacesStore((s) => s.faces);
  const hashes = useClockFacesStore((s) => s.hashes);
  const openEditor = useClockFacesStore((s) => s.openEditor);
  const missing = useLayoutDraftStore((s) => clockFaceMissing(s.live[screen], s.draft[screen]));

  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...initialParams,
    ...colorDefaults(initialParams),
    clockFace: builtIn.includes(str(initialParams.clockFace)) ? initialParams.clockFace : (builtIn[0] ?? "classic"),
    clockFaceId: str(initialParams.clockFaceId),
    clockFaceHash: str(initialParams.clockFaceHash),
    seconds: initialParams.seconds !== false,
    motion: initialParams.motion === "sweep" ? "sweep" : "tick",
    // Only firmware with the ring reports it; sending it to older firmware
    // is harmless but would leave the screen looking unapplied for good.
    ...("secondsRing" in initialParams ? { secondsRing: initialParams.secondsRing === true } : {}),
    timeZone: str(initialParams.timeZone),
    zone2: str(initialParams.zone2),
  }));
  const set = (change: Record<string, unknown>) => setParams((p) => ({ ...p, ...change }));
  useEmitOnChange(params, onChange);

  const savedId = str(params.clockFaceId);
  const saved = faces.find((f) => f.id === savedId);
  const thumbTime = useMemo(thumbnailTime, []);
  const builtInName = str(params.clockFace);
  // Only a face with a zone hand takes a second time zone: the built-in
  // ones, and saved ones made with it (one not saved here: can't tell).
  const takesZone = !savedId || !saved || saved.recipe.zone;

  return (
    <div className="control-form">
      <div className="field">
        <span id={`clock-face-label-${screen}`}>Clock face</span>
        <div className="clock-face-picker" role="radiogroup" aria-labelledby={`clock-face-label-${screen}`}>
          {builtIn.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={!savedId && builtInName === name}
              className="clock-face-option"
              onClick={() => set({ clockFace: name, clockFaceId: "", clockFaceHash: "" })}
            >
              <ClockFaceView className="clock-face-thumb" drawing={builtInDrawing(name, params)} now={thumbTime} />
              <span>{LABELS[name] ?? name}</span>
            </button>
          ))}
          {faces.map((face) => (
            <button
              key={face.id}
              type="button"
              role="radio"
              aria-checked={savedId === face.id}
              className="clock-face-option"
              onClick={() => set({ clockFaceId: face.id, clockFaceHash: hashes[face.id] ?? "" })}
            >
              <ClockFaceView className="clock-face-thumb" drawing={drawingFor(face.recipe)} now={thumbTime} />
              <span>{face.name}</span>
            </button>
          ))}
          {savedId && !saved && (
            <button type="button" role="radio" aria-checked className="clock-face-option" disabled>
              <span className="clock-face-thumb clock-face-thumb-unknown" aria-hidden="true">?</span>
              <span>Not saved here</span>
            </button>
          )}
        </div>
      </div>

      <div className="button-row">
        {saved && (
          <button type="button" onClick={() => openEditor(saved.id)}>
            Edit clock face
          </button>
        )}
        <button type="button" onClick={() => openEditor(null, screen)}>
          New clock face
        </button>
      </div>

      {missing && (
        <p className="field-hint">
          The orb doesn't have this clock face yet, so it's showing its built-in one. Apply Layout sends it.
        </p>
      )}
      {savedId && !saved && (
        <p className="field-hint">
          This screen's clock face was made somewhere else or deleted. The orb keeps showing it while it
          has the file; pick another to change it.
        </p>
      )}

      <label className="field-checkbox">
        <input type="checkbox" checked={params.seconds === true} onChange={(e) => set({ seconds: e.target.checked })} />
        Second hand
      </label>
      {params.seconds === true && (
        <label className="field-checkbox">
          <input
            type="checkbox"
            checked={params.motion === "sweep"}
            onChange={(e) => set({ motion: e.target.checked ? "sweep" : "tick" })}
          />
          Smooth sweep (about 10 frames a second, more work for the orb)
        </label>
      )}
      {/* A saved clock face has its own ring (the builder's Extras); this
          is the built-in faces' one. */}
      {params.seconds === true && !savedId && (
        <label className="field-checkbox">
          <input
            type="checkbox"
            checked={params.secondsRing === true}
            onChange={(e) => set({ secondsRing: e.target.checked })}
          />
          Seconds ring round the rim
        </label>
      )}

      <div className="field-row">
        <label className="field">
          Time zone
          <input
            list="clock-time-zones"
            placeholder="The orb's own"
            value={str(params.timeZone)}
            onChange={(e) => set({ timeZone: e.target.value.trim() })}
          />
        </label>
        {takesZone && (
          <label className="field">
            Second time zone
            <input
              list="clock-time-zones"
              placeholder="None"
              value={str(params.zone2)}
              onChange={(e) => set({ zone2: e.target.value.trim() })}
            />
          </label>
        )}
      </div>
      <datalist id="clock-time-zones">
        {TIME_ZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
      <p className="field-hint">
        {takesZone
          ? "A city's IANA name, like Europe/London. The second time zone adds a hand that goes round once a day and the city's name on the dial."
          : "A city's IANA name, like Europe/London. This clock face has no second time zone hand; add one in the builder to show a second city."}
      </p>

      {!savedId && builtInName === "classic" && (
        <ColorFields values={params as AnalogClockParams} onChange={(name, v) => set({ [name]: v })} />
      )}
    </div>
  );
}
