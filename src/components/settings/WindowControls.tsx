import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Minimize, maximize/restore and close for the app's own title bar. Windows
// only: there the native title bar is turned off
// (src-tauri/tauri.windows.conf.json) and the header stands in for it.
// Close and minimize go through the same window events the native buttons
// raised, so they still send the window to the tray (see tray/mod.rs).
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const sync = () => {
      appWindow.isMaximized().then(setMaximized).catch(() => {});
    };
    sync();
    const unlisten = appWindow.onResized(sync);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const appWindow = getCurrentWindow();

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void appWindow.minimize()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => void appWindow.toggleMaximize()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          {maximized ? (
            <>
              <rect x="2" y="4" width="6" height="6" />
              <path d="M4 4V2h6v6H8" />
            </>
          ) : (
            <rect x="2" y="2" width="8" height="8" />
          )}
        </svg>
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        aria-label="Close to tray"
        title="Close to tray"
        onClick={() => void appWindow.close()}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}
