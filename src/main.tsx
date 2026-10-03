import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { Flyout } from "./components/flyout/Flyout";
import { FLYOUT_WINDOW, startWindowSync } from "./lib/windowSync";

// One frontend, two windows: the main window shows the app, and the tray
// flyout (src-tauri/src/tray/mod.rs) shows its own compact layout of it.
const label = getCurrentWebviewWindow().label;
void startWindowSync(label);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{label === FLYOUT_WINDOW ? <Flyout /> : <App />}</React.StrictMode>,
);
