import { useEffect, useRef, useState } from "react";

interface ConnectionControlProps {
  host: string;
  refreshing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}

// Folds Disconnect/Refresh behind the connection status itself, rather than
// as standalone header buttons — the header stays as uncluttered as the
// mockups while the actions stay one click away from the status they act on.
export function ConnectionControl({ host, refreshing, onRefresh, onDisconnect }: ConnectionControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="connection-control" ref={containerRef}>
      <button
        type="button"
        className="connection-control-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="connected-status-dot" aria-hidden="true" />
        Connected to <strong>{host}</strong>
      </button>
      {open && (
        <div className="connection-control-panel" role="dialog" aria-label="Connection">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => {
              onRefresh();
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
