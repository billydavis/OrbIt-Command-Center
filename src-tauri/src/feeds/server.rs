use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::registry::{FeedError, FeedHints, FeedRegistry};
use crate::state::AppState;

/// Where other apps on this PC push their feeds (docs/feeds-api.md). A fixed
/// port, so a script written once keeps working.
pub const PORT: u16 = 47800;

/// What the Feeds panel shows about the endpoint: where it is, or why it
/// isn't there (the port was taken, most likely).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedServerStatus {
    pub port: u16,
    pub listening: bool,
    pub error: Option<String>,
}

impl Default for FeedServerStatus {
    fn default() -> Self {
        Self { port: PORT, listening: false, error: None }
    }
}

/// Starts the ingest endpoint for the lifetime of the app. Loopback only:
/// it's unauthenticated, so nothing off this machine gets to reach it.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, PORT));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => listener,
            Err(err) => {
                set_status(&state, false, Some(format!("could not listen on {addr}: {err}")));
                return;
            }
        };
        set_status(&state, true, None);
        if let Err(err) = axum::serve(listener, router(state.feeds.clone())).await {
            set_status(&state, false, Some(format!("feed endpoint stopped: {err}")));
        }
    });
}

fn set_status(state: &AppState, listening: bool, error: Option<String>) {
    *state.feed_server.lock().expect("feed server mutex poisoned") =
        FeedServerStatus { port: PORT, listening, error };
}

fn router(feeds: Arc<FeedRegistry>) -> Router {
    Router::new()
        .route("/feeds", get(list_feeds))
        .route("/feeds/{id}", get(get_feed).post(push_feed).delete(delete_feed))
        .fallback(|| async { error(StatusCode::NOT_FOUND, "not found") })
        .with_state(feeds)
}

async fn list_feeds(State(feeds): State<Arc<FeedRegistry>>) -> Response {
    Json(json!({ "feeds": feeds.list() })).into_response()
}

async fn get_feed(State(feeds): State<Arc<FeedRegistry>>, Path(id): Path<String>) -> Response {
    match feeds.get(&id) {
        Some(feed) => Json(feed).into_response(),
        None => feed_error(FeedError::NotFound),
    }
}

/// The body is either a bare number or `{ "value": n, "label"?, "min"?,
/// "max"? }`. Requiring `Content-Type: application/json` (the `Json`
/// extractor does) also means a web page can't post here cross-origin
/// without a preflight this server never answers.
async fn push_feed(
    State(feeds): State<Arc<FeedRegistry>>,
    Path(id): Path<String>,
    body: Result<Json<Value>, JsonRejection>,
) -> Response {
    let body = match body {
        Ok(Json(body)) => body,
        Err(rejection) => return error(StatusCode::BAD_REQUEST, &rejection.body_text()),
    };
    let (value, hints) = match parse_push(body) {
        Ok(parsed) => parsed,
        Err(message) => return error(StatusCode::BAD_REQUEST, &message),
    };
    match feeds.push_external(&id, value, hints) {
        Ok(feed) => Json(feed).into_response(),
        Err(err) => feed_error(err),
    }
}

async fn delete_feed(State(feeds): State<Arc<FeedRegistry>>, Path(id): Path<String>) -> Response {
    match feeds.remove_external(&id) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => feed_error(err),
    }
}

fn parse_push(body: Value) -> Result<(f64, FeedHints), String> {
    if let Some(value) = body.as_f64() {
        return Ok((value, FeedHints::default()));
    }
    let Value::Object(mut object) = body else {
        return Err("body must be a number or an object with a 'value'".to_string());
    };
    let value = object
        .get("value")
        .and_then(Value::as_f64)
        .ok_or_else(|| FeedError::InvalidValue.to_string())?;
    object.remove("value");
    // Unknown keys are ignored rather than rejected, so a newer client's
    // extra hints don't break against this version.
    let hints = serde_json::from_value::<FeedHints>(Value::Object(object))
        .map_err(|_| "'label' must be a string, 'min' and 'max' numbers".to_string())?;
    Ok((value, hints))
}

