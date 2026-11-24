use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use super::registry::FeedRegistry;
use crate::device::ScreenSlot;
use crate::persistence::store::{read_json, write_json_atomic};

/// The reserved params key a binding travels under between the frontend and
/// this app: `{ "$bind": { "value": "sys.cpu" } }` means "keep `value` equal
/// to the `sys.cpu` feed". The device never sees it — it's split off before
/// every write and re-attached to every slot handed back to the frontend, so
/// the designer's draft/dirty/Apply flow and saved profiles carry bindings
/// like any other param.
pub const BIND_KEY: &str = "$bind";

/// Which of one screen's params follow which feeds. `control` is the control
/// the binding was made for: while the screen shows anything else (a
/// countdown set over it, say) the binding is simply ignored, and picks up
/// again if that control comes back.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ScreenBinding {
    pub control: String,
    /// param name -> feed id
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct BindingsFile {
    #[serde(default)]
    screens: BTreeMap<u8, ScreenBinding>,
}

/// Bindings for the connected device's screens, saved to `feeds.json` in the
/// app's data dir — the device has no idea a gauge's value comes from a
/// feed, so this is the only record of it.
#[derive(Default)]
pub struct Bindings {
    screens: Mutex<BTreeMap<u8, ScreenBinding>>,
    /// `None` until `load` runs (and in tests): changes then stay in memory.
    path: Mutex<Option<PathBuf>>,
}

impl Bindings {
    pub fn load(&self, path: PathBuf) {
        let file: BindingsFile = read_json(&path);
        *self.screens.lock().expect("bindings mutex poisoned") = file.screens;
        *self.path.lock().expect("bindings path mutex poisoned") = Some(path);
    }

    pub fn get(&self, screen: u8) -> Option<ScreenBinding> {
        self.screens.lock().expect("bindings mutex poisoned").get(&screen).cloned()
    }

    pub fn all(&self) -> BTreeMap<u8, ScreenBinding> {
        self.screens.lock().expect("bindings mutex poisoned").clone()
    }

    /// Whether any binding follows one of `feed_ids`.
    pub fn references_any(&self, feed_ids: &[&str]) -> bool {
        self.screens
            .lock()
            .expect("bindings mutex poisoned")
            .values()
            .any(|b| b.params.values().any(|feed| feed_ids.contains(&feed.as_str())))
    }

    /// Sets (or with `None`, clears) one screen's binding. The file is only
    /// rewritten when something actually changed. A failed save is not
    /// reported: the binding still works for as long as the app runs, and
    /// the device write it accompanies has already succeeded.
    pub fn set(&self, screen: u8, binding: Option<ScreenBinding>) {
        let snapshot = {
            let mut screens = self.screens.lock().expect("bindings mutex poisoned");
            if screens.get(&screen) == binding.as_ref() {
                return;
            }
            match binding {
                Some(b) => screens.insert(screen, b),
                None => screens.remove(&screen),
            };
            screens.clone()
        };
        if let Some(path) = self.path.lock().expect("bindings path mutex poisoned").as_ref() {
            let _ = write_json_atomic(path, &BindingsFile { screens: snapshot });
        }
    }
}

/// The feeds a control always follows, whatever its params say. Orbit
/// Station's `claudeUsage` shows Claude plan usage and nothing else, so it's
/// bound to the four `claude.*` feeds the status line script publishes
/// (examples/claude-usage-statusline.ps1) on every screen that shows it —
/// set from here, a profile, or another client — with nothing to choose.
pub fn built_in(control: &str) -> Option<ScreenBinding> {
    if control != "claudeUsage" {
        return None;
    }
    let params = [
        ("session", "claude.session"),
        ("week", "claude.week"),
        ("sessionResetsAt", "claude.sessionResetsAt"),
        ("weekResetsAt", "claude.weekResetsAt"),
    ]
    .into_iter()
    .map(|(param, feed)| (param.to_string(), feed.to_string()))
    .collect();
    Some(ScreenBinding { control: control.to_string(), params })
}

/// The binding `slot` follows right now: a control's built-in one, or else
/// the one saved for that screen if it was made for this control.
pub fn effective(slot: &ScreenSlot, saved: Option<ScreenBinding>) -> Option<ScreenBinding> {
    built_in(&slot.control).or_else(|| saved.filter(|b| b.control == slot.control))
}

