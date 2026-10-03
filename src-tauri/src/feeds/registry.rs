use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Ids under this prefix belong to the app's own feeds (the sysMonitor
/// readings) — the ingest endpoint refuses to write or delete them.
pub const BUILTIN_PREFIX: &str = "sys.";

const MAX_ID_LEN: usize = 64;
const MAX_LABEL_LEN: usize = 64;

/// Feeds only ever go away when a client deletes them, so something has to
/// stop a misbehaving pusher (a new id per request) growing this forever.
const MAX_FEEDS: usize = 200;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FeedSource {
    Builtin,
    External,
}

/// One named live number. `label`/`min`/`max` are hints from whoever
/// publishes it: they pre-fill a control's form when the feed is bound, and
/// are never sent to the device on their own.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Feed {
    pub id: String,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    pub source: FeedSource,
    /// Wall-clock milliseconds since the epoch of the last publish.
    pub updated_at: u64,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
pub struct FeedHints {
    pub label: Option<String>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FeedError {
    InvalidId,
    Reserved,
    InvalidValue,
    InvalidHint(&'static str),
    Full,
    NotFound,
}

impl std::fmt::Display for FeedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeedError::InvalidId => write!(
                f,
                "feed id must be 1-{MAX_ID_LEN} characters of letters, digits, '.', '_' or '-'"
            ),
            FeedError::Reserved => write!(f, "feed ids starting with '{BUILTIN_PREFIX}' are built in"),
            FeedError::InvalidValue => write!(f, "'value' must be a finite number"),
            FeedError::InvalidHint(msg) => write!(f, "{msg}"),
            FeedError::Full => write!(f, "too many feeds (limit {MAX_FEEDS}); delete one first"),
            FeedError::NotFound => write!(f, "no such feed"),
        }
    }
}

/// Every feed the app currently knows about, built in and external alike.
/// In memory only: an external feed comes back the next time its app pushes.
#[derive(Default)]
pub struct FeedRegistry {
    feeds: Mutex<HashMap<String, Feed>>,
    /// Set by every change, cleared by `take_dirty` — lets the push loop
    /// tell the frontend about changes at its own pace rather than once per
    /// incoming request.
    dirty: AtomicBool,
}

impl FeedRegistry {
    /// Publishes one of the app's own feeds. Ids are compile-time constants,
    /// so nothing here is validated.
    pub fn publish_builtin(&self, id: &str, value: f64, hints: FeedHints) {
        self.upsert(id, value, hints, FeedSource::Builtin);
    }

    /// Creates or updates a feed on behalf of an outside app. A hint left
    /// out keeps whatever an earlier push set, so an app can describe its
    /// feed once and then send bare values.
    pub fn push_external(&self, id: &str, value: f64, hints: FeedHints) -> Result<Feed, FeedError> {
        validate_id(id)?;
        if id.starts_with(BUILTIN_PREFIX) {
            return Err(FeedError::Reserved);
        }
        if !value.is_finite() {
            return Err(FeedError::InvalidValue);
        }
        if hints.label.as_ref().is_some_and(|l| l.chars().count() > MAX_LABEL_LEN) {
            return Err(FeedError::InvalidHint("'label' is too long (64 characters at most)"));
        }
        if hints.min.is_some_and(|v| !v.is_finite()) || hints.max.is_some_and(|v| !v.is_finite()) {
            return Err(FeedError::InvalidHint("'min' and 'max' must be finite numbers"));
        }
        {
            let feeds = self.feeds.lock().expect("feeds mutex poisoned");
            if !feeds.contains_key(id) && feeds.len() >= MAX_FEEDS {
                return Err(FeedError::Full);
            }
        }
        Ok(self.upsert(id, value, hints, FeedSource::External))
    }

