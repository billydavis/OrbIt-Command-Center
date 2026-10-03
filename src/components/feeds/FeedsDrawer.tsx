import { useEffect, useRef, useState } from "react";
import { deleteFeed } from "../../lib/tauriCommands";
import { boundFeeds } from "../../lib/feedBindings";
import { useDeviceStore } from "../../stores/deviceStore";
import { useFeedsStore } from "../../stores/feedsStore";
import { useLayoutDraftStore } from "../../stores/layoutDraftStore";

interface FeedsDrawerProps {
  open: boolean;
  onClose: () => void;
}

// A feed that hasn't been published for this long reads as stale: its row
// dims, so a pusher that died doesn't look like a steady reading.
const STALE_AFTER_MS = 60_000;

function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

// Same drawer treatment as Profiles: a quick dip with the screen grid still
// visible behind it. Lists every feed the app holds, where each is shown,
// and how another app pushes one.
export function FeedsDrawer({ open, onClose }: FeedsDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const feeds = useFeedsStore((s) => s.feeds);
  const server = useFeedsStore((s) => s.server);
  const refresh = useFeedsStore((s) => s.refresh);
  const live = useLayoutDraftStore((s) => s.live);
  const connected = useDeviceStore((s) => s.status === "connected");
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    void refresh();
    setDeleteError(null);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    // Ages are relative to now, so they need a clock of their own — feed
    // changes alone wouldn't move the age of one that has gone quiet.
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearInterval(clock);
    };
  }, [open, onClose, refresh]);

  // Which screens follow each feed, from what's applied on the device (not
  // unsaved drafts) — "showing" should mean it's really on a screen.
  const screensByFeed = new Map<string, number[]>();
  for (const slot of connected ? Object.values(live) : []) {
    for (const feedId of Object.values(boundFeeds(slot.params))) {
      screensByFeed.set(feedId, [...(screensByFeed.get(feedId) ?? []), slot.screen]);
    }
  }
  const knownIds = new Set(feeds.map((f) => f.id));
  const missing = [...screensByFeed.keys()].filter((id) => !knownIds.has(id)).sort();

  const endpoint = server ? `http://127.0.0.1:${server.port}/feeds` : null;
  const example = endpoint
    ? `curl -H "Content-Type: application/json" -d 42 ${endpoint}/my.feed`
    : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access: the example is still there to select by hand.
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteFeed(id);
      await refresh();
    } catch (err) {
      setDeleteError(`Could not delete ${id}: ${String(err)}`);
    }
  }

  return (
    <>
      <div
        className={`profiles-drawer-scrim ${open ? "profiles-drawer-scrim-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`profiles-drawer feeds-drawer ${open ? "profiles-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Feeds"
        inert={!open}
      >
        <div className="profiles-drawer-header">
          <h2>Feeds</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="profiles-drawer-close"
            aria-label="Close feeds"
            onClick={onClose}
          >
            &#10005;
          </button>
        </div>

        <p className="field-hint feeds-intro">
          Live values a gauge can follow: pick one as a gauge's value source. Other apps on this PC
          add their own by posting to the address below.
        </p>

        <div className="feeds-endpoint">
          {server?.listening && endpoint ? (
            <>
              <p className="feeds-endpoint-status">
                <span className="feeds-endpoint-dot" aria-hidden="true" />
                Listening on <span className="mono-num">{endpoint}</span>
              </p>
              <code className="feeds-example">{example}</code>
              <div className="button-row">
                <button type="button" className="feeds-copy" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy example"}
                </button>
              </div>
            </>
          ) : server?.error ? (
            <p className="field-error" role="alert">
              Other apps can't push feeds: {server.error}. Close whatever is using port {server.port}{" "}
              and restart the app.
            </p>
          ) : (
            <p className="field-hint">Starting the feed endpoint…</p>
          )}
        </div>

        {deleteError && (
          <p className="field-error" role="alert">
            {deleteError}
          </p>
        )}

        {feeds.length === 0 && missing.length === 0 ? (
          <p className="field-hint">No feeds yet.</p>
        ) : (
          <table className="feeds-table">
            <thead>
              <tr>
                <th scope="col">Feed</th>
                <th scope="col" className="feeds-num">
                  Value
                </th>
                <th scope="col" className="feeds-num">
                  Age
                </th>
                <th scope="col">Screens</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => {
                const age = now - feed.updatedAt;
                const screens = screensByFeed.get(feed.id) ?? [];
                return (
                  <tr key={feed.id} className={age > STALE_AFTER_MS ? "feeds-row-stale" : undefined}>
                    <th scope="row" className="feeds-id">
                      {feed.id}
                      {feed.label && <span className="feeds-label">{feed.label}</span>}
                    </th>
                    <td className="feeds-num mono-num">{formatValue(feed.value)}</td>
                    <td className="feeds-num mono-num">{formatAge(age)}</td>
                    <td className="mono-num">{screens.length > 0 ? screens.join(", ") : "—"}</td>
                    <td className="feeds-actions">
                      {feed.source === "external" && (
                        <button
                          type="button"
                          className="feeds-delete"
                          aria-label={`Delete feed ${feed.id}`}
                          onClick={() => handleDelete(feed.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {missing.map((id) => (
                <tr key={id} className="feeds-row-stale">
                  <th scope="row" className="feeds-id">
                    {id}
                    <span className="feeds-label">not publishing</span>
                  </th>
                  <td className="feeds-num mono-num">—</td>
                  <td className="feeds-num mono-num">—</td>
                  <td className="mono-num">{(screensByFeed.get(id) ?? []).join(", ")}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
