//! Feeds: named live numbers the app holds on behalf of whoever publishes
//! them — its own sysMonitor readings, or any other app on this PC via the
//! local ingest endpoint (docs/feeds-api.md). A screen param can be bound to
//! a feed, and the push loop keeps the device showing its latest value.

pub mod bindings;
mod pusher;
mod registry;
mod server;

pub use bindings::Bindings;
pub use registry::{Feed, FeedHints, FeedRegistry};
pub use server::FeedServerStatus;

use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Loads saved bindings, then starts the ingest endpoint and the push loop.
pub fn spawn(app: AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        app.state::<AppState>().bindings.load(dir.join("feeds.json"));
    }
    server::spawn(app.clone());
    pusher::spawn(app);
}