    pub fn remove_external(&self, id: &str) -> Result<(), FeedError> {
        if id.starts_with(BUILTIN_PREFIX) {
            return Err(FeedError::Reserved);
        }
        let removed = self.feeds.lock().expect("feeds mutex poisoned").remove(id);
        if removed.is_none() {
            return Err(FeedError::NotFound);
        }
        self.dirty.store(true, Ordering::Relaxed);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<Feed> {
        self.feeds.lock().expect("feeds mutex poisoned").get(id).cloned()
    }

    pub fn value(&self, id: &str) -> Option<f64> {
        self.feeds.lock().expect("feeds mutex poisoned").get(id).map(|f| f.value)
    }

    /// Every feed, sorted by id so the list doesn't reshuffle between reads.
    pub fn list(&self) -> Vec<Feed> {
        let mut feeds: Vec<Feed> =
            self.feeds.lock().expect("feeds mutex poisoned").values().cloned().collect();
        feeds.sort_by(|a, b| a.id.cmp(&b.id));
        feeds
    }

    /// Whether anything changed since the last call.
    pub fn take_dirty(&self) -> bool {
        self.dirty.swap(false, Ordering::Relaxed)
    }

    fn upsert(&self, id: &str, value: f64, hints: FeedHints, source: FeedSource) -> Feed {
        let mut feeds = self.feeds.lock().expect("feeds mutex poisoned");
        let previous = feeds.get(id);
        let feed = Feed {
            id: id.to_string(),
            value,
            label: hints.label.or_else(|| previous.and_then(|p| p.label.clone())),
            min: hints.min.or_else(|| previous.and_then(|p| p.min)),
            max: hints.max.or_else(|| previous.and_then(|p| p.max)),
            source,
            updated_at: now_millis(),
        };
        feeds.insert(id.to_string(), feed.clone());
        self.dirty.store(true, Ordering::Relaxed);
        feed
    }
}

fn validate_id(id: &str) -> Result<(), FeedError> {
    let ok = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if ok {
        Ok(())
    } else {
        Err(FeedError::InvalidId)
    }
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_push_creates_then_updates() {
        let registry = FeedRegistry::default();
        let created = registry.push_external("build.progress", 10.0, FeedHints::default()).unwrap();
        assert_eq!(created.source, FeedSource::External);

        registry.push_external("build.progress", 55.0, FeedHints::default()).unwrap();
        assert_eq!(registry.value("build.progress"), Some(55.0));
        assert_eq!(registry.list().len(), 1);
    }

    #[test]
    fn hints_survive_a_later_push_without_them() {
        let registry = FeedRegistry::default();
        let hints = FeedHints { label: Some("Build".into()), min: Some(0.0), max: Some(200.0) };
        registry.push_external("build", 1.0, hints).unwrap();
        let updated = registry.push_external("build", 2.0, FeedHints::default()).unwrap();

        assert_eq!(updated.label.as_deref(), Some("Build"));
        assert_eq!(updated.max, Some(200.0));
    }

    #[test]
    fn bad_ids_are_rejected() {
        let registry = FeedRegistry::default();
        for id in ["", "has space", "slash/y", &"x".repeat(65)] {
            assert_eq!(
                registry.push_external(id, 1.0, FeedHints::default()),
                Err(FeedError::InvalidId),
                "id {id:?} should be rejected"
            );
        }
    }

    #[test]
    fn builtin_prefix_is_off_limits_to_external_writers() {
        let registry = FeedRegistry::default();
        registry.publish_builtin("sys.cpu", 12.0, FeedHints::default());

        assert_eq!(
            registry.push_external("sys.cpu", 99.0, FeedHints::default()),
            Err(FeedError::Reserved)
        );
        assert_eq!(registry.remove_external("sys.cpu"), Err(FeedError::Reserved));
        assert_eq!(registry.value("sys.cpu"), Some(12.0));
    }

    #[test]
    fn non_finite_values_are_rejected() {
        let registry = FeedRegistry::default();
        assert_eq!(
            registry.push_external("a", f64::NAN, FeedHints::default()),
            Err(FeedError::InvalidValue)
        );
    }

    #[test]
    fn new_feeds_are_refused_once_full_but_existing_ones_still_update() {
        let registry = FeedRegistry::default();
        for i in 0..MAX_FEEDS {
            registry.push_external(&format!("f{i}"), 0.0, FeedHints::default()).unwrap();
        }
        assert_eq!(
            registry.push_external("one-more", 0.0, FeedHints::default()),
            Err(FeedError::Full)
        );
        assert!(registry.push_external("f0", 5.0, FeedHints::default()).is_ok());
    }

    #[test]
    fn remove_reports_a_missing_feed() {
        let registry = FeedRegistry::default();
        assert_eq!(registry.remove_external("nope"), Err(FeedError::NotFound));
    }

    #[test]
    fn dirty_flag_is_set_by_changes_and_cleared_by_reading_it() {
        let registry = FeedRegistry::default();
        assert!(!registry.take_dirty());
        registry.push_external("a", 1.0, FeedHints::default()).unwrap();
        assert!(registry.take_dirty());
        assert!(!registry.take_dirty());
    }
}
