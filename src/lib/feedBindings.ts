import type { ControlType } from "./types";

// A feed binding rides along in a slot's params under this reserved key —
// `{ "$bind": { "value": "sys.cpu" } }` keeps `value` equal to the sys.cpu
// feed. The Rust side strips it before anything is sent to the device and
// re-attaches it to everything it hands back (src-tauri/src/feeds/
// bindings.rs), so here it behaves like any other param: it's part of the
// draft, it makes a screen dirty, and it's saved in profiles.
export const BIND_KEY = "$bind";

// Which params of which controls can follow a feed. A control joins by
// getting an entry here and a source picker in its form.
export const BINDABLE_PARAMS: Partial<Record<ControlType, readonly string[]>> = {
  gauge: ["value"],
};

/** Every binding in `params`, as param name -> feed id. */
export function boundFeeds(params: Record<string, unknown>): Record<string, string> {
  const raw = params[BIND_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const bound: Record<string, string> = {};
  for (const [param, feed] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof feed === "string" && feed) bound[param] = feed;
  }
  return bound;
}

/** The feed `param` follows, or "" if it's set by hand. */
export function boundFeed(params: Record<string, unknown>, param: string): string {
  return boundFeeds(params)[param] ?? "";
}

/**
 * `params` with `param` bound to `feedId` — or, given "", unbound. The key
 * is dropped entirely once nothing is bound, so an unbound slot's params
 * look exactly as they did before feeds existed.
 */
export function withBoundFeed<T extends Record<string, unknown>>(
  params: T,
  param: string,
  feedId: string,
): T {
  const bound = boundFeeds(params);
  if (feedId) {
    bound[param] = feedId;
  } else {
    delete bound[param];
  }
  const next: Record<string, unknown> = { ...params };
  if (Object.keys(bound).length > 0) {
    next[BIND_KEY] = bound;
  } else {
    delete next[BIND_KEY];
  }
  return next as T;
}
