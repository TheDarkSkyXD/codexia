use crate::state::{RemoteAccessState, RemoteUiStatus};
use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri::path::BaseDirectory;
use tauri_remote_ui::{OriginType, RemoteUiConfig, RemoteUiExt};
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteUiConfigPayload {
    pub port: Option<u16>,
    pub allowed_origin: Option<String>,
    #[serde(default)]
    pub minimize_app: bool,
    #[serde(default)]
    pub application_ui: bool,
    #[serde(default = "default_enable_info_url")]
    pub enable_info_url: bool,
    pub bundle_path: Option<String>,
    pub external_host: Option<String>,
}

fn default_enable_info_url() -> bool {
    true
}

impl Default for RemoteUiConfigPayload {
    fn default() -> Self {
        Self {
            port: Some(7420),
            allowed_origin: Some("any".to_string()),
            minimize_app: false,
            application_ui: true,
            enable_info_url: true,
            bundle_path: None,
            external_host: None,
        }
    }
}

pub async fn start_remote_ui(
    app: AppHandle,
    state: State<'_, RemoteAccessState>,
    payload: RemoteUiConfigPayload,
) -> Result<RemoteUiStatus, String> {
    let mut config = RemoteUiConfig::default();

    let port = payload.port.unwrap_or(7420);
    let origin = map_origin(payload.allowed_origin.as_deref());

    config = config.set_port(Some(port));
    config = config.set_allowed_origin(origin);

    if payload.application_ui {
        config = config.enable_application_ui();
    }

    if payload.minimize_app {
        config = config.minimize_app();
    }

    if !payload.enable_info_url {
        config = config.disable_info_url();
    }

    let resolved_bundle_path = resolve_bundle_path(&app, payload.bundle_path.clone());
    if let Some(bundle_path) = resolved_bundle_path.clone() {
        config = config.set_bundle_path(Some(bundle_path));
    }

    if app.is_remote_ui_running().await {
        let _ = app.stop_remote_ui().await;
    }

    app.start_remote_ui(config)
        .await
        .map_err(|err| err.to_string())?;

    let bind_address = origin_to_binding_string(origin).to_string();
    let host_for_clients = payload
        .external_host
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| bind_address.clone());

    let mut status = RemoteUiStatus::default();
    status.running = true;
    status.port = Some(port);
    status.bind_address = Some(bind_address);
    status.public_url = Some(format!("http://{host_for_clients}:{port}"));
    if payload.enable_info_url {
        status.info_url = status
            .public_url
            .as_ref()
            .map(|base| format!("{base}/remote_ui_info"));
    }
    status.bundle_path = resolved_bundle_path;
    status.minimize_app = payload.minimize_app;
    status.application_ui = payload.application_ui;

    let mut guard = state.status.write().await;
    *guard = status.clone();

    Ok(status)
}

pub async fn stop_remote_ui(
    app: AppHandle,
    state: State<'_, RemoteAccessState>,
) -> Result<RemoteUiStatus, String> {
    if app.is_remote_ui_running().await {
        if let Err(err) = app.stop_remote_ui().await {
            return Err(err.to_string());
        }
    }

    let mut guard = state.status.write().await;
    *guard = RemoteUiStatus::default();
    Ok(guard.clone())
}

pub async fn get_remote_ui_status(
    app: AppHandle,
    state: State<'_, RemoteAccessState>,
) -> Result<RemoteUiStatus, String> {
    let mut snapshot = state.status.read().await.clone();
    snapshot.running = app.is_remote_ui_running().await;
    Ok(snapshot)
}

fn map_origin(origin: Option<&str>) -> OriginType {
    match origin.map(|value| value.trim().to_lowercase()).as_deref() {
        Some("localhost") | Some("127.0.0.1") => OriginType::Localhost,
        Some("direct") | Some("::") => OriginType::Direct,
        _ => OriginType::Any,
    }
}

fn origin_to_binding_string(origin: OriginType) -> &'static str {
    match origin {
        OriginType::Localhost => "127.0.0.1",
        OriginType::Direct => "::",
        OriginType::Any => "0.0.0.0",
    }
}

fn resolve_bundle_path(app: &AppHandle, requested_path: Option<String>) -> Option<String> {
    if let Some(path) = requested_path {
        if std::path::Path::new(&path).exists() {
            return Some(path);
        }
    }

    let resolver = app.path();
    let candidates = [
        "dist",
        "../dist",
        "public",
        "../public",
    ];

    for candidate in candidates {
        if let Ok(resolved) = resolver.resolve(candidate, BaseDirectory::Resource) {
            if resolved.exists() {
                return Some(resolved.to_string_lossy().to_string());
            }
        }
    }

    None
}
