import { useState } from "react";
import { customParamsSchema } from "../../lib/controlSchemas";
import type { ControlFormProps } from "./types";

// v1 edits `custom`'s params as raw JSON rather than a visual
// drawing-primitive builder (text/line/rectangle/triangle/circle/arc/
// character) — that's real design work, deferred past v1. This just needs
// to be valid JSON; the device does the real shape validation and returns
// a 400 with a specific message if it's wrong, which the Apply flow surfaces.
export function CustomForm({ initialParams, onChange }: ControlFormProps) {
  const [text, setText] = useState(() => JSON.stringify(initialParams, null, 2));
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string) {
    setText(value);
    try {
      const parsed = customParamsSchema.parse(JSON.parse(value));
      setError(null);
      onChange(parsed);
    } catch {
      setError("Not valid JSON — edits won't be applied until this is fixed.");
    }
  }

  return (
    <div className="control-form">
      <label className="field" htmlFor="custom-json">
        Params (raw JSON)
      </label>
      <textarea
        id="custom-json"
        className="json-editor"
        rows={10}
        value={text}
        onChange={(e) => handleChange(e.currentTarget.value)}
        spellCheck={false}
      />
      {error && <p className="field-error">{error}</p>}
      <p className="field-hint">
        e.g. {`{ "data": "Hi" }`} or {`{ "data": [{ "type": "text", "x": 120, "y": 120, "text": "Hi", "color": "white", "alignment": "mc" }] }`}
      </p>
    </div>
  );
}
