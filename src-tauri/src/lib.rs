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
    approve_execution, approve_patch, check_codex_version, close_session, collect_worktree_diff,
    collect_worktree_diff_subset, create_new_window, delete_session_file,
    find_rollout_path_for_session, get_latest_session_id, get_running_sessions, get_session_files,
    load_sessions_from_disk, pause_session, read_history_file, read_session_file,
    revert_file_diff, send_message, snapshot_worktree_summary, start_codex_session,
};
use config::{
    add_or_update_model_provider, add_or_update_profile, delete_profile, ensure_default_providers,
    get_profile_config, get_project_name, get_provider_config, is_version_controlled,
    read_codex_config, read_model_providers, read_profiles, set_project_trust,
    update_profile_model,
};
use filesystem::{
    directory_ops::{canonicalize_path, get_default_directories, read_directory, search_files},
    file_analysis::calculate_file_tokens,
    file_io::{read_file, write_file},
    file_parsers::{csv::read_csv_content, pdf::read_pdf_content, xlsx::read_xlsx_content},
    git_diff::get_git_file_diff,
    git_status::get_git_status,
    watch::{start_watch_directory, stop_watch_directory},
};
use mcp::{add_mcp_server, delete_mcp_server, read_mcp_servers};
use state::CodexState;
use tauri::{AppHandle, Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_window(app, argv);
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
        .manage(CodexState::new())
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
            collect_worktree_diff,
            collect_worktree_diff_subset,
            revert_file_diff,
            snapshot_worktree_summary,
            create_new_window,
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
        ])
        .setup(|_app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }

            tauri::async_runtime::spawn(async {
                let _ = ensure_default_providers().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn show_window(app: &AppHandle, args: Vec<String>) {
    let windows = app.webview_windows();
    let main_window = windows.values().next().expect("Sorry, no window found");

    main_window
        .set_focus()
        .expect("Can't Bring Window to Focus");

    dbg!(args.clone());
    if args.len() > 1 {
        let url = args[1].clone();

        dbg!(url.clone());
        if url.starts_with("codexia://") {
            let _ = main_window.emit("deep-link-received", url);
        }
    }
}
