import { boundFeed, withBoundFeed } from "../../lib/feedBindings";
import type { Feed } from "../../lib/types";
import { useFeedsStore } from "../../stores/feedsStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";

interface FeedsPanelProps {
  /** The screen a clicked feed is put on; null while none is selected. */
  screen: number | null;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

// The rail's always-visible feed list: every feed with its live value, and
// one click to put it on the selected screen. Ages, deleting and the push
// address live in the Feeds drawer (FeedsDrawer.tsx).
export function FeedsPanel({ screen }: FeedsPanelProps) {
  const feeds = useFeedsStore((s) => s.feeds);
  const draft = useLayoutDraftStore((s) => (screen === null ? undefined : s.draft[screen]));
  const replaceDraftSlot = useLayoutDraftStore((s) => s.replaceDraftSlot);

  // Makes the selected screen a gauge following `feed` — as a draft, like
  // any other edit, so it still goes to the orb through Apply Layout. A
  // screen that's already a gauge keeps its style and colors and only
  // changes what it follows.
  function showOnScreen(feed: Feed) {
    if (screen === null) return;
    const base =
      draft?.control === "gauge" ? draft.params : { value: feed.value, min: 0, max: 100, style: "ring" };
    const params = withBoundFeed(
      {
        ...base,
        label: feed.label ?? feed.id,
        ...(feed.min !== undefined ? { min: feed.min } : {}),
        ...(feed.max !== undefined ? { max: feed.max } : {}),
      },
      "value",
      feed.id,
    );
    replaceDraftSlot(screen, { control: "gauge", params });
  }

  if (feeds.length === 0) {
    return <p className="field-hint">No feeds yet.</p>;
  }

  return (
    <>
      <ul className="feeds-panel">
        {feeds.map((feed) => {
          const min = feed.min ?? 0;
          const max = feed.max ?? 100;
          const fraction = Math.max(0, Math.min(1, (feed.value - min) / (max - min || 1)));
          const shown = draft?.control === "gauge" && boundFeed(draft.params, "value") === feed.id;
          return (
            <li key={feed.id}>
              <button
                type="button"
                className={`feeds-panel-row${shown ? " feeds-panel-row-shown" : ""}`}
                disabled={screen === null}
                aria-pressed={shown}
                title={screen === null ? feed.id : `Show ${feed.id} on screen ${screen}`}
                onClick={() => showOnScreen(feed)}
              >
                <span className="feeds-panel-id">{feed.id}</span>
                <span className="mono-num">{formatValue(feed.value)}</span>
                <span className="feeds-panel-bar" aria-hidden="true">
                  <span style={{ width: `${fraction * 100}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {screen !== null && (
        <p className="field-hint">
          Click a feed to show it on screen <span className="mono-num">{screen}</span>.
        </p>
      )}
    </>
  );
}
