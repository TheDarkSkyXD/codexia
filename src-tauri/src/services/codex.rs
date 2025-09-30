use crate::protocol::CodexConfig;
use crate::state::CodexState;
use crate::utils::codex_discovery::discover_codex_command;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::process::Command as StdCommand;
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tauri::{AppHandle, State};
use crate::codex_client::CodexClient;

// Note: Frontend now properly extracts raw session IDs before calling backend
// so we no longer need complex ID normalization

pub async fn start_codex_session(
    app: AppHandle,
    state: State<'_, CodexState>,
    session_id: String,
    config: CodexConfig,
) -> Result<(), String> {
    log::debug!("Starting session with ID: {}", session_id);

    {
        let sessions = state.sessions.lock().await;
        if sessions.contains_key(&session_id) {
            log::debug!("Session {} already exists, skipping", session_id);
            return Ok(());
        }
    }

    let codex_client = CodexClient::new(&app, session_id.clone(), config)
        .await
        .map_err(|e| format!("Failed to start Codex session: {}", e))?;

    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), codex_client);
        log::debug!("Session {} stored successfully", session_id);
        log::debug!("Total sessions now: {}", sessions.len());
        log::debug!(
            "All session keys: {:?}",
            sessions.keys().collect::<Vec<_>>()
        );
    }
    Ok(())
}