/// Splits `$bind` off outgoing params. Returns the params as the device
/// should get them, and the binding they asked for (`None` for a slot with
/// no usable `$bind`, which clears any binding the screen had). A control
/// with a built-in binding never has one saved: that's always `None`.
pub fn split(control: &str, mut params: serde_json::Value) -> (serde_json::Value, Option<ScreenBinding>) {
    let Some(object) = params.as_object_mut() else { return (params, None) };
    let raw = object.remove(BIND_KEY);
    if built_in(control).is_some() {
        return (params, None);
    }
    let Some(raw) = raw else { return (params, None) };

    let bound: BTreeMap<String, String> = raw
        .as_object()
        .map(|o| {
            o.iter()
                .filter_map(|(param, feed)| {
                    feed.as_str().filter(|f| !f.is_empty()).map(|f| (param.clone(), f.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();

    if bound.is_empty() {
        return (params, None);
    }
    (params, Some(ScreenBinding { control: control.to_string(), params: bound }))
}

/// Overwrites each bound param with its feed's current value, so a write
/// carries the live reading rather than whatever number the form last held.
/// A feed that isn't there (yet) leaves its param alone.
pub fn fill_values(params: &mut serde_json::Value, binding: &ScreenBinding, feeds: &FeedRegistry) {
    let Some(object) = params.as_object_mut() else { return };
    for (param, feed_id) in &binding.params {
        if let Some(value) = feeds.value(feed_id) {
            object.insert(param.clone(), reading_json(value));
        }
    }
}

/// A feed reading as the device should get it. Whole numbers go as JSON
/// integers: a param like claudeUsage's `sessionResetsAt` (Unix seconds)
/// must be an integer on the device, and `1795535998.0` isn't one there.
/// A control taking a float accepts an integer just the same.
fn reading_json(value: f64) -> serde_json::Value {
    // 2^53: past this an f64 can't tell neighbouring integers apart anyway.
    const EXACT: f64 = 9_007_199_254_740_992.0;
    if value.fract() == 0.0 && value.abs() <= EXACT {
        serde_json::json!(value as i64)
    } else {
        serde_json::json!(value)
    }
}

/// Re-adds `$bind` to a slot on its way to the frontend, if `binding` is for
/// the control that screen is showing.
pub fn attach(slot: &mut ScreenSlot, binding: Option<&ScreenBinding>) {
    // A built-in binding isn't the frontend's to see or change (and one
    // saved before it was built in is stale).
    if built_in(&slot.control).is_some() {
        return;
    }
    let Some(binding) = binding.filter(|b| b.control == slot.control) else { return };
    if let Some(object) = slot.params.as_object_mut() {
        object.insert(BIND_KEY.to_string(), serde_json::json!(binding.params));
    }
}

/// The params to push to `slot` so its bound params match their feeds, or
/// `None` if there's nothing to do: the screen is showing a different
/// control, no bound feed has a value yet, or every one already matches.
pub fn pending_push(
    slot: &ScreenSlot,
    binding: &ScreenBinding,
    feeds: &FeedRegistry,
) -> Option<serde_json::Value> {
    if slot.control != binding.control {
        return None;
    }
    let mut params = slot.params.clone();
    let object = params.as_object_mut()?;
    let mut changed = false;
    for (param, feed_id) in &binding.params {
        let Some(value) = feeds.value(feed_id) else { continue };
        let current = object.get(param).and_then(|v| v.as_f64());
        if current.is_some_and(|c| same_reading(c, value)) {
            continue;
        }
        object.insert(param.clone(), reading_json(value));
        changed = true;
    }
    changed.then_some(params)
}

/// The device stores a gauge's value as a 32-bit float and echoes that back,
/// so what it reports rarely equals the 64-bit number sent bit for bit.
/// Whole numbers go out as integers (see `reading_json`) and come back
/// exactly, so they compare exactly: a relative margin would hide whole
/// days of change in a Unix time like claudeUsage's reset times.
fn same_reading(a: f64, b: f64) -> bool {
    if a.fract() == 0.0 && b.fract() == 0.0 {
        return a == b;
    }
    (a - b).abs() <= 1e-4 * b.abs().max(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::feeds::registry::FeedHints;
    use serde_json::json;

    fn gauge_slot(params: serde_json::Value) -> ScreenSlot {
        ScreenSlot { screen: 2, control: "gauge".into(), params, updated_at: 1, saved_control: None }
    }

    fn cpu_binding() -> ScreenBinding {
        ScreenBinding {
            control: "gauge".into(),
            params: BTreeMap::from([("value".to_string(), "sys.cpu".to_string())]),
        }
    }

    fn registry_with_cpu(value: f64) -> FeedRegistry {
        let registry = FeedRegistry::default();
        registry.publish_builtin("sys.cpu", value, FeedHints::default());
        registry
    }

    #[test]
    fn split_removes_the_bind_key_and_returns_the_binding() {
        let (clean, binding) =
            split("gauge", json!({ "label": "CPU", "value": 3, "$bind": { "value": "sys.cpu" } }));

        assert_eq!(clean, json!({ "label": "CPU", "value": 3 }));
        assert_eq!(binding, Some(cpu_binding()));
    }

    #[test]
    fn split_without_a_usable_bind_key_yields_no_binding() {
        for params in [
            json!({ "value": 3 }),
            json!({ "value": 3, "$bind": {} }),
            json!({ "value": 3, "$bind": { "value": "" } }),
            json!({ "value": 3, "$bind": "sys.cpu" }),
        ] {
            let (clean, binding) = split("gauge", params);
            assert_eq!(clean, json!({ "value": 3 }));
            assert_eq!(binding, None);
        }
    }

    #[test]
    fn attach_round_trips_what_split_removed() {
        let original = json!({ "label": "CPU", "value": 3, "$bind": { "value": "sys.cpu" } });
        let (clean, binding) = split("gauge", original.clone());

        let mut slot = gauge_slot(clean);
        attach(&mut slot, binding.as_ref());

        assert_eq!(slot.params, original);
    }

    #[test]
    fn attach_skips_a_screen_showing_another_control() {
        let mut slot = ScreenSlot {
            screen: 2,
            control: "countdown".into(),
            params: json!({ "state": "running" }),
            updated_at: 1,
            saved_control: None,
        };
        attach(&mut slot, Some(&cpu_binding()));
        assert_eq!(slot.params, json!({ "state": "running" }));
    }

    #[test]
    fn fill_values_uses_the_feed_reading_and_leaves_unknown_feeds_alone() {
        let registry = registry_with_cpu(42.0);
        let mut params = json!({ "value": 3, "max": 100 });
        let binding = ScreenBinding {
            control: "gauge".into(),
            params: BTreeMap::from([
                ("value".to_string(), "sys.cpu".to_string()),
                ("max".to_string(), "not.there".to_string()),
            ]),
        };

        fill_values(&mut params, &binding, &registry);

        assert_eq!(params, json!({ "value": 42, "max": 100 }));
    }

    #[test]
    fn claude_usage_follows_its_four_feeds_with_nothing_saved() {
        // A $bind in its params is dropped, and nothing is saved for it.
        let (clean, saved) =
            split("claudeUsage", json!({ "style": "orbit", "$bind": { "session": "sys.cpu" } }));
        assert_eq!(clean, json!({ "style": "orbit" }));
        assert_eq!(saved, None);

        // It still follows the claude.* feeds, saved binding or not.
        let slot = ScreenSlot {
            screen: 3,
            control: "claudeUsage".into(),
            params: json!({ "style": "pace" }),
            updated_at: 1,
            saved_control: None,
        };
        let binding = effective(&slot, None).expect("built in");
        assert_eq!(binding.params["week"], "claude.week");
        assert_eq!(binding.params["weekResetsAt"], "claude.weekResetsAt");
        assert_eq!(binding.params.len(), 4);
        assert_eq!(effective(&slot, Some(cpu_binding())), Some(binding));
    }

    #[test]
    fn other_controls_follow_only_a_saved_binding_made_for_them() {
        let gauge = gauge_slot(json!({ "value": 3 }));
        assert_eq!(effective(&gauge, Some(cpu_binding())), Some(cpu_binding()));
        assert_eq!(effective(&gauge, None), None);
        let weather = ScreenSlot { control: "weather".into(), ..gauge_slot(json!({})) };
        assert_eq!(effective(&weather, Some(cpu_binding())), None);
    }

    #[test]
    fn whole_readings_go_as_integers_and_others_as_floats() {
        assert_eq!(reading_json(1795535998.0).to_string(), "1795535998");
        assert_eq!(reading_json(-3.0).to_string(), "-3");
        assert_eq!(reading_json(42.5).to_string(), "42.5");
        assert_eq!(reading_json(1e300), json!(1e300));
    }

    #[test]
    fn pending_push_fills_several_bound_params_of_one_screen() {
        let registry = FeedRegistry::default();
        registry.publish_builtin("claude.session", 68.0, FeedHints::default());
        registry.publish_builtin("claude.sessionResetsAt", 1795535998.0, FeedHints::default());
        let binding = ScreenBinding {
            control: "claudeUsage".into(),
            params: BTreeMap::from([
                ("session".to_string(), "claude.session".to_string()),
                ("sessionResetsAt".to_string(), "claude.sessionResetsAt".to_string()),
                ("week".to_string(), "claude.week".to_string()), // not published yet
            ]),
        };
        // As the device reports it after a restart: style kept, readings gone.
        let slot = ScreenSlot {
            screen: 0,
            control: "claudeUsage".into(),
            params: json!({ "style": "tanks", "animate": true, "changing": false }),
            updated_at: 0,
            saved_control: None,
        };

        let params = pending_push(&slot, &binding, &registry).expect("readings missing on the device");

        assert_eq!(params["session"].to_string(), "68");
        assert_eq!(params["sessionResetsAt"].to_string(), "1795535998");
        assert!(params.get("week").is_none());
        assert_eq!(params["style"], "tanks");

        // Once the device echoes them back, there's nothing more to push.
        let echoed = ScreenSlot { params, ..slot };
        assert_eq!(pending_push(&echoed, &binding, &registry), None);

        // A reset time that moves by a minute is pushed, even though that's
        // a tiny fraction of the number.
        registry.publish_builtin("claude.sessionResetsAt", 1795536058.0, FeedHints::default());
        let params = pending_push(&echoed, &binding, &registry).expect("reset time moved");
        assert_eq!(params["sessionResetsAt"].to_string(), "1795536058");
    }

    #[test]
    fn pending_push_replaces_only_the_bound_param() {
        let registry = registry_with_cpu(42.0);
        let slot = gauge_slot(json!({ "label": "CPU", "value": 3, "style": "ring" }));

        let params = pending_push(&slot, &cpu_binding(), &registry).expect("value differs");

        assert_eq!(params, json!({ "label": "CPU", "value": 42, "style": "ring" }));
    }

    #[test]
    fn pending_push_is_none_when_the_device_already_shows_the_reading() {
        let registry = registry_with_cpu(42.37);
        // What a 32-bit float echo of 42.37 looks like.
        let slot = gauge_slot(json!({ "value": 42.369998931884766 }));

        assert_eq!(pending_push(&slot, &cpu_binding(), &registry), None);
    }

    #[test]
    fn pending_push_is_none_while_the_feed_has_no_value() {
        let slot = gauge_slot(json!({ "value": 3 }));
        assert_eq!(pending_push(&slot, &cpu_binding(), &FeedRegistry::default()), None);
    }

    #[test]
    fn pending_push_is_none_for_a_screen_showing_another_control() {
        let registry = registry_with_cpu(42.0);
        let slot = ScreenSlot {
            screen: 2,
            control: "weather".into(),
            params: json!({ "element": "icon" }),
            updated_at: 1,
            saved_control: None,
        };
        assert_eq!(pending_push(&slot, &cpu_binding(), &registry), None);
    }

    #[test]
    fn set_only_reports_what_was_last_set() {
        let bindings = Bindings::default();
        bindings.set(2, Some(cpu_binding()));
        assert_eq!(bindings.get(2), Some(cpu_binding()));
        assert!(bindings.references_any(&["sys.cpu"]));
        assert!(!bindings.references_any(&["sys.gpu"]));

        bindings.set(2, None);
        assert_eq!(bindings.get(2), None);
    }

    #[test]
    fn bindings_survive_a_reload_from_disk() {
        let mut path = std::env::temp_dir();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("orbit-feeds-test-{nanos}.json"));

        let first = Bindings::default();
        first.load(path.clone());
        first.set(4, Some(cpu_binding()));

        let second = Bindings::default();
        second.load(path.clone());
        assert_eq!(second.get(4), Some(cpu_binding()));
        let _ = std::fs::remove_file(&path);
    }
}