fn feed_error(err: FeedError) -> Response {
    let status = match err {
        FeedError::Reserved => StatusCode::FORBIDDEN,
        FeedError::NotFound => StatusCode::NOT_FOUND,
        FeedError::Full => StatusCode::INSUFFICIENT_STORAGE,
        FeedError::InvalidId | FeedError::InvalidValue | FeedError::InvalidHint(_) => {
            StatusCode::BAD_REQUEST
        }
    };
    error(status, &err.to_string())
}

/// Same `{ "error": "..." }` body the orb's own API uses.
fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serves the real router on an ephemeral port and returns its base URL.
    async fn serve(feeds: Arc<FeedRegistry>) -> String {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router(feeds)).await.unwrap();
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn push_then_read_back() {
        let feeds = Arc::new(FeedRegistry::default());
        let base = serve(feeds.clone()).await;
        let http = reqwest::Client::new();

        let pushed: Value = http
            .post(format!("{base}/feeds/build.progress"))
            .json(&json!({ "value": 42, "label": "Build", "max": 200 }))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(pushed["value"], 42.0);
        assert_eq!(pushed["label"], "Build");
        assert_eq!(pushed["source"], "external");

        let listed: Value = http.get(format!("{base}/feeds")).send().await.unwrap().json().await.unwrap();
        assert_eq!(listed["feeds"][0]["id"], "build.progress");
        assert_eq!(feeds.value("build.progress"), Some(42.0));
    }

    #[tokio::test]
    async fn a_bare_number_is_a_valid_push() {
        let feeds = Arc::new(FeedRegistry::default());
        let base = serve(feeds.clone()).await;

        let resp = reqwest::Client::new()
            .post(format!("{base}/feeds/temp"))
            .header("Content-Type", "application/json")
            .body("21.5")
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        assert_eq!(feeds.value("temp"), Some(21.5));
    }

    #[tokio::test]
    async fn bad_pushes_are_400_with_an_error_body() {
        let base = serve(Arc::new(FeedRegistry::default())).await;
        let http = reqwest::Client::new();

        for body in [r#"{"label":"no value"}"#, r#"{"value":"12"}"#, r#""text""#, "{not json"] {
            let resp = http
                .post(format!("{base}/feeds/x"))
                .header("Content-Type", "application/json")
                .body(body)
                .send()
                .await
                .unwrap();
            assert_eq!(resp.status(), 400, "body {body} should be rejected");
            let json: Value = resp.json().await.unwrap();
            assert!(json["error"].is_string(), "body {body} should explain itself");
        }
    }

    #[tokio::test]
    async fn a_push_without_a_json_content_type_is_refused() {
        let feeds = Arc::new(FeedRegistry::default());
        let base = serve(feeds.clone()).await;

        let resp =
            reqwest::Client::new().post(format!("{base}/feeds/x")).body("42").send().await.unwrap();

        assert_eq!(resp.status(), 400);
        assert_eq!(feeds.value("x"), None);
    }

    #[tokio::test]
    async fn builtin_feeds_cannot_be_written_or_deleted() {
        let feeds = Arc::new(FeedRegistry::default());
        feeds.publish_builtin("sys.cpu", 12.0, FeedHints::default());
        let base = serve(feeds.clone()).await;
        let http = reqwest::Client::new();

        let push = http.post(format!("{base}/feeds/sys.cpu")).json(&json!(99)).send().await.unwrap();
        assert_eq!(push.status(), 403);
        let delete = http.delete(format!("{base}/feeds/sys.cpu")).send().await.unwrap();
        assert_eq!(delete.status(), 403);
        assert_eq!(feeds.value("sys.cpu"), Some(12.0));
    }

    #[tokio::test]
    async fn delete_removes_an_external_feed_and_404s_after() {
        let feeds = Arc::new(FeedRegistry::default());
        let base = serve(feeds.clone()).await;
        let http = reqwest::Client::new();
        http.post(format!("{base}/feeds/gone")).json(&json!(1)).send().await.unwrap();

        assert_eq!(http.delete(format!("{base}/feeds/gone")).send().await.unwrap().status(), 204);
        assert_eq!(http.delete(format!("{base}/feeds/gone")).send().await.unwrap().status(), 404);
        assert_eq!(http.get(format!("{base}/feeds/gone")).send().await.unwrap().status(), 404);
    }
}
