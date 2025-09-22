mod codex_client;
mod commands;
mod config;
mod filesystem;
mod mcp;
mod protocol;
mod services;
mod state;
mod utils;

use commands::{
    approve_execution, approve_patch, check_codex_version, close_session, delete_session_file,
    disable_remote_ui, enable_remote_ui, find_rollout_path_for_session, get_latest_session_id,
    get_remote_ui_status, get_running_sessions, get_session_files, load_sessions_from_disk,
    pause_session, read_history_file, read_session_file, send_message, start_codex_session,
};
use config::{
    add_or_update_model_provider, add_or_update_profile, delete_profile, ensure_default_providers,
    get_profile_config, get_project_name, get_provider_config, is_version_controlled,
    read_codex_config, read_model_providers, read_profiles, set_project_trust,
    update_profile_model,
};
use filesystem::{
    directory_ops::{get_default_directories, read_directory, search_files, canonicalize_path},
    file_analysis::calculate_file_tokens,
    file_io::{read_file, write_file},
    file_parsers::{csv::read_csv_content, pdf::read_pdf_content, xlsx::read_xlsx_content},
    git_diff::get_git_file_diff,
    git_status::get_git_status,
    watch::{start_watch_directory, stop_watch_directory},
};
use mcp::{add_mcp_server, delete_mcp_server, read_mcp_servers};
use state::{CodexState, RemoteAccessState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("logs".to_string()),
                    },
                ))
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_screenshots::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_remote_ui::init())
        .manage(CodexState::new())
        .manage(RemoteAccessState::default())
        .invoke_handler(tauri::generate_handler![
            start_codex_session,
            send_message,
            approve_execution,
            approve_patch,
            pause_session,
            close_session,
            get_running_sessions,
            load_sessions_from_disk,
            delete_session_file,
            get_latest_session_id,
            get_session_files,
            read_session_file,
            read_history_file,
            find_rollout_path_for_session,
            check_codex_version,
            read_directory,
            get_default_directories,
            search_files,
            canonicalize_path,
            calculate_file_tokens,
            read_file,
            write_file,
            read_pdf_content,
            read_csv_content,
            read_xlsx_content,
            get_git_file_diff,
            get_git_status,
            start_watch_directory,
            stop_watch_directory,
            read_codex_config,
            get_project_name,
            is_version_controlled,
            set_project_trust,
            read_mcp_servers,
            add_mcp_server,
            delete_mcp_server,
            read_model_providers,
            read_profiles,
            get_provider_config,
            get_profile_config,
            update_profile_model,
            add_or_update_profile,
            delete_profile,
            add_or_update_model_provider,
            ensure_default_providers,
            enable_remote_ui,
            disable_remote_ui,
            get_remote_ui_status,
        ])
        .setup(|_app| {
            tauri::async_runtime::spawn(async {
                let _ = ensure_default_providers().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
