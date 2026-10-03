use std::time::Duration;

use serde::de::DeserializeOwned;

use super::error::OrbitError;
use super::model::{
    BulkScreenSlotInput, BulkScreensRequest, CountdownAction, DeviceErrorBody, ScreenSlot,
    ScreenSlotInput, ScreensResponse, SystemInfo,
};

// LAN-only device: a wrong/unreachable IP should fail fast in the UI rather
// than hang the app.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// Thin wrapper around the orbit-api REST surface (docs/orbit-api.md).
/// One method per endpoint; no retry/backoff here — callers (Tauri commands,
/// the sysMonitor loop) decide how to react to failure.
/// `Clone` is cheap: `reqwest::Client` is `Arc`-backed internally, so callers
/// (e.g. a Tauri command) can clone it out of a state mutex without holding
/// the lock across an `.await`.
#[derive(Clone)]
pub struct OrbitClient {
    http: reqwest::Client,
    /// `http://{host}` — the core info-orbs web service's endpoints
    /// (e.g. /api/v1/system) hang off this directly.
    root_url: String,
    /// `{root_url}/orbit/api/v1` — every OrbIt API endpoint.
    base_url: String,
}

impl OrbitClient {
    /// `host` is an IP or hostname, no scheme/port — the device listens on
    /// plain HTTP per the spec's "No auth/TLS" tradeoff.
    pub fn new(host: &str) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("reqwest client should build with static config");

