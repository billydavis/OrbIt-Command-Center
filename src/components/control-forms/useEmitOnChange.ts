import { useEffect } from "react";

// Forms use react-hook-form's `watch()` purely as local state; this pushes
// the current (valid) values up to the layout draft store on every change,
// so there's no separate "Save" step per field. Keyed off a JSON string so
// the effect only fires when the actual values change, not on every render.
export function useEmitOnChange<T extends Record<string, unknown>>(
  values: T,
  onChange: (values: T) => void,
) {
  const key = JSON.stringify(values);
  useEffect(() => {
    onChange(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
