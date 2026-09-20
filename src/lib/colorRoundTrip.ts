// Device GET responses report analogClock/gauge colors as raw RGB565 ints,
// not the names these forms edit — Utils::stringToColor() has no reverse
// lookup (docs/orbit-api.md), so a numeric value here can't be resolved to
// the name that's actually showing on the device. Silently substituting a
// hardcoded default in that case would misrepresent current device state,
// so callers use `unknown` to show an honest "can't read this back" state
// instead of guessing.
export function resolveColorField(raw: unknown): { value: string; unknown: boolean } {
  if (typeof raw === "string") return { value: raw, unknown: false };
  if (typeof raw === "number") return { value: "", unknown: true };
  return { value: "", unknown: false };
}