        let root_url = format!("http://{host}");
        Self {
            http,
            base_url: format!("{root_url}/orbit/api/v1"),
            root_url,
        }
    }

    /// Test-only constructor pointing at an arbitrary base URL (a wiremock
    /// server), bypassing the `http://{host}/orbit/api/v1` assembly above.
    #[cfg(test)]
    fn with_base_url(base_url: impl Into<String>) -> Self {
        let base_url = base_url.into();
        let root_url = base_url.strip_suffix("/orbit/api/v1").unwrap_or(&base_url).to_string();
        Self {
            http: reqwest::Client::builder()
                .connect_timeout(CONNECT_TIMEOUT)
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("reqwest client should build with static config"),
            root_url,
            base_url,
        }
    }

    /// Identifies which device this client talks to — used by the heartbeat
    /// to check the connection it probed is still the current one before
    /// tearing it down.
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Device status from the core web service (not the OrbIt API). Fails
    /// with `DeviceRejected { status: 404, .. }` on firmware without it.
    pub async fn get_system(&self) -> Result<SystemInfo, OrbitError> {
        let url = format!("{}/api/v1/system", self.root_url);
        self.send_json(self.http.get(url)).await
    }

    pub async fn get_screens(&self) -> Result<Vec<ScreenSlot>, OrbitError> {
        let url = format!("{}/screens", self.base_url);
        let resp: ScreensResponse = self.send_json(self.http.get(url)).await?;
        Ok(resp.screens)
    }

    pub async fn get_screen(&self, n: u8) -> Result<ScreenSlot, OrbitError> {
        let url = format!("{}/screens/{n}", self.base_url);
        self.send_json(self.http.get(url)).await
    }

    /// Bulk replace. Screens not present in `slots` keep their current
    /// device-side config (docs/orbit-api.md, "Bulk POST /screens merges by
    /// omission").
    pub async fn post_screens_bulk(
        &self,
        slots: Vec<BulkScreenSlotInput>,
    ) -> Result<Vec<ScreenSlot>, OrbitError> {
        let url = format!("{}/screens", self.base_url);
        let body = BulkScreensRequest { screens: slots };
        let resp: ScreensResponse = self.send_json(self.http.post(url).json(&body)).await?;
        Ok(resp.screens)
    }

    /// Replaces screen `n`'s entire config (not a merge of `params`).
    pub async fn post_screen(&self, n: u8, slot: ScreenSlotInput) -> Result<ScreenSlot, OrbitError> {
        let url = format!("{}/screens/{n}", self.base_url);
        self.send_json(self.http.post(url).json(&slot)).await
    }

    /// Ticker slots only — forces an immediate refetch, bypassing the
    /// per-slot poll-interval floor. 400s if screen `n` isn't a `ticker`.
    pub async fn refresh_ticker(&self, n: u8) -> Result<ScreenSlot, OrbitError> {
        let url = format!("{}/screens/{n}/refresh", self.base_url);
        self.send_json(self.http.post(url)).await
    }

    /// `countdown`'s params shape differs from every other control (an
    /// action verb, not full state) — worth a named wrapper rather than
    /// making callers build a raw `ScreenSlotInput` by hand.
    pub async fn countdown_action(
        &self,
        n: u8,
        action: CountdownAction,
    ) -> Result<ScreenSlot, OrbitError> {
        let params = serde_json::to_value(&action)
            .map_err(|e| OrbitError::Decode(format!("failed to encode countdown action: {e}")))?;
        let slot = ScreenSlotInput {
            control: "countdown".to_string(),
            params,
        };
        self.post_screen(n, slot).await
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        builder: reqwest::RequestBuilder,
    ) -> Result<T, OrbitError> {
        let resp = builder
            .send()
            .await
            .map_err(OrbitError::from_reqwest)?;

        let status = resp.status();
        let bytes = resp
            .bytes()
            .await
            .map_err(OrbitError::from_reqwest)?;

        if !status.is_success() {
            let message = serde_json::from_slice::<DeviceErrorBody>(&bytes)
                .map(|b| b.error)
                .unwrap_or_else(|_| String::from_utf8_lossy(&bytes).to_string());
            return Err(OrbitError::DeviceRejected {
                status: status.as_u16(),
                message,
            });
        }

        serde_json::from_slice(&bytes)
            .map_err(|e| OrbitError::Decode(format!("{e} (body: {})", String::from_utf8_lossy(&bytes))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // Example payload straight from docs/orbit-api.md's GET /screens section.
    const SCREENS_JSON: &str = r#"{
      "screens": [
        { "screen": 0, "control": "time", "params": { "showDate": true, "showDay": true, "format24Hour": false }, "updatedAt": 1234567890 },
        { "screen": 1, "control": "weather", "params": { "element": "temperature" }, "updatedAt": 0 },
        { "screen": 2, "control": "screensaver", "params": { "effect": "asteroids" }, "updatedAt": 0 },
        { "screen": 3, "control": "analogClock", "params": { "background": 0, "tickColor": 65535, "hourColor": 65535, "minuteColor": 65535, "secondColor": 63488 }, "updatedAt": 1234567890 },
        { "screen": 4, "control": "ticker", "params": { "symbol": "BTC/USD", "pollIntervalSeconds": 900 }, "updatedAt": 1234567999 }
      ]
    }"#;

    #[tokio::test]
    async fn get_screens_parses_the_documented_response_shape() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/orbit/api/v1/screens"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SCREENS_JSON, "application/json"))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let screens = client.get_screens().await.expect("request should succeed");

        assert_eq!(screens.len(), 5);
        assert_eq!(screens[0].control, "time");
        assert_eq!(screens[4].control, "ticker");
        assert_eq!(screens[4].params["symbol"], "BTC/USD");
    }

    #[tokio::test]
    async fn bulk_post_sends_only_the_given_screens() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/orbit/api/v1/screens"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "screens": [
                    { "screen": 3, "control": "weather", "params": { "element": "temperature" }, "updatedAt": 1 },
                    { "screen": 4, "control": "ticker", "params": { "symbol": "ETH/USD" }, "updatedAt": 2 }
                ]
            })))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let result = client
            .post_screens_bulk(vec![
                BulkScreenSlotInput {
                    screen: 3,
                    control: "weather".into(),
                    params: serde_json::json!({ "element": "temperature" }),
                },
                BulkScreenSlotInput {
                    screen: 4,
                    control: "ticker".into(),
                    params: serde_json::json!({ "symbol": "ETH/USD" }),
                },
            ])
            .await
            .expect("bulk post should succeed");

        assert_eq!(result.len(), 2);
        assert_eq!(result[1].params["symbol"], "ETH/USD");
    }

    #[tokio::test]
    async fn error_response_surfaces_the_device_error_message() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/orbit/api/v1/screens/9"))
            .respond_with(
                ResponseTemplate::new(400)
                    .set_body_json(serde_json::json!({ "error": "unknown control 'foo'" })),
            )
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let err = client
            .post_screen(
                9,
                ScreenSlotInput {
                    control: "foo".into(),
                    params: serde_json::json!({}),
                },
            )
            .await
            .expect_err("device should reject an unknown control");

        match err {
            OrbitError::DeviceRejected { status, message } => {
                assert_eq!(status, 400);
                assert_eq!(message, "unknown control 'foo'");
            }
            other => panic!("expected DeviceRejected, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn refresh_ticker_hits_the_documented_endpoint() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/orbit/api/v1/screens/4/refresh"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "screen": 4, "control": "ticker", "params": { "symbol": "BTC/USD" }, "updatedAt": 42
            })))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let slot = client.refresh_ticker(4).await.expect("refresh should succeed");
        assert_eq!(slot.updated_at, 42);
    }

    #[tokio::test]
    async fn countdown_action_encodes_the_action_tag_and_fields() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/orbit/api/v1/screens/1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "screen": 1, "control": "countdown",
                "params": { "label": "Focus", "durationSeconds": 900, "color": 2047, "state": "running", "remainingSeconds": 900 },
                "updatedAt": 1
            })))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let slot = client
            .countdown_action(
                1,
                CountdownAction::Set {
                    duration_seconds: 900,
                    label: Some("Focus".into()),
                    color: Some(2047),
                },
            )
            .await
            .expect("countdown set should succeed");

        assert_eq!(slot.params["state"], "running");
    }

    #[tokio::test]
    async fn get_system_hits_the_core_endpoint_outside_the_orbit_api() {
        let server = MockServer::start().await;
        // Same shape as a real device response (values anonymised).
        let body = r#"{"hostname":"info-orbs.local","ip":"192.168.4.56","mac":"AA:BB:CC:DD:EE:FF","ssid":"home","rssi":-58,"uptimeSeconds":767,"freeHeap":123456,"minFreeHeap":98765,"firmwareBuilt":"Sep 20 2026 14:03:11"}"#;
        Mock::given(method("GET"))
            .and(path("/api/v1/system"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(body, "application/json"))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let info = client.get_system().await.expect("request should succeed");

        assert_eq!(info.hostname, "info-orbs.local");
        assert_eq!(info.rssi, -58);
        assert_eq!(info.uptime_seconds, 767);
        assert_eq!(info.firmware_built, "Sep 20 2026 14:03:11");
    }

    #[tokio::test]
    async fn get_system_reports_404_on_firmware_without_the_core_web_service() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/v1/system"))
            .respond_with(ResponseTemplate::new(404).set_body_raw(r#"{"error":"not found"}"#, "application/json"))
            .mount(&server)
            .await;

        let client = OrbitClient::with_base_url(format!("{}/orbit/api/v1", server.uri()));
        let err = client.get_system().await.expect_err("should fail");

        assert!(matches!(err, OrbitError::DeviceRejected { status: 404, .. }));
    }
}
