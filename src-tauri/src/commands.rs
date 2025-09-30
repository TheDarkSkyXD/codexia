use crate::protocol::CodexConfig;
use crate::services::{codex, session};
use crate::services::codex::{DiffTargetPayload, WorktreeSummary};
use crate::state::CodexState;
use crate::utils::file::{get_sessions_path, scan_jsonl_files};
use std::fs;
use tauri::{AppHandle, State};

// Re-export types for external use
pub use crate::services::session::Conversation;

#[tauri::command]
pub async fn load_sessions_from_disk() -> Result<Vec<Conversation>, String> {
    session::load_sessions_from_disk().await
}

#[tauri::command]
pub async fn start_codex_session(
    app: AppHandle,
    state: State<'_, CodexState>,
    session_id: String,
    config: CodexConfig,
) -> Result<(), String> {
    log::info!("Starting codex session: {}", session_id);
    codex::start_codex_session(app, state, session_id, config).await
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, CodexState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    codex::send_message(state, session_id, message).await
}

#[tauri::command]
pub async fn approve_execution(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    codex::approve_execution(state, session_id, approval_id, approved).await
}

#[tauri::command]
pub async fn approve_patch(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    codex::approve_patch(state, session_id, approval_id, approved).await
}

#[tauri::command]
pub async fn pause_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    codex::pause_session(state, session_id).await
}

#[tauri::command]
pub async fn close_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    codex::close_session(state, session_id).await
}

#[tauri::command]
pub async fn get_running_sessions(state: State<'_, CodexState>) -> Result<Vec<String>, String> {
    codex::get_running_sessions(state).await
}

#[tauri::command]
pub async fn collect_worktree_diff(
    state: State<'_, CodexState>,
    session_id: String,
) -> Result<String, String> {
    codex::collect_worktree_diff(state, session_id).await
}

#[tauri::command]
pub async fn collect_worktree_diff_subset(
    state: State<'_, CodexState>,
    session_id: String,
    targets: Vec<DiffTargetPayload>,
) -> Result<String, String> {
    codex::collect_worktree_diff_subset(state, session_id, targets).await
}

#[tauri::command]
pub async fn revert_file_diff(
    state: State<'_, CodexState>,
    session_id: String,
    diff_patch: String,
) -> Result<(), String> {
    codex::revert_file_diff(state, session_id, diff_patch).await
}

#[tauri::command]
pub async fn snapshot_worktree_summary(
    state: State<'_, CodexState>,
    session_id: String,
) -> Result<WorktreeSummary, String> {
    codex::snapshot_worktree_summary(state, session_id).await
}

#[tauri::command]
pub async fn check_codex_version() -> Result<String, String> {
    codex::check_codex_version().await
}

#[tauri::command]
pub async fn delete_session_file(file_path: String) -> Result<(), String> {
    session::delete_session_file(file_path).await
}

#[tauri::command]
pub async fn get_latest_session_id() -> Result<Option<String>, String> {
    session::get_latest_session_id().await
}

#[tauri::command]
pub async fn get_session_files() -> Result<Vec<String>, String> {
    let sessions_dir = get_sessions_path()?;

    if !sessions_dir.exists() {
        return Ok(vec![]);
    }
    let session_files = scan_jsonl_files(&sessions_dir)
        .map(|entry| entry.path().to_string_lossy().to_string())
        .collect::<Vec<_>>();

    Ok(session_files)
}

#[tauri::command]
pub async fn read_session_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read session file: {}", e))
}

#[tauri::command]
pub async fn read_history_file() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let history_path = home.join(".codex").join("history.jsonl");

    if !history_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&history_path).map_err(|e| format!("Failed to read history file: {}", e))
}

#[tauri::command]
pub async fn find_rollout_path_for_session(session_uuid: String) -> Result<Option<String>, String> {
    let sessions_dir = get_sessions_path()?;
    if !sessions_dir.exists() {
        return Ok(None);
    }

    // Walk recursively year/month/day and find file ending with -<uuid>.jsonl
    let needle = format!("-{}.jsonl", session_uuid);
    let rollout_path = scan_jsonl_files(&sessions_dir)
        .find_map(|entry| {
            let file_name = entry.file_name();
            if file_name.to_string_lossy().ends_with(&needle) {
                Some(entry.path().to_string_lossy().to_string())
            } else {
                None
            }
        });

    Ok(rollout_path)
}

#[tauri::command]
pub async fn create_new_window(app: AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    
    let window_label = format!("main-{}", chrono::Utc::now().timestamp_millis());
    
    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::default())
        .title("Codexia")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .decorations(true)
        .resizable(true)
        .fullscreen(false)
        .build()
        .map_err(|e| format!("Failed to create new window: {}", e))?;
        
    // Focus the new window
    window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
    
    Ok(())
}
