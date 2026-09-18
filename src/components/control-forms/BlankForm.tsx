import { useEffect } from "react";
import type { ControlFormProps } from "./types";

export function BlankForm({ onChange }: ControlFormProps) {
  useEffect(() => {
    onChange({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <p className="field-hint">Clears the screen to black. No params.</p>;
}