pub async fn send_message(
    state: State<'_, CodexState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(client) = sessions.get_mut(&session_id) {
        client
            .send_user_input(message)
            .await
            .map_err(|e| format!("Failed to send message: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn approve_execution(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(client) = sessions.get_mut(&session_id) {
        client
            .send_exec_approval(approval_id, approved)
            .await
            .map_err(|e| format!("Failed to send approval: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn approve_patch(
    state: State<'_, CodexState>,
    session_id: String,
    approval_id: String,
    approved: bool,
) -> Result<(), String> {
    log::debug!(
        "approve_patch: session_id={}, approval_id={}, approved={}",
        session_id,
        approval_id,
        approved
    );
    let mut sessions = state.sessions.lock().await;
    if let Some(client) = sessions.get_mut(&session_id) {
        client
            .send_apply_patch_approval(approval_id, approved)
            .await
            .map_err(|e| format!("Failed to send patch approval: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn pause_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let stored_sessions: Vec<String> = sessions.keys().cloned().collect();

    log::debug!("Attempting to pause session: {}", session_id);
    log::debug!("Currently stored sessions: {:?}", stored_sessions);

    if let Some(client) = sessions.get(&session_id) {
        log::debug!("Found session, sending interrupt (pause): {}", session_id);
        client
            .interrupt()
            .await
            .map_err(|e| format!("Failed to pause session: {}", e))?;
        Ok(())
    } else {
        log::debug!("Session not found: {}", session_id);
        Err("Session not found".to_string())
    }
}

pub async fn close_session(state: State<'_, CodexState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().await;
    if let Some(mut client) = sessions.remove(&session_id) {
        client
            .close_session()
            .await
            .map_err(|e| format!("Failed to close session: {}", e))?;
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

pub async fn get_running_sessions(state: State<'_, CodexState>) -> Result<Vec<String>, String> {
    let sessions = state.sessions.lock().await;
    let session_keys: Vec<String> = sessions.keys().cloned().collect();

    // Debug log to see what sessions are actually stored
    log::debug!(
        "get_running_sessions called - stored sessions: {:?}",
        session_keys
    );

    Ok(session_keys)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct TrackedDiffEntry {
    pub status: String,
    pub path: String,
    #[serde(rename = "oldPath", default)]
    pub old_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WorktreeSummary {
    pub tracked: Vec<TrackedDiffEntry>,
    pub untracked: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiffTargetPayload {
    pub path: String,
    pub status: String,
    #[serde(rename = "oldPath", default)]
    pub old_path: Option<String>,
}

pub async fn collect_worktree_diff(
    state: State<'_, CodexState>,
    session_id: String,
) -> Result<String, String> {
    let working_dir = {
        let sessions = state.sessions.lock().await;
        let client = sessions
            .get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        client.working_directory().to_string()
    };

    git_worktree_diff(&working_dir).await
}

pub async fn snapshot_worktree_summary(
    state: State<'_, CodexState>,
    session_id: String,
) -> Result<WorktreeSummary, String> {
    let working_dir = {
        let sessions = state.sessions.lock().await;
        let client = sessions
            .get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        client.working_directory().to_string()
    };

    git_worktree_summary(&working_dir).await
}

pub async fn collect_worktree_diff_subset(
    state: State<'_, CodexState>,
    session_id: String,
    targets: Vec<DiffTargetPayload>,
) -> Result<String, String> {
    if targets.is_empty() {
        return Ok(String::new());
    }

    let working_dir = {
        let sessions = state.sessions.lock().await;
        let client = sessions
            .get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        client.working_directory().to_string()
    };

    git_worktree_diff_subset(&working_dir, &targets).await
}

pub async fn revert_file_diff(
    state: State<'_, CodexState>,
    session_id: String,
    diff_patch: String,
) -> Result<(), String> {
    let diff = diff_patch.trim();
    if diff.is_empty() {
        return Ok(());
    }

    let working_dir = {
        let sessions = state.sessions.lock().await;
        let client = sessions
            .get(&session_id)
            .ok_or_else(|| "Session not found".to_string())?;
        client.working_directory().to_string()
    };

    apply_reverse_patch(&working_dir, diff).await
}

async fn git_worktree_diff(working_dir: &str) -> Result<String, String> {
    let rev_parse = Command::new("git")
        .arg("rev-parse")
        .arg("--show-toplevel")
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    let rev_parse = match rev_parse {
        Ok(output) => output,
        Err(_) => return Ok(String::new()),
    };

    if !rev_parse.status.success() {
        return Ok(String::new());
    }

    let base_diff_output = Command::new("git")
        .arg("diff")
        .arg("--no-color")
        .arg("--unified=3")
        .arg("HEAD")
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff: {e}"))?;

    let base_diff = match base_diff_output.status.code() {
        Some(code) if code > 1 => String::new(),
        _ => String::from_utf8_lossy(&base_diff_output.stdout).to_string(),
    };

    let untracked_output = Command::new("git")
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to list untracked files: {e}"))?;

    let untracked_files = String::from_utf8_lossy(&untracked_output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect::<Vec<String>>();

    let mut untracked_diffs = String::new();
    for file in untracked_files {
        let diff_output = Command::new("git")
            .arg("diff")
            .arg("--no-color")
            .arg("--unified=3")
            .arg("--no-index")
            .arg("--")
            .arg("/dev/null")
            .arg(&file)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to diff untracked file {file}: {e}"))?;

        match diff_output.status.code() {
            Some(code) if code > 1 => continue,
            _ => {
                let diff_text = String::from_utf8_lossy(&diff_output.stdout).to_string();
                if !diff_text.trim().is_empty() {
                    if !untracked_diffs.is_empty() && !diff_text.starts_with('\n') {
                        untracked_diffs.push('\n');
                    }
                    untracked_diffs.push_str(&diff_text);
                }
            }
        }
    }

    let mut combined = String::new();
    if !base_diff.trim().is_empty() {
        combined.push_str(base_diff.trim_end());
    }
    if !untracked_diffs.trim().is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(untracked_diffs.trim_end());
    }

    Ok(combined)
}

async fn git_worktree_summary(working_dir: &str) -> Result<WorktreeSummary, String> {
    let tracked_entries = git_tracked_entries(working_dir).await?;
    let untracked = git_untracked_files(working_dir).await?;
    Ok(WorktreeSummary {
        tracked: tracked_entries,
        untracked,
    })
}

async fn git_tracked_entries(working_dir: &str) -> Result<Vec<TrackedDiffEntry>, String> {
    let output = Command::new("git")
        .arg("diff")
        .arg("--name-status")
        .arg("HEAD")
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff --name-status: {e}"))?;

    if !(output.status.success() || output.status.code() == Some(1)) {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.is_empty() {
            continue;
        }
        let status = parts[0].to_string();
        if status.starts_with('R') || status.starts_with('C') {
            if parts.len() >= 3 {
                entries.push(TrackedDiffEntry {
                    status,
                    path: parts[2].to_string(),
                    old_path: Some(parts[1].to_string()),
                });
            }
        } else if parts.len() >= 2 {
            entries.push(TrackedDiffEntry {
                status,
                path: parts[1].to_string(),
                old_path: None,
            });
        }
    }
    Ok(entries)
}

async fn git_untracked_files(working_dir: &str) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard")
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to list untracked files: {e}"))?;

    if !(output.status.success() || output.status.code() == Some(1)) {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let files = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect::<Vec<String>>();
    Ok(files)
}

async fn git_worktree_diff_subset(
    working_dir: &str,
    targets: &[DiffTargetPayload],
) -> Result<String, String> {
    if targets.is_empty() {
        return Ok(String::new());
    }

    let mut tracked_paths = HashSet::new();
    let mut untracked_targets = Vec::new();

    for target in targets {
        let path = target.path.trim();
        if path.is_empty() {
            continue;
        }
        if target.status.starts_with("??") {
            untracked_targets.push(path.to_string());
        } else {
            tracked_paths.insert(path.to_string());
            if let Some(old) = &target.old_path {
                if !old.trim().is_empty() {
                    tracked_paths.insert(old.trim().to_string());
                }
            }
        }
    }

    let mut chunks: Vec<String> = Vec::new();

    if !tracked_paths.is_empty() {
        let mut args = vec!["diff", "--no-color", "--unified=3", "HEAD", "--"];
        let mut cmd = Command::new("git");
        cmd.current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for arg in &args {
            cmd.arg(arg);
        }
        for path in &tracked_paths {
            cmd.arg(path);
        }

        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to run git diff subset: {e}"))?;

        if output.status.success() || output.status.code() == Some(1) {
            let diff_text = String::from_utf8_lossy(&output.stdout);
            if !diff_text.trim().is_empty() {
                chunks.push(diff_text.trim_end().to_string());
            }
        }
    }

    for path in untracked_targets {
        let output = Command::new("git")
            .arg("diff")
            .arg("--no-color")
            .arg("--unified=3")
            .arg("--no-index")
            .arg("--")
            .arg("/dev/null")
            .arg(&path)
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to diff untracked file {path}: {e}"))?;

        if output.status.success() || output.status.code() == Some(1) {
            let diff_text = String::from_utf8_lossy(&output.stdout);
            if !diff_text.trim().is_empty() {
                chunks.push(diff_text.trim_end().to_string());
            }
        }
    }

    Ok(chunks.join("\n"))
}

async fn apply_reverse_patch(working_dir: &str, diff_patch: &str) -> Result<(), String> {
    let mut git_cmd = Command::new("git");
    git_cmd
        .arg("apply")
        .arg("-R")
        .arg("--whitespace=nowarn")
        .current_dir(working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = git_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn git apply -R: {e}"))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(diff_patch.as_bytes())
            .await
            .map_err(|e| format!("Failed to write diff to git stdin: {e}"))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close git stdin: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("git apply -R failed: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let git_error = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let mut patch_cmd = Command::new("patch");
    patch_cmd
        .arg("-p1")
        .arg("-R")
        .current_dir(working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut patch_child = patch_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn patch -R: {e}"))?;

    if let Some(stdin) = patch_child.stdin.as_mut() {
        stdin
            .write_all(diff_patch.as_bytes())
            .await
            .map_err(|e| format!("Failed to write diff to patch stdin: {e}"))?;
        stdin
            .shutdown()
            .await
            .map_err(|e| format!("Failed to close patch stdin: {e}"))?;
    }

    let patch_output = patch_child
        .wait_with_output()
        .await
        .map_err(|e| format!("patch -R failed: {e}"))?;

    if patch_output.status.success() {
        return Ok(());
    }

    let patch_error = String::from_utf8_lossy(&patch_output.stderr)
        .trim()
        .to_string();

    Err(format!(
        "Failed to revert change. git apply error: {}. patch error: {}",
        if git_error.is_empty() {
            "unknown"
        } else {
            git_error.as_str()
        },
        if patch_error.is_empty() {
            "unknown"
        } else {
            patch_error.as_str()
        }
    ))
}

pub async fn check_codex_version() -> Result<String, String> {
    let path = match discover_codex_command() {
        Some(p) => p.to_string_lossy().to_string(),
        None => "codex".to_string(),
    };

    let output = StdCommand::new(&path)
        .arg("-V")
        .output()
        .map_err(|e| format!("Failed to execute codex binary: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("Codex binary returned error: {}", err_msg))
    }
}
