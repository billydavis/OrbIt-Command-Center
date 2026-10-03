// Windows is the one platform with behavior of its own here: the app draws
// its own title bar there (src-tauri/tauri.windows.conf.json turns the
// native one off) and can live in the tray without a taskbar button.
export const IS_WINDOWS = navigator.userAgent.includes("Windows");
