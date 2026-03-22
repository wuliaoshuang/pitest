mod pi_rpc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pi_rpc::AppBootstrapManager::default())
        .manage(pi_rpc::PiManager::default())
        .manage(pi_rpc::TerminalManager::default())
        .setup(|app| {
            pi_rpc::start_app_bootstrap(app.handle().clone());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pi_rpc::app_bootstrap_state,
            pi_rpc::app_frontend_ready,
            pi_rpc::app_list_skills,
            pi_rpc::app_restart_bootstrap,
            pi_rpc::app_window_chrome_metrics,
            pi_rpc::pi_abort,
            pi_rpc::pi_bootstrap,
            pi_rpc::pi_config_save,
            pi_rpc::pi_config_snapshot,
            pi_rpc::pi_get_state,
            pi_rpc::pi_provider_catalog,
            pi_rpc::pi_prompt,
            pi_rpc::pi_runtime_snapshot,
            pi_rpc::pi_session_clear_logs,
            pi_rpc::pi_session_delete,
            pi_rpc::pi_session_export_logs,
            pi_rpc::pi_session_load,
            pi_rpc::pi_session_rename,
            pi_rpc::pi_session_save,
            pi_rpc::pi_sessions_list,
            pi_rpc::pi_start,
            pi_rpc::pi_stop,
            pi_rpc::terminal_input,
            pi_rpc::terminal_open,
            pi_rpc::terminal_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
