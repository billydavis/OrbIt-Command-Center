import { useEffect } from "react";
import type { ControlFormProps } from "./types";

export function AsteroidsForm({ onChange }: ControlFormProps) {
  useEffect(() => {
    onChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <p className="field-hint">
      Decorative starfield screensaver. No params — nothing to configure here.
    </p>
  );
}
