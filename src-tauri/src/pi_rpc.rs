use flate2::read::GzDecoder;
use portable_pty::{native_pty_system, CommandBuilder as PtyCommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, remove_file, rename, write, File},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child as StdChild, ChildStderr, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tar::Archive;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowButton};

const PI_EVENT_NAME: &str = "pi-event";
const TERMINAL_EVENT_NAME: &str = "terminal-event";
const PI_AGENT_DIR_ENV: &str = "PI_CODING_AGENT_DIR";
const BUNDLED_RUNTIME_DIR: &str = "resources/pi-bundles";
const PITEST_TEMPLATE_DIR: &str = "resources/pi-workspace-template";
const PI_SESSION_BACKFILL_SCRIPT_NAME: &str = "backfill-pi-session.mjs";
const PITEST_CONFIG_FILE_NAME: &str = ".pitest.json";
const PITEST_APP_DIR_NAME: &str = ".pitest";
const PITEST_WORKSPACE_STATE_FILE_NAME: &str = "workspace-state.json";
const PI_DIR_NAME: &str = ".pi";
const PI_AGENT_RUNTIME_DIR_NAME: &str = "agent-runtime";
const RUNTIME_CACHE_DIR_NAME: &str = ".runtime";
const RUNTIME_READY_FILE_NAME: &str = ".ready";
const START_TIMEOUT: Duration = Duration::from_secs(8);
const RPC_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Default)]
pub struct PiManager {
    process: Mutex<Option<PiProcess>>,
    binding: Mutex<Option<PiRuntimeBinding>>,
    request_counter: AtomicU64,
}

#[derive(Default)]
pub struct TerminalManager {
    process: Mutex<Option<TerminalProcess>>,
    instance_counter: AtomicU64,
}

struct PiProcess {
    child: StdChild,
    stdin: ChildStdin,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>>,
    stderr_buffer: Arc<Mutex<String>>,
}

struct TerminalProcess {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    cwd: String,
    shell: String,
    instance_id: u64,
    running: Arc<AtomicBool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStartRequest {
    pub workspace_path: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub api_key_env_name: Option<String>,
    pub session_id: Option<String>,
    pub session_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiWorkspaceRequest {
    pub workspace_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiConfigSaveRequest {
    pub workspace_path: Option<String>,
    pub defaults: Option<PiConfigDefaultsPatch>,
    pub provider_patch: Option<PiProviderConfigPatch>,
    pub credential_patch: Option<PiProviderCredentialPatch>,
    pub compaction_patch: Option<PiCompactionPatch>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PiConfigDefaultsPatch {
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProviderConfigPatch {
    pub provider: String,
    pub enabled: Option<bool>,
    pub default_model: Option<String>,
    pub api_key_env_name: Option<String>,
    pub base_url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProviderCredentialPatch {
    pub provider: String,
    pub api_key: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PiCompactionPatch {
    pub mode: Option<String>,
    pub enabled: Option<bool>,
    pub reserve_tokens: Option<u64>,
    pub keep_recent_tokens: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputRequest {
    pub input: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeRequest {
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub cwd: String,
    pub running: bool,
    pub reused: bool,
    pub shell: String,
    pub instance_id: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionLoadRequest {
    pub workspace_path: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionSaveRequest {
    pub workspace_path: Option<String>,
    pub session: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionRenameRequest {
    pub workspace_path: Option<String>,
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionDeleteRequest {
    pub workspace_path: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PiLogFilter {
    pub session_id: Option<String>,
    pub source: Option<String>,
    pub kind: Option<String>,
    pub severity: Option<String>,
    pub query: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionExportLogsRequest {
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub filter: PiLogFilter,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPromptRequest {
    pub message: String,
    pub streaming_behavior: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiBootstrapInfo {
    pub default_workspace_path: String,
    pub cli_path: String,
    pub node_command: String,
    pub config_path: String,
    pub agent_runtime_dir: String,
    pub auth_path: String,
    pub models_path: String,
    pub settings_path: String,
    pub default_provider: String,
    pub default_model: String,
    pub default_api_key_env_name: String,
    pub configured_providers: Vec<WorkspaceProviderConfig>,
    pub onboarding: PiWorkspaceOnboardingInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiWorkspaceOnboardingInfo {
    pub required: bool,
    pub assistant_identity_known: bool,
    pub user_identity_known: bool,
    pub assistant_name: Option<String>,
    pub user_name: Option<String>,
    pub bootstrap_seeded_at: Option<String>,
    pub suggested_starter_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChromeMetrics {
    pub control_group_left: f64,
    pub button_center_y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub id: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub source: String,
    pub scope: String,
    pub relative_path: String,
    pub folder_path: String,
    pub skill_file_path: String,
    pub system: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStartResponse {
    pub state: Value,
    pub workspace_path: String,
    pub cli_path: String,
    pub provider: String,
    pub model: String,
    pub api_key_env_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub workspace_path: String,
    pub provider: String,
    pub model: String,
    pub api_key_env_name: String,
    pub runtime_state: String,
    pub message_count: u64,
    pub event_count: u64,
    pub total_tokens: Option<u64>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub stderr_count: u64,
    pub error_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiLogExportResponse {
    pub path: String,
    pub entry_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRuntimeSnapshot {
    pub connection_status: String,
    pub workspace_path: String,
    pub provider: String,
    pub model: String,
    pub api_key_env_name: String,
    pub config_path: String,
    pub agent_runtime_dir: String,
    pub auth_path: String,
    pub models_path: String,
    pub started_at: Option<u64>,
    pub is_streaming: bool,
    pub session_id: Option<String>,
    pub session_name: Option<String>,
    pub message_count: Option<u64>,
    pub pending_message_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProviderCatalog {
    pub builtin_providers: Vec<PiProviderCatalogEntry>,
    pub custom_providers: Vec<PiProviderCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProviderCatalogEntry {
    pub provider: String,
    pub label: String,
    pub kind: String,
    pub api_key_env_name: String,
    pub default_model: String,
    pub models: Vec<PiModelCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiModelCatalogEntry {
    pub id: String,
    pub name: String,
    pub reasoning: bool,
    pub context_window: u64,
    pub max_tokens: u64,
    pub supports_images: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProviderConfigSnapshot {
    pub provider: String,
    pub kind: String,
    pub enabled: bool,
    pub default_model: String,
    pub api_key_env_name: Option<String>,
    pub base_url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub has_stored_credential: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiCompactionSnapshot {
    pub mode: String,
    pub enabled: bool,
    pub reserve_tokens: u64,
    pub keep_recent_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiConfigDefaultsSnapshot {
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiConfigSnapshot {
    pub workspace_path: String,
    pub config_path: String,
    pub auth_path: String,
    pub models_path: String,
    pub settings_path: String,
    pub defaults: PiConfigDefaultsSnapshot,
    pub providers: Vec<WorkspaceProviderConfigSnapshot>,
    pub compaction: PiCompactionSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProviderConfig {
    pub provider: String,
    pub kind: String,
    pub enabled: bool,
    pub default_model: String,
    pub api_key_env_name: Option<String>,
    pub base_url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PiTestConfig {
    #[serde(default)]
    meta: PiTestConfigMeta,
    #[serde(default)]
    defaults: PiTestDefaults,
    #[serde(default)]
    providers: Vec<WorkspaceProviderConfig>,
    #[serde(default)]
    workspace: PiTestWorkspace,
    #[serde(default = "default_compat_config")]
    compat: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PiTestConfigMeta {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default = "default_config_source")]
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
struct PiTestDefaults {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
struct PiTestWorkspace {
    #[serde(default)]
    path: String,
}

#[derive(Debug, Clone)]
struct WorkspaceRuntimeState {
    config: PiTestConfig,
    config_path: PathBuf,
    agent_runtime_dir: PathBuf,
    auth_path: PathBuf,
    models_path: PathBuf,
    settings_path: PathBuf,
    onboarding: PiWorkspaceOnboardingInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PiWorkspaceState {
    version: u8,
    bootstrap_seeded_at: String,
}

#[derive(Debug, Clone)]
struct PiRuntimeBinding {
    workspace_path: String,
    provider: String,
    model: String,
    api_key_env_name: String,
    config_path: String,
    agent_runtime_dir: String,
    auth_path: String,
    models_path: String,
    started_at: u64,
}

#[derive(Debug, Clone)]
struct ResolvedWorkspaceSelection {
    provider: String,
    model: String,
    api_key_env_name: String,
}

impl Default for PiTestConfigMeta {
    fn default() -> Self {
        Self {
            schema_version: default_schema_version(),
            source: default_config_source(),
        }
    }
}

impl Default for PiWorkspaceState {
    fn default() -> Self {
        Self {
            version: 1,
            bootstrap_seeded_at: iso_timestamp_now(),
        }
    }
}

impl Default for PiTestConfig {
    fn default() -> Self {
        Self {
            meta: PiTestConfigMeta::default(),
            defaults: PiTestDefaults::default(),
            providers: Vec::new(),
            workspace: PiTestWorkspace::default(),
            compat: default_compat_config(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundledRuntimeManifest {
    pub runtime_id: String,
    pub pi_version: String,
    pub node_version: String,
    pub pi_archive: String,
    pub node_archive: String,
    pub cli_relative_path: String,
    pub node_relative_path: String,
}

struct PiRuntimePaths {
    cli_path: PathBuf,
    node_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBootstrapSnapshot {
    pub phase: String,
    pub title: String,
    pub detail: String,
    pub progress: u8,
    pub info: Option<PiBootstrapInfo>,
    pub error: Option<String>,
}

impl Default for AppBootstrapSnapshot {
    fn default() -> Self {
        Self {
            phase: "booting".to_string(),
            title: "同步工作区".to_string(),
            detail: "正在准备本地代理环境。".to_string(),
            progress: 8,
            info: None,
            error: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct AppBootstrapManager {
    inner: Arc<Mutex<AppBootstrapSnapshot>>,
    in_progress: Arc<AtomicBool>,
}

impl PiProcess {
    fn stderr_snapshot(&self) -> String {
        self.stderr_buffer
            .lock()
            .map(|buffer| buffer.trim().to_string())
            .unwrap_or_default()
    }
}

impl AppBootstrapManager {
    pub fn snapshot(&self) -> AppBootstrapSnapshot {
        self.inner
            .lock()
            .map(|snapshot| snapshot.clone())
            .unwrap_or_default()
    }

    fn begin_bootstrap(&self) -> bool {
        self.in_progress
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn finish_bootstrap(&self) {
        self.in_progress.store(false, Ordering::SeqCst);
    }

    fn reset(&self) {
        if let Ok(mut snapshot) = self.inner.lock() {
            *snapshot = AppBootstrapSnapshot::default();
        }
    }

    fn update_booting(&self, title: &str, detail: &str, progress: u8) {
        if let Ok(mut snapshot) = self.inner.lock() {
            if snapshot.phase == "ready" {
                return;
            }

            snapshot.phase = "booting".to_string();
            snapshot.title = title.to_string();
            snapshot.detail = detail.to_string();
            snapshot.progress = progress;
            snapshot.error = None;
        }
    }

    fn set_ready(&self, info: PiBootstrapInfo) {
        if let Ok(mut snapshot) = self.inner.lock() {
            snapshot.phase = "ready".to_string();
            snapshot.title = "PI 面板已就绪".to_string();
            snapshot.detail = "现在可以连接 provider 并开始使用本地代理。".to_string();
            snapshot.progress = 100;
            snapshot.info = Some(info);
            snapshot.error = None;
        }
    }

    fn set_error(&self, message: &str) {
        if let Ok(mut snapshot) = self.inner.lock() {
            snapshot.phase = "error".to_string();
            snapshot.title = "启动失败".to_string();
            snapshot.detail = message.to_string();
            snapshot.progress = 100;
            snapshot.error = Some(message.to_string());
        }
    }
}

impl PiManager {
    fn send_command(&self, mut payload: Value, timeout: Duration) -> Result<Value, String> {
        let mut process_guard = self
            .process
            .lock()
            .map_err(|_| "PI 进程状态锁定失败".to_string())?;

        let process = process_guard
            .as_mut()
            .ok_or_else(|| "PI 尚未连接，请先点击 Connect".to_string())?;

        if let Some(status) = process
            .child
            .try_wait()
            .map_err(|error| format!("检查 PI 进程状态失败: {error}"))?
        {
            let stderr = process.stderr_snapshot();
            *process_guard = None;
            return Err(format_exit_error(status.code(), &stderr));
        }

        let request_id = format!(
            "pi-rpc-{}",
            self.request_counter.fetch_add(1, Ordering::Relaxed) + 1
        );

        let object = payload
            .as_object_mut()
            .ok_or_else(|| "RPC 命令必须是 JSON object".to_string())?;
        object.insert("id".to_string(), Value::String(request_id.clone()));

        let encoded = serde_json::to_string(&payload)
            .map_err(|error| format!("序列化 RPC 命令失败: {error}"))?;

        let (sender, receiver) = mpsc::channel();
        process
            .pending
            .lock()
            .map_err(|_| "PI 待处理请求锁定失败".to_string())?
            .insert(request_id.clone(), sender);

        if let Err(error) = writeln!(process.stdin, "{encoded}") {
            process
                .pending
                .lock()
                .ok()
                .and_then(|mut pending| pending.remove(&request_id));
            return Err(format!("写入 PI RPC stdin 失败: {error}"));
        }

        if let Err(error) = process.stdin.flush() {
            process
                .pending
                .lock()
                .ok()
                .and_then(|mut pending| pending.remove(&request_id));
            return Err(format!("刷新 PI RPC stdin 失败: {error}"));
        }

        drop(process_guard);

        match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut guard) = self.process.lock() {
                    if let Some(process) = guard.as_mut() {
                        if let Ok(mut pending) = process.pending.lock() {
                            pending.remove(&request_id);
                        }
                    }
                }

                Err("等待 PI RPC 响应超时".to_string())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err("PI RPC 响应通道已断开".to_string()),
        }
    }

    fn stop(&self) -> Result<(), String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "PI 进程状态锁定失败".to_string())?
            .take();

        if let Ok(mut binding) = self.binding.lock() {
            *binding = None;
        }

        if let Some(mut process) = process.take() {
            fail_all_pending_requests(&process.pending, "PI 进程已停止");
            let _ = process.child.kill();
            let _ = process.child.wait();
        }

        Ok(())
    }
}

impl TerminalManager {
    fn stop(&self) -> Result<(), String> {
        let mut process = self
            .process
            .lock()
            .map_err(|_| "终端状态锁定失败".to_string())?
            .take();

        if let Some(mut process) = process.take() {
            process.running.store(false, Ordering::SeqCst);
            let _ = process.child.kill();
            let _ = process.child.wait();
        }

        Ok(())
    }
}

pub fn start_app_bootstrap(app_handle: AppHandle) {
    let manager = app_handle.state::<AppBootstrapManager>().clone();
    if !manager.begin_bootstrap() {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let app_handle_for_blocking = app_handle.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            prepare_app_bootstrap(&app_handle_for_blocking)
        })
        .await
        .map_err(|error| format!("应用启动任务执行失败: {error}"))
        .and_then(|result| result);

        match result {
            Ok(info) => {
                app_handle.state::<AppBootstrapManager>().set_ready(info);
                emit_runtime_event(
                    &app_handle,
                    "应用已准备完成",
                    "启动流程已完成，正在等待主界面准备就绪。",
                    100,
                );

                let main_window = app_handle
                    .get_webview_window("main")
                    .ok_or_else(|| "未找到主窗口 `main`。".to_string());

                if let Err(error) = main_window {
                    set_bootstrap_error(&app_handle, &error);
                    emit_pi_event(
                        &app_handle,
                        json!({
                            "kind": "error",
                            "message": error,
                        }),
                    );
                }
            }
            Err(error) => {
                set_bootstrap_error(&app_handle, &error);
                emit_pi_event(
                    &app_handle,
                    json!({
                        "kind": "error",
                        "message": error,
                    }),
                );
            }
        }

        app_handle.state::<AppBootstrapManager>().finish_bootstrap();
    });
}

fn prepare_app_bootstrap(app_handle: &AppHandle) -> Result<PiBootstrapInfo, String> {
    update_bootstrap_progress(app_handle, "同步工作区", "正在准备本地代理环境。", 10);

    let workspace_path = default_workspace_dir()?;
    let runtime = resolve_pi_runtime(app_handle)?;
    let provider_catalog = load_provider_catalog(&runtime)?;
    let workspace_state = ensure_workspace_runtime(app_handle, &workspace_path, &provider_catalog)?;
    let default_api_key_env_name = resolve_api_key_env_name(
        workspace_state
            .config
            .providers
            .iter()
            .find(|entry| entry.provider == workspace_state.config.defaults.provider)
            .and_then(|entry| entry.api_key_env_name.as_deref()),
        Some(workspace_state.config.defaults.provider.as_str()),
    )?;

    Ok(PiBootstrapInfo {
        default_workspace_path: display_path(&workspace_path),
        cli_path: display_path(&runtime.cli_path),
        node_command: display_path(&runtime.node_path),
        config_path: display_path(&workspace_state.config_path),
        agent_runtime_dir: display_path(&workspace_state.agent_runtime_dir),
        auth_path: display_path(&workspace_state.auth_path),
        models_path: display_path(&workspace_state.models_path),
        settings_path: display_path(&workspace_state.settings_path),
        default_provider: workspace_state.config.defaults.provider.clone(),
        default_model: workspace_state.config.defaults.model.clone(),
        default_api_key_env_name,
        configured_providers: workspace_state.config.providers.clone(),
        onboarding: workspace_state.onboarding.clone(),
    })
}

#[tauri::command]
pub fn app_bootstrap_state(manager: State<'_, AppBootstrapManager>) -> AppBootstrapSnapshot {
    manager.snapshot()
}

#[tauri::command]
pub fn app_restart_bootstrap(app_handle: AppHandle) {
    app_handle.state::<AppBootstrapManager>().reset();
    start_app_bootstrap(app_handle);
}

#[tauri::command]
pub fn app_frontend_ready(app_handle: AppHandle) -> Result<(), String> {
    reveal_main_window(&app_handle)
}

#[tauri::command]
pub async fn app_list_skills() -> Result<Vec<InstalledSkill>, String> {
    run_blocking_command(list_installed_skills).await
}

#[tauri::command]
pub async fn pi_provider_catalog(app_handle: AppHandle) -> Result<PiProviderCatalog, String> {
    run_blocking_command(move || {
        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        let runtime = PiRuntimePaths {
            cli_path: PathBuf::from(bootstrap.cli_path),
            node_path: PathBuf::from(bootstrap.node_command),
        };

        load_provider_catalog(&runtime)
    })
    .await
}

#[tauri::command]
pub async fn pi_config_snapshot(
    app_handle: AppHandle,
    request: PiWorkspaceRequest,
) -> Result<PiConfigSnapshot, String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        let runtime = PiRuntimePaths {
            cli_path: PathBuf::from(bootstrap.cli_path),
            node_path: PathBuf::from(bootstrap.node_command),
        };
        let provider_catalog = load_provider_catalog(&runtime)?;
        let workspace_state = ensure_workspace_runtime(&app_handle, &workspace_path, &provider_catalog)?;
        build_config_snapshot(&workspace_path, &workspace_state, &provider_catalog)
    })
    .await
}

#[tauri::command]
pub async fn pi_config_save(
    app_handle: AppHandle,
    request: PiConfigSaveRequest,
) -> Result<PiConfigSnapshot, String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        let runtime = PiRuntimePaths {
            cli_path: PathBuf::from(bootstrap.cli_path),
            node_path: PathBuf::from(bootstrap.node_command),
        };
        let provider_catalog = load_provider_catalog(&runtime)?;
        let mut workspace_state = ensure_workspace_runtime(&app_handle, &workspace_path, &provider_catalog)?;

        apply_config_patches(
            &mut workspace_state.config,
            &workspace_state.auth_path,
            &provider_catalog,
            request.defaults,
            request.provider_patch,
            request.credential_patch,
            request.compaction_patch,
        )?;

        workspace_state.config = normalize_workspace_config(
            workspace_state.config,
            &workspace_path,
            &provider_catalog,
        );
        maybe_persist_workspace_config(&workspace_state.config_path, &workspace_state.config, None)?;
        write_models_json(
            &workspace_state.models_path,
            &workspace_state.config,
            &provider_catalog,
        )?;
        write_settings_json(&workspace_state.settings_path, &workspace_state.config)?;
        build_config_snapshot(&workspace_path, &workspace_state, &provider_catalog)
    })
    .await
}

#[tauri::command]
pub fn app_window_chrome_metrics(
    window: WebviewWindow,
) -> Result<Option<WindowChromeMetrics>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = mpsc::channel();
        let window_handle = window.clone();

        window
            .run_on_main_thread(move || {
                let result = measure_window_chrome_metrics(&window_handle);
                let _ = sender.send(result);
            })
            .map_err(|error| format!("切换到主线程读取窗口按钮位置失败: {error}"))?;

        receiver
            .recv()
            .map_err(|error| format!("读取窗口按钮位置失败: {error}"))?
            .map(Some)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(None)
    }
}

async fn run_blocking_command<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("后台任务执行失败: {error}"))?
}

#[tauri::command]
pub async fn pi_bootstrap(app_handle: AppHandle) -> Result<PiBootstrapInfo, String> {
    run_blocking_command(move || wait_for_app_bootstrap(&app_handle, Duration::from_secs(120)))
        .await
}

#[tauri::command]
pub async fn pi_start(
    app_handle: AppHandle,
    request: PiStartRequest,
) -> Result<PiStartResponse, String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        manager.stop()?;

        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        let cli_path = PathBuf::from(&bootstrap.cli_path);
        let node_command = PathBuf::from(&bootstrap.node_command);
        let runtime = PiRuntimePaths {
            cli_path: cli_path.clone(),
            node_path: node_command.clone(),
        };
        let provider_catalog = load_provider_catalog(&runtime)?;
        let workspace_state = ensure_workspace_runtime(&app_handle, &workspace_path, &provider_catalog)?;
        let config_path = display_path(&workspace_state.config_path);
        let agent_runtime_dir = display_path(&workspace_state.agent_runtime_dir);
        let auth_path = display_path(&workspace_state.auth_path);
        let models_path = display_path(&workspace_state.models_path);
        let app_session_id = normalize_optional(request.session_id.as_deref()).map(ToOwned::to_owned);
        let session_title = normalize_optional(request.session_title.as_deref()).map(ToOwned::to_owned);
        let resolved_config = resolve_start_selection(
            &workspace_state.config,
            &provider_catalog,
            request.provider.as_deref(),
            request.model.as_deref(),
            request.api_key_env_name.as_deref(),
        )?;

        if !cli_path.exists() {
            return Err(format!(
                "未找到 PI CLI: {}。先在项目根目录执行 `pnpm add @mariozechner/pi-coding-agent`。",
                display_path(&cli_path)
            ));
        }

        let start_attempt = |force_session_rebuild: bool| -> Result<PiStartResponse, String> {
            let mut command = Command::new(&node_command);
            command
                .arg(&cli_path)
                .arg("--mode")
                .arg("rpc")
                .current_dir(&workspace_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            if let Some(session_id) = app_session_id.as_deref() {
                backfill_pi_session_from_app_session(
                    &app_handle,
                    &node_command,
                    &runtime,
                    &workspace_path,
                    session_id,
                    force_session_rebuild,
                )?;
                command.arg("--session").arg(pi_session_file_path(&workspace_path, session_id));
            } else {
                command.arg("--no-session");
            }

            command.env(
                PI_AGENT_DIR_ENV,
                display_path(&workspace_agent_runtime_dir(&workspace_path)),
            );
            command.arg("--provider").arg(&resolved_config.provider);
            command.arg("--model").arg(&resolved_config.model);

            let mut child = command
                .spawn()
                .map_err(|error| format!("启动 PI RPC 失败: {error}"))?;

            let stdin = child
                .stdin
                .take()
                .ok_or_else(|| "无法获取 PI RPC stdin".to_string())?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "无法获取 PI RPC stdout".to_string())?;
            let stderr = child
                .stderr
                .take()
                .ok_or_else(|| "无法获取 PI RPC stderr".to_string())?;

            let pending = Arc::new(Mutex::new(HashMap::new()));
            let stderr_buffer = Arc::new(Mutex::new(String::new()));
            let event_gate = Arc::new(AtomicBool::new(false));

            spawn_stdout_reader(
                app_handle.clone(),
                stdout,
                pending.clone(),
                event_gate.clone(),
            );
            spawn_stderr_reader(
                app_handle.clone(),
                stderr,
                stderr_buffer.clone(),
                event_gate.clone(),
            );

            {
                let mut process_guard = manager
                    .process
                    .lock()
                    .map_err(|_| "PI 进程状态锁定失败".to_string())?;

                *process_guard = Some(PiProcess {
                    child,
                    stdin,
                    pending,
                    stderr_buffer,
                });
            }
            {
                let mut binding = manager
                    .binding
                    .lock()
                    .map_err(|_| "PI runtime 绑定状态锁定失败".to_string())?;
                *binding = Some(PiRuntimeBinding {
                    workspace_path: display_path(&workspace_path),
                    provider: resolved_config.provider.clone(),
                    model: resolved_config.model.clone(),
                    api_key_env_name: resolved_config.api_key_env_name.clone(),
                    config_path: config_path.clone(),
                    agent_runtime_dir: agent_runtime_dir.clone(),
                    auth_path: auth_path.clone(),
                    models_path: models_path.clone(),
                    started_at: current_unix_millis(),
                });
            }

            if let Some(session_title) = session_title.as_deref() {
                let _ = manager.send_command(
                    json!({
                        "type": "set_session_name",
                        "name": session_title,
                    }),
                    RPC_TIMEOUT,
                );
            }

            let startup_response =
                manager.send_command(json!({ "type": "get_state" }), START_TIMEOUT);

            match startup_response {
                Ok(response) => {
                    event_gate.store(true, Ordering::SeqCst);
                    let state = response.get("data").cloned().unwrap_or(Value::Null);
                    emit_pi_event(
                        &app_handle,
                        json!({
                            "kind": "status",
                            "status": "connected",
                        }),
                    );

                    Ok(PiStartResponse {
                        state,
                        workspace_path: display_path(&workspace_path),
                        cli_path: display_path(&cli_path),
                        provider: resolved_config.provider.clone(),
                        model: resolved_config.model.clone(),
                        api_key_env_name: resolved_config.api_key_env_name.clone(),
                    })
                }
                Err(error) => {
                    let _ = manager.stop();
                    Err(error)
                }
            }
        };

        match start_attempt(false) {
            Ok(response) => Ok(response),
            Err(initial_error) => {
                let should_self_heal = app_session_id
                    .as_deref()
                    .map(|_| should_attempt_session_self_heal(&initial_error))
                    .unwrap_or(false);

                if !should_self_heal {
                    return Err(initial_error);
                }

                let _ = manager.stop();

                match start_attempt(true) {
                    Ok(response) => Ok(response),
                    Err(retry_error) => Err(format!(
                        "{retry_error}\n已尝试自动修复当前 session，但未成功。"
                    )),
                }
            }
        }
    })
    .await
}

#[tauri::command]
pub async fn pi_stop(app_handle: AppHandle) -> Result<(), String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        manager.stop()?;
        emit_pi_event(
            &app_handle,
            json!({
                "kind": "status",
                "status": "stopped",
            }),
        );
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn pi_prompt(app_handle: AppHandle, request: PiPromptRequest) -> Result<(), String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        let mut payload = json!({
            "type": "prompt",
            "message": request.message,
        });

        if let Some(streaming_behavior) = normalize_optional(request.streaming_behavior.as_deref())
        {
            payload["streamingBehavior"] = Value::String(streaming_behavior.to_string());
        }

        manager.send_command(payload, RPC_TIMEOUT)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn pi_abort(app_handle: AppHandle) -> Result<(), String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        manager.send_command(json!({ "type": "abort" }), RPC_TIMEOUT)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn pi_get_state(app_handle: AppHandle) -> Result<Value, String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        let response = manager.send_command(json!({ "type": "get_state" }), RPC_TIMEOUT)?;
        Ok(response.get("data").cloned().unwrap_or(Value::Null))
    })
    .await
}

#[tauri::command]
pub async fn pi_runtime_snapshot(app_handle: AppHandle) -> Result<PiRuntimeSnapshot, String> {
    run_blocking_command(move || {
        let manager = app_handle.state::<PiManager>();
        let binding = manager
            .binding
            .lock()
            .map_err(|_| "PI runtime 绑定状态锁定失败".to_string())?
            .clone();

        if let Some(binding) = binding {
            let state = manager
                .send_command(json!({ "type": "get_state" }), RPC_TIMEOUT)
                .ok()
                .and_then(|response| response.get("data").cloned());
            let state_object = state.as_ref().and_then(Value::as_object);

            return Ok(PiRuntimeSnapshot {
                connection_status: "connected".to_string(),
                workspace_path: binding.workspace_path,
                provider: binding.provider,
                model: binding.model,
                api_key_env_name: binding.api_key_env_name,
                config_path: binding.config_path,
                agent_runtime_dir: binding.agent_runtime_dir,
                auth_path: binding.auth_path,
                models_path: binding.models_path,
                started_at: Some(binding.started_at),
                is_streaming: state_object
                    .and_then(|state| state.get("isStreaming"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                session_id: state_object
                    .and_then(|state| state.get("sessionId"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                session_name: state_object
                    .and_then(|state| state.get("sessionName"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned),
                message_count: state_object.and_then(|state| value_u64(state, "messageCount")),
                pending_message_count: state_object
                    .and_then(|state| value_u64(state, "pendingMessageCount")),
            });
        }

        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        Ok(PiRuntimeSnapshot {
            connection_status: "idle".to_string(),
            workspace_path: bootstrap.default_workspace_path.clone(),
            provider: bootstrap.default_provider.clone(),
            model: bootstrap.default_model.clone(),
            api_key_env_name: bootstrap.default_api_key_env_name.clone(),
            config_path: bootstrap.config_path.clone(),
            agent_runtime_dir: bootstrap.agent_runtime_dir.clone(),
            auth_path: bootstrap.auth_path.clone(),
            models_path: bootstrap.models_path.clone(),
            started_at: None,
            is_streaming: false,
            session_id: None,
            session_name: None,
            message_count: None,
            pending_message_count: None,
        })
    })
    .await
}

#[tauri::command]
pub async fn pi_sessions_list(
    app_handle: AppHandle,
    request: PiWorkspaceRequest,
) -> Result<Vec<PiSessionSummary>, String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        let bootstrap = wait_for_app_bootstrap(&app_handle, Duration::from_secs(120))?;
        let runtime = PiRuntimePaths {
            cli_path: PathBuf::from(&bootstrap.cli_path),
            node_path: PathBuf::from(&bootstrap.node_command),
        };
        let provider_catalog = load_provider_catalog(&runtime)?;
        let _ = ensure_workspace_runtime(&app_handle, &workspace_path, &provider_catalog)?;
        list_sessions_for_workspace(&workspace_path)
    })
    .await
}

#[tauri::command]
pub async fn pi_session_load(request: PiSessionLoadRequest) -> Result<Value, String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        ensure_session_storage_dirs(&workspace_path)?;
        let path = session_file_path(&workspace_path, request.session_id.trim());
        read_session_value(&path)
    })
    .await
}

#[tauri::command]
pub async fn pi_session_save(request: PiSessionSaveRequest) -> Result<(), String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        ensure_session_storage_dirs(&workspace_path)?;
        let session_id = session_id_from_value(&request.session)?;
        let path = session_file_path(&workspace_path, &session_id);
        write_session_value(&path, &request.session)
    })
    .await
}

#[tauri::command]
pub async fn pi_session_rename(request: PiSessionRenameRequest) -> Result<(), String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        ensure_session_storage_dirs(&workspace_path)?;
        let path = session_file_path(&workspace_path, request.session_id.trim());
        let mut session = read_session_value(&path)?;
        let object = session
            .as_object_mut()
            .ok_or_else(|| "session 文件格式错误：根节点不是对象".to_string())?;
        object.insert("title".to_string(), Value::String(request.title.trim().to_string()));
        write_session_value(&path, &session)
    })
    .await
}

#[tauri::command]
pub async fn pi_session_delete(request: PiSessionDeleteRequest) -> Result<(), String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        ensure_session_storage_dirs(&workspace_path)?;
        let path = session_file_path(&workspace_path, request.session_id.trim());
        if path.exists() {
            remove_file(&path).map_err(|error| {
                format!(
                    "删除 session 文件失败: {}: {error}",
                    display_path(&path)
                )
            })?;
        }
        let pi_path = pi_session_file_path(&workspace_path, request.session_id.trim());
        if pi_path.exists() {
            remove_file(&pi_path).map_err(|error| {
                format!(
                    "删除 PI session 文件失败: {}: {error}",
                    display_path(&pi_path)
                )
            })?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn pi_session_clear_logs(request: PiSessionDeleteRequest) -> Result<(), String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        ensure_session_storage_dirs(&workspace_path)?;
        let path = session_file_path(&workspace_path, request.session_id.trim());
        let mut session = read_session_value(&path)?;
        let object = session
            .as_object_mut()
            .ok_or_else(|| "session 文件格式错误：根节点不是对象".to_string())?;
        object.insert("events".to_string(), Value::Array(Vec::new()));
        object.insert(
            "diagnostics".to_string(),
            json!({
                "stderrCount": 0,
                "errorCount": 0,
                "lastError": "",
                "lastEventAt": object
                    .get("diagnostics")
                    .and_then(Value::as_object)
                    .and_then(|diagnostics| diagnostics.get("lastEventAt"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
            }),
        );
        write_session_value(&path, &session)
    })
    .await
}

#[tauri::command]
pub async fn pi_session_export_logs(
    request: PiSessionExportLogsRequest,
) -> Result<PiLogExportResponse, String> {
    run_blocking_command(move || {
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        export_logs_for_filter(&workspace_path, &request.filter)
    })
    .await
}

#[tauri::command]
pub async fn terminal_open(
    app_handle: AppHandle,
    request: PiWorkspaceRequest,
) -> Result<TerminalSnapshot, String> {
    run_blocking_command(move || {
        let terminal = app_handle.state::<TerminalManager>();
        let workspace_path = resolve_workspace_path(request.workspace_path.as_deref())?;
        let cwd_display = display_path(&workspace_path);

        {
            let process_guard = terminal
                .process
                .lock()
                .map_err(|_| "终端状态锁定失败".to_string())?;
            if let Some(process) = process_guard.as_ref() {
                if process.cwd == cwd_display && process.running.load(Ordering::SeqCst) {
                    return Ok(TerminalSnapshot {
                        cwd: cwd_display,
                        running: true,
                        reused: true,
                        shell: process.shell.clone(),
                        instance_id: process.instance_id,
                    });
                }
            }
        }

        terminal.stop()?;

        let shell_path = resolve_terminal_shell();
        let shell_label = terminal_shell_label(&shell_path);
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("创建终端 PTY 失败: {error}"))?;
        let instance_id = terminal.instance_counter.fetch_add(1, Ordering::SeqCst) + 1;
        let running = Arc::new(AtomicBool::new(true));
        let mut command = PtyCommandBuilder::new(&shell_path);
        command.arg("-i");
        command.arg("-l");
        command.cwd(&workspace_path);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "pi-test");

        let child = pty_pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("启动 zsh 终端失败: {error}"))?;
        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("打开终端读取流失败: {error}"))?;
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|error| format!("打开终端写入流失败: {error}"))?;

        spawn_terminal_output_reader(
            app_handle.clone(),
            reader,
            running.clone(),
            instance_id,
            shell_label.clone(),
        );

        let mut guard = terminal
            .process
            .lock()
            .map_err(|_| "终端状态锁定失败".to_string())?;
        *guard = Some(TerminalProcess {
            child,
            master: pty_pair.master,
            writer,
            cwd: cwd_display.clone(),
            shell: shell_label.clone(),
            instance_id,
            running,
        });

        Ok(TerminalSnapshot {
            cwd: cwd_display,
            running: true,
            reused: false,
            shell: shell_label,
            instance_id,
        })
    })
    .await
}

#[tauri::command]
pub async fn terminal_input(
    app_handle: AppHandle,
    request: TerminalInputRequest,
) -> Result<(), String> {
    run_blocking_command(move || {
        let terminal = app_handle.state::<TerminalManager>();
        let mut guard = terminal
            .process
            .lock()
            .map_err(|_| "终端状态锁定失败".to_string())?;
        let process = guard
            .as_mut()
            .ok_or_else(|| "终端尚未打开".to_string())?;

        process
            .writer
            .write_all(request.input.as_bytes())
            .map_err(|error| format!("写入终端失败: {error}"))?;
        process
            .writer
            .flush()
            .map_err(|error| format!("刷新终端输入失败: {error}"))?;

        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn terminal_resize(
    app_handle: AppHandle,
    request: TerminalResizeRequest,
) -> Result<(), String> {
    run_blocking_command(move || {
        let terminal = app_handle.state::<TerminalManager>();
        let mut guard = terminal
            .process
            .lock()
            .map_err(|_| "终端状态锁定失败".to_string())?;
        let process = guard
            .as_mut()
            .ok_or_else(|| "终端尚未打开".to_string())?;

        process
            .master
            .resize(PtySize {
                cols: request.cols.max(1),
                rows: request.rows.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("调整终端尺寸失败: {error}"))?;

        Ok(())
    })
    .await
}

fn spawn_stdout_reader(
    app_handle: AppHandle,
    stdout: ChildStdout,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>>,
    event_gate: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            let line = match line {
                Ok(line) if !line.trim().is_empty() => line,
                Ok(_) => continue,
                Err(error) => {
                    if event_gate.load(Ordering::SeqCst) {
                        emit_pi_event(
                            &app_handle,
                            json!({
                                "kind": "error",
                                "message": format!("读取 PI RPC stdout 失败: {error}"),
                            }),
                        );
                    }
                    break;
                }
            };

            let payload = match serde_json::from_str::<Value>(&line) {
                Ok(payload) => payload,
                Err(error) => {
                    if event_gate.load(Ordering::SeqCst) {
                        emit_pi_event(
                            &app_handle,
                            json!({
                                "kind": "error",
                                "message": format!("解析 PI RPC JSON 失败: {error}"),
                                "raw": line,
                            }),
                        );
                    }
                    continue;
                }
            };

            if payload.get("type").and_then(Value::as_str) == Some("response") {
                let request_id = payload
                    .get("id")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);

                if let Some(request_id) = request_id {
                    if let Ok(mut pending_requests) = pending.lock() {
                        if let Some(sender) = pending_requests.remove(&request_id) {
                            let result = if payload
                                .get("success")
                                .and_then(Value::as_bool)
                                .unwrap_or(false)
                            {
                                Ok(payload)
                            } else {
                                Err(response_error_message(&payload))
                            };
                            let _ = sender.send(result);
                        }
                    }
                }

                continue;
            }

            if event_gate.load(Ordering::SeqCst) {
                emit_pi_event(
                    &app_handle,
                    json!({
                        "kind": "event",
                        "payload": payload,
                    }),
                );
            }
        }

        fail_all_pending_requests(&pending, "PI RPC stdout 已关闭");
        if event_gate.load(Ordering::SeqCst) {
            emit_pi_event(
                &app_handle,
                json!({
                    "kind": "status",
                    "status": "stopped",
                }),
            );
        }
    });
}

#[cfg(target_os = "macos")]
fn measure_window_chrome_metrics(window: &WebviewWindow) -> Result<WindowChromeMetrics, String> {
    let ns_window = window
        .ns_window()
        .map_err(|error| format!("获取原生窗口句柄失败: {error}"))?;

    if ns_window.is_null() {
        return Err("原生窗口句柄为空".to_string());
    }

    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };

    let close_button = ns_window
        .standardWindowButton(NSWindowButton::CloseButton)
        .ok_or_else(|| "未找到 macOS close button".to_string())?;
    let anchor_button = ns_window
        .standardWindowButton(NSWindowButton::ZoomButton)
        .or_else(|| ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton))
        .ok_or_else(|| "未找到 macOS titlebar buttons".to_string())?;

    let Some(button_superview) = (unsafe { close_button.superview() }) else {
        return Err("未找到 traffic lights superview".to_string());
    };
    let Some(titlebar_container) = (unsafe { button_superview.superview() }) else {
        return Err("未找到 titlebar container".to_string());
    };

    let close_frame = close_button.frame();
    let anchor_frame = anchor_button.frame();
    let container_frame = titlebar_container.frame();
    let window_frame = ns_window.frame();

    let button_center_y = window_frame.size.height
        - (container_frame.origin.y + close_frame.origin.y + (close_frame.size.height / 2.0));
    let control_group_left =
        container_frame.origin.x + anchor_frame.origin.x + anchor_frame.size.width + 16.0;

    Ok(WindowChromeMetrics {
        control_group_left,
        button_center_y,
    })
}

fn spawn_stderr_reader(
    app_handle: AppHandle,
    stderr: ChildStderr,
    stderr_buffer: Arc<Mutex<String>>,
    event_gate: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);

        for line in reader.lines() {
            let line = match line {
                Ok(line) if !line.trim().is_empty() => line,
                Ok(_) => continue,
                Err(error) => {
                    if event_gate.load(Ordering::SeqCst) {
                        emit_pi_event(
                            &app_handle,
                            json!({
                                "kind": "error",
                                "message": format!("读取 PI RPC stderr 失败: {error}"),
                            }),
                        );
                    }
                    break;
                }
            };

            if let Ok(mut buffer) = stderr_buffer.lock() {
                if !buffer.is_empty() {
                    buffer.push('\n');
                }
                buffer.push_str(&line);
            }

            if event_gate.load(Ordering::SeqCst) {
                emit_pi_event(
                    &app_handle,
                    json!({
                        "kind": "stderr",
                        "line": line,
                    }),
                );
            }
        }
    });
}

fn spawn_terminal_output_reader(
    app_handle: AppHandle,
    mut reader: Box<dyn Read + Send>,
    running: Arc<AtomicBool>,
    instance_id: u64,
    shell_label: String,
) {
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 4096];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let should_emit = running.swap(false, Ordering::SeqCst);
                    if should_emit {
                        emit_terminal_event(
                            &app_handle,
                            json!({
                                "kind": "exit",
                                "instanceId": instance_id,
                                "message": format!("{shell_label} session ended"),
                            }),
                        );
                    }
                    break;
                }
                Ok(size) => {
                    let chunk = String::from_utf8_lossy(&buffer[..size]).to_string();
                    emit_terminal_event(
                        &app_handle,
                        json!({
                            "kind": "data",
                            "instanceId": instance_id,
                            "data": chunk,
                        }),
                    );
                }
                Err(error) => {
                    let should_emit = running.swap(false, Ordering::SeqCst);
                    if should_emit {
                        emit_terminal_event(
                            &app_handle,
                            json!({
                                "kind": "error",
                                "instanceId": instance_id,
                                "message": format!("读取终端输出失败: {error}"),
                            }),
                        );
                    }
                    break;
                }
            }
        }
    });
}

fn resolve_terminal_shell() -> String {
    env::var("SHELL")
        .ok()
        .filter(|value| value.contains("zsh"))
        .unwrap_or_else(|| "/bin/zsh".to_string())
}

fn terminal_shell_label(shell_path: &str) -> String {
    Path::new(shell_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("zsh")
        .to_string()
}

fn resolve_workspace_path(path: Option<&str>) -> Result<PathBuf, String> {
    let workspace_path = normalize_optional(path)
        .map(expand_home_path)
        .transpose()?
        .unwrap_or(default_workspace_dir()?);

    if !workspace_path.exists() {
        create_dir_all(&workspace_path).map_err(|error| format!("创建工作目录失败: {error}"))?;
    }

    if !workspace_path.is_dir() {
        return Err(format!(
            "工作目录不是文件夹: {}",
            display_path(&workspace_path)
        ));
    }

    Ok(workspace_path)
}

fn resolve_api_key_env_name(
    explicit_name: Option<&str>,
    provider: Option<&str>,
) -> Result<String, String> {
    if let Some(explicit_name) = normalize_optional(explicit_name) {
        return Ok(explicit_name.to_string());
    }

    if let Some(provider) = normalize_optional(provider) {
        if let Some(default_name) = default_api_key_env_name(provider) {
            return Ok(default_name.to_string());
        }

        return Err(format!(
            "当前 provider `{provider}` 没有内置 API Key 环境变量映射，请手动填写 API Key Env。"
        ));
    }

    Err("输入 API Key 时需要同时提供 provider，或者手动填写 API Key Env。".to_string())
}

fn default_api_key_env_name(provider: &str) -> Option<&'static str> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "deepseek" => Some("DEEPSEEK_API_KEY"),
        "openai" | "openai-codex" => Some("OPENAI_API_KEY"),
        "anthropic" => Some("ANTHROPIC_API_KEY"),
        "google" | "google-gemini-cli" | "google-antigravity" => Some("GEMINI_API_KEY"),
        "groq" => Some("GROQ_API_KEY"),
        "xai" => Some("XAI_API_KEY"),
        "openrouter" => Some("OPENROUTER_API_KEY"),
        "mistral" => Some("MISTRAL_API_KEY"),
        "cerebras" => Some("CEREBRAS_API_KEY"),
        "huggingface" => Some("HUGGINGFACE_API_KEY"),
        "zai" => Some("ZAI_API_KEY"),
        "kimi-coding" => Some("KIMI_API_KEY"),
        "minimax" | "minimax-cn" => Some("MINIMAX_API_KEY"),
        "vercel-ai-gateway" => Some("AI_GATEWAY_API_KEY"),
        _ => None,
    }
}

fn default_schema_version() -> u32 {
    1
}

fn default_config_source() -> String {
    "pi-test".to_string()
}

fn default_compat_config() -> Value {
    json!({
        "openclaw": {
            "auth": {
                "profiles": {}
            },
            "models": {
                "mode": "merge",
                "providers": {}
            },
            "agents": {
                "defaults": {
                    "compaction": {
                        "mode": "safeguard"
                    }
                },
                "list": []
            },
            "tools": {
                "web": {
                    "search": {
                        "enabled": false
                    },
                    "fetch": {
                        "enabled": false
                    }
                }
            },
            "messages": {
                "ackReactionScope": "group-mentions"
            },
            "commands": {
                "native": "auto",
                "nativeSkills": "auto"
            },
            "hooks": {
                "internal": {
                    "enabled": true,
                    "entries": {
                        "boot-md": { "enabled": true },
                        "command-logger": { "enabled": true },
                        "session-memory": { "enabled": true }
                    }
                }
            },
            "channels": {},
            "gateway": {
                "mode": "local",
                "bind": "loopback"
            },
            "skills": {
                "install": {
                    "nodeManager": "npm"
                }
            },
            "plugins": {
                "entries": {},
                "installs": {}
            },
            "bindings": []
        }
    })
}

fn workspace_pi_dir(workspace_path: &Path) -> PathBuf {
    workspace_path.join(PI_DIR_NAME)
}

fn workspace_app_dir(workspace_path: &Path) -> PathBuf {
    workspace_path.join(PITEST_APP_DIR_NAME)
}

fn workspace_sessions_dir(workspace_path: &Path) -> PathBuf {
    workspace_app_dir(workspace_path).join("sessions")
}

fn workspace_pi_sessions_dir(workspace_path: &Path) -> PathBuf {
    workspace_app_dir(workspace_path).join("pi-sessions")
}

fn workspace_exports_dir(workspace_path: &Path) -> PathBuf {
    workspace_app_dir(workspace_path).join("exports")
}

fn workspace_agent_runtime_dir(workspace_path: &Path) -> PathBuf {
    workspace_pi_dir(workspace_path).join(PI_AGENT_RUNTIME_DIR_NAME)
}

fn workspace_auth_path(workspace_path: &Path) -> PathBuf {
    workspace_agent_runtime_dir(workspace_path).join("auth.json")
}

fn workspace_models_path(workspace_path: &Path) -> PathBuf {
    workspace_agent_runtime_dir(workspace_path).join("models.json")
}

fn workspace_settings_path(workspace_path: &Path) -> PathBuf {
    workspace_pi_dir(workspace_path).join("settings.json")
}

fn workspace_config_path(workspace_path: &Path) -> PathBuf {
    workspace_path.join(PITEST_CONFIG_FILE_NAME)
}

fn workspace_state_path(workspace_path: &Path) -> PathBuf {
    workspace_app_dir(workspace_path).join(PITEST_WORKSPACE_STATE_FILE_NAME)
}

fn workspace_identity_path(workspace_path: &Path) -> PathBuf {
    workspace_path.join("IDENTITY.md")
}

fn workspace_user_path(workspace_path: &Path) -> PathBuf {
    workspace_path.join("USER.md")
}

fn workspace_bootstrap_path(workspace_path: &Path) -> PathBuf {
    workspace_path.join("BOOTSTRAP.md")
}

fn ensure_workspace_runtime(
    app_handle: &AppHandle,
    workspace_path: &Path,
    provider_catalog: &PiProviderCatalog,
) -> Result<WorkspaceRuntimeState, String> {
    update_bootstrap_progress(
        app_handle,
        "正在同步 Workspace",
        "正在准备文档模板、配置文件和运行时目录。",
        94,
    );

    create_dir_all(workspace_path).map_err(|error| {
        format!(
            "创建 workspace 目录失败: {}: {error}",
            display_path(workspace_path)
        )
    })?;
    create_dir_all(workspace_app_dir(workspace_path)).map_err(|error| {
        format!(
            "创建 pi-test workspace 数据目录失败: {}: {error}",
            display_path(&workspace_app_dir(workspace_path))
        )
    })?;
    let workspace_state = ensure_workspace_state_file(workspace_path)?;
    create_dir_all(workspace_sessions_dir(workspace_path)).map_err(|error| {
        format!(
            "创建 session 目录失败: {}: {error}",
            display_path(&workspace_sessions_dir(workspace_path))
        )
    })?;
    create_dir_all(workspace_exports_dir(workspace_path)).map_err(|error| {
        format!(
            "创建导出目录失败: {}: {error}",
            display_path(&workspace_exports_dir(workspace_path))
        )
    })?;
    sync_workspace_templates(app_handle, workspace_path)?;

    let config_path = workspace_config_path(workspace_path);
    let mut config = load_or_initialize_workspace_config(&config_path, workspace_path, provider_catalog)?;
    config.workspace.path = display_path(workspace_path);

    let agent_runtime_dir = workspace_agent_runtime_dir(workspace_path);
    create_dir_all(&agent_runtime_dir).map_err(|error| {
        format!(
            "创建 agent runtime 目录失败: {}: {error}",
            display_path(&agent_runtime_dir)
        )
    })?;

    let auth_path = workspace_auth_path(workspace_path);
    ensure_auth_file(&auth_path)?;
    let models_path = workspace_models_path(workspace_path);
    migrate_legacy_plaintext_provider_secrets(&mut config, &auth_path, provider_catalog)?;
    config = normalize_workspace_config(config, workspace_path, provider_catalog);
    maybe_persist_workspace_config(&config_path, &config, None)?;
    write_models_json(&models_path, &config, provider_catalog)?;
    let settings_path = workspace_settings_path(workspace_path);
    write_settings_json(&settings_path, &config)?;
    let onboarding = inspect_workspace_onboarding(workspace_path, &workspace_state);

    update_bootstrap_progress(
        app_handle,
        "Workspace 已同步",
        "Pi workspace 模板和运行时配置已经准备完成。",
        97,
    );

    Ok(WorkspaceRuntimeState {
        config,
        config_path,
        agent_runtime_dir,
        auth_path,
        models_path,
        settings_path,
        onboarding,
    })
}

fn sync_workspace_templates(app_handle: &AppHandle, workspace_path: &Path) -> Result<(), String> {
    let template_root = workspace_template_root(app_handle)?;
    let managed_files = [("AGENTS.md", true), (".pi/APPEND_SYSTEM.md", true)];
    let user_files = [
        ("IDENTITY.md", false),
        ("SOUL.md", false),
        ("USER.md", false),
        ("TOOLS.md", false),
        ("HEARTBEAT.md", false),
        ("MEMORY.md", false),
    ];

    for (relative_path, overwrite) in managed_files.into_iter().chain(user_files) {
        sync_template_file(&template_root, workspace_path, relative_path, overwrite)?;
    }

    let template_memory_dir = template_root.join("memory");
    if template_memory_dir.exists() {
        for entry in read_dir(&template_memory_dir).map_err(|error| {
            format!(
                "读取 memory 模板目录失败: {}: {error}",
                display_path(&template_memory_dir)
            )
        })? {
            let entry = entry.map_err(|error| {
                format!(
                    "读取 memory 模板文件失败: {}: {error}",
                    display_path(&template_memory_dir)
                )
            })?;
            let source_path = entry.path();
            if !source_path.is_file() {
                continue;
            }

            let file_name = source_path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| {
                    format!("无法解析 memory 模板文件名: {}", display_path(&source_path))
                })?;

            sync_template_file(
                &template_root,
                workspace_path,
                &format!("memory/{file_name}"),
                false,
            )?;
        }
    }

    sync_bootstrap_contract(&template_root, workspace_path)?;

    Ok(())
}

fn workspace_template_root(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Some(resource_dir) = app_handle.path().resource_dir().ok() {
        let bundled_path = resource_dir.join(PITEST_TEMPLATE_DIR);
        if bundled_path.exists() {
            return Ok(bundled_path);
        }
    }

    let dev_path = project_root()
        .join("src-tauri")
        .join("resources")
        .join("pi-workspace-template");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("未找到 Pi workspace 模板目录。".to_string())
}

fn pi_session_backfill_script_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Some(resource_dir) = app_handle.path().resource_dir().ok() {
        let bundled_path = resource_dir
            .join(BUNDLED_RUNTIME_DIR)
            .join(PI_SESSION_BACKFILL_SCRIPT_NAME);
        if bundled_path.exists() {
            return Ok(bundled_path);
        }
    }

    let scripts_path = project_root()
        .join("scripts")
        .join(PI_SESSION_BACKFILL_SCRIPT_NAME);
    if scripts_path.exists() {
        return Ok(scripts_path);
    }

    let dev_path = project_root()
        .join("src-tauri")
        .join("resources")
        .join("pi-bundles")
        .join(PI_SESSION_BACKFILL_SCRIPT_NAME);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("未找到 PI session 迁移脚本。".to_string())
}

fn backfill_pi_session_from_app_session(
    app_handle: &AppHandle,
    node_path: &Path,
    runtime: &PiRuntimePaths,
    workspace_path: &Path,
    session_id: &str,
    force_rebuild: bool,
) -> Result<(), String> {
    let source_path = session_file_path(workspace_path, session_id);
    if !source_path.exists() {
        return Ok(());
    }

    let target_path = pi_session_file_path(workspace_path, session_id);
    if force_rebuild && target_path.exists() {
        remove_file(&target_path).map_err(|error| {
            format!(
                "清理损坏的 PI session 文件失败 {}: {error}",
                display_path(&target_path)
            )
        })?;
    }

    if target_path.exists() {
        let has_content = target_path
            .metadata()
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false);
        if has_content {
            return Ok(());
        }
    }

    let script_path = pi_session_backfill_script_path(app_handle)?;
    let module_path = runtime
        .cli_path
        .parent()
        .map(|path| path.join("index.js"))
        .ok_or_else(|| "无法解析 PI runtime index.js 路径。".to_string())?;
    let status = Command::new(node_path)
        .arg(&script_path)
        .arg(&source_path)
        .arg(&target_path)
        .arg(&module_path)
        .status()
        .map_err(|error| format!("启动 PI session 迁移脚本失败: {error}"))?;

    if status.success() {
        return Ok(());
    }

    Err(format!(
        "PI session 迁移脚本执行失败: {}",
        display_path(&script_path)
    ))
}

fn should_attempt_session_self_heal(error: &str) -> bool {
    let normalized = error.trim().to_lowercase();

    if normalized.is_empty() {
        return false;
    }

    if normalized.contains("未找到 pi session 迁移脚本")
        || normalized.contains("启动 pi session 迁移脚本失败")
    {
        return false;
    }

    normalized.contains("session")
        || normalized.contains("等待 pi rpc 响应超时")
        || normalized.contains("pi rpc 响应通道已断开")
        || normalized.contains("pi 进程已退出")
        || normalized.contains("stdout 已关闭")
}

fn sync_template_file(
    template_root: &Path,
    workspace_path: &Path,
    relative_path: &str,
    overwrite: bool,
) -> Result<(), String> {
    let source_path = template_root.join(relative_path);
    let target_path = workspace_path.join(relative_path);

    if !source_path.exists() {
        return Err(format!(
            "缺少模板文件: {}",
            display_path(&source_path)
        ));
    }

    if target_path.exists() && !overwrite {
        return Ok(());
    }

    let contents = read_to_string(&source_path).map_err(|error| {
        format!(
            "读取模板文件失败: {}: {error}",
            display_path(&source_path)
        )
    })?;

    if let Some(parent) = target_path.parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "创建模板目标目录失败: {}: {error}",
                display_path(parent)
            )
        })?;
    }

    write(&target_path, contents.as_bytes()).map_err(|error| {
        format!(
            "写入模板文件失败: {}: {error}",
            display_path(&target_path)
        )
    })?;

    Ok(())
}

fn ensure_workspace_state_file(workspace_path: &Path) -> Result<PiWorkspaceState, String> {
    let path = workspace_state_path(workspace_path);
    if path.exists() {
        let raw = read_to_string(&path).map_err(|error| {
            format!(
                "读取 workspace-state.json 失败: {}: {error}",
                display_path(&path)
            )
        })?;
        return serde_json::from_str::<PiWorkspaceState>(&raw).map_err(|error| {
            format!(
                "解析 workspace-state.json 失败: {}: {error}",
                display_path(&path)
            )
        });
    }

    let state = PiWorkspaceState::default();
    let encoded = serde_json::to_vec_pretty(&state)
        .map_err(|error| format!("序列化 workspace-state.json 失败: {error}"))?;
    write(&path, encoded).map_err(|error| {
        format!(
            "写入 workspace-state.json 失败: {}: {error}",
            display_path(&path)
        )
    })?;
    Ok(state)
}

fn sync_bootstrap_contract(template_root: &Path, workspace_path: &Path) -> Result<(), String> {
    let onboarding = inspect_workspace_onboarding(workspace_path, &ensure_workspace_state_file(workspace_path)?);
    let bootstrap_path = workspace_bootstrap_path(workspace_path);

    if onboarding.required {
        return sync_template_file(template_root, workspace_path, "BOOTSTRAP.md", true);
    }

    if bootstrap_path.exists() {
        remove_file(&bootstrap_path).map_err(|error| {
            format!(
                "删除已完成的 BOOTSTRAP.md 失败: {}: {error}",
                display_path(&bootstrap_path)
            )
        })?;
    }

    Ok(())
}

fn inspect_workspace_onboarding(
    workspace_path: &Path,
    workspace_state: &PiWorkspaceState,
) -> PiWorkspaceOnboardingInfo {
    let identity_raw = read_to_string(workspace_identity_path(workspace_path)).unwrap_or_default();
    let user_raw = read_to_string(workspace_user_path(workspace_path)).unwrap_or_default();

    let assistant_name = parse_markdown_field(&identity_raw, "Name");
    let assistant_creature = parse_markdown_field(&identity_raw, "Creature");
    let assistant_vibe = parse_markdown_field(&identity_raw, "Vibe");
    let user_name = parse_markdown_field(&user_raw, "Name");
    let user_call_name = parse_markdown_field(&user_raw, "What to call them");
    let user_timezone = parse_markdown_field(&user_raw, "Timezone");

    let assistant_identity_known = [
        assistant_name.as_deref(),
        assistant_creature.as_deref(),
        assistant_vibe.as_deref(),
    ]
    .into_iter()
    .all(is_meaningful_identity_value);
    let user_identity_known = [
        user_name.as_deref(),
        user_call_name.as_deref(),
        user_timezone.as_deref(),
    ]
    .into_iter()
    .all(is_meaningful_identity_value);
    let required = !assistant_identity_known || !user_identity_known;
    let resolved_assistant_name = assistant_name
        .clone()
        .filter(|value| is_meaningful_identity_value(Some(value)));
    let resolved_user_name = user_call_name
        .clone()
        .filter(|value| is_meaningful_identity_value(Some(value)))
        .or_else(|| user_name.clone().filter(|value| is_meaningful_identity_value(Some(value))));

    PiWorkspaceOnboardingInfo {
        required,
        assistant_identity_known,
        user_identity_known,
        assistant_name: resolved_assistant_name,
        user_name: resolved_user_name,
        bootstrap_seeded_at: Some(workspace_state.bootstrap_seeded_at.clone()),
        suggested_starter_prompt: required.then(|| {
            build_onboarding_starter_prompt(
                assistant_name.as_deref(),
                user_call_name.as_deref().or(user_name.as_deref()),
                assistant_identity_known,
                user_identity_known,
            )
        }),
    }
}

fn parse_markdown_field(content: &str, field: &str) -> Option<String> {
    let prefixes = [
        format!("- **{field}:**"),
        format!("**{field}:**"),
        format!("- {field}:"),
        format!("{field}:"),
    ];

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        for prefix in &prefixes {
            if let Some(value) = line.strip_prefix(prefix) {
                let normalized = value.trim().trim_matches('`').trim();
                if normalized.is_empty() {
                    return None;
                }
                return Some(normalized.to_string());
            }
        }
    }

    None
}

fn is_meaningful_identity_value(value: Option<&str>) -> bool {
    let Some(raw) = value else {
        return false;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return false;
    }

    let normalized = trimmed
        .trim_matches(|char| matches!(char, '(' | ')' | '[' | ']' | '"' | '\''))
        .trim()
        .to_ascii_lowercase();

    !matches!(
        normalized.as_str(),
        ""
            | "unknown"
            | "unk"
            | "tbd"
            | "todo"
            | "n/a"
            | "none"
            | "待定"
            | "待填写"
            | "未设置"
            | "待补充"
            | "to be decided"
            | "to be filled"
            | "placeholder"
            | "your name"
            | "assistant name"
            | "user name"
            | "unknown user"
            | "unknown assistant"
            | "to be learned"
    )
}

fn build_onboarding_starter_prompt(
    assistant_name: Option<&str>,
    user_name: Option<&str>,
    assistant_identity_known: bool,
    user_identity_known: bool,
) -> String {
    let assistant_hint = assistant_name
        .filter(|value| is_meaningful_identity_value(Some(value)))
        .map(|value| format!("Current assistant name hint: {value}."))
        .unwrap_or_default();
    let user_hint = user_name
        .filter(|value| is_meaningful_identity_value(Some(value)))
        .map(|value| format!("Current user-name hint: {value}."))
        .unwrap_or_default();
    let focus = match (assistant_identity_known, user_identity_known) {
        (false, false) => {
            "Ask naturally who you are and who the human is. Keep it warm, brief, and non-robotic."
        }
        (false, true) => {
            "The user is mostly known, but your own identity is incomplete. Ask what they want to call you and what kind of assistant you should be."
        }
        (true, false) => {
            "Your identity is mostly known, but the user profile is incomplete. Ask what to call them and any missing context like timezone if it fits naturally."
        }
        (true, true) => {
            "Identity onboarding looks complete. Do not ask onboarding questions unless the human explicitly wants to revisit them."
        }
    };

    format!(
        concat!(
            "This workspace still needs identity onboarding. ",
            "Before any normal task, read BOOTSTRAP.md, IDENTITY.md, USER.md, and SOUL.md. ",
            "{focus} ",
            "Send exactly one short conversational opener to the human now. ",
            "Do not dump the whole questionnaire. ",
            "After the human replies, update IDENTITY.md and USER.md with what you learn. ",
            "{assistant_hint} {user_hint}"
        ),
        focus = focus,
        assistant_hint = assistant_hint,
        user_hint = user_hint,
    )
    .trim()
    .to_string()
}

fn load_or_initialize_workspace_config(
    config_path: &Path,
    workspace_path: &Path,
    provider_catalog: &PiProviderCatalog,
) -> Result<PiTestConfig, String> {
    let existing = if config_path.exists() {
        let raw = read_to_string(config_path).map_err(|error| {
            format!(
                "读取 .pitest.json 失败: {}: {error}",
                display_path(config_path)
            )
        })?;
        serde_json::from_str::<PiTestConfig>(&raw).map_err(|error| {
            format!(
                "解析 .pitest.json 失败: {}: {error}",
                display_path(config_path)
            )
        })?
    } else {
        PiTestConfig::default()
    };

    let normalized = normalize_workspace_config(existing.clone(), workspace_path, provider_catalog);
    maybe_persist_workspace_config(
        config_path,
        &normalized,
        config_path.exists().then_some(&existing),
    )?;
    Ok(normalized)
}

fn normalize_workspace_config(
    mut config: PiTestConfig,
    workspace_path: &Path,
    provider_catalog: &PiProviderCatalog,
) -> PiTestConfig {
    config.meta.schema_version = default_schema_version();
    if config.meta.source.trim().is_empty() {
        config.meta.source = default_config_source();
    }

    config.workspace.path = display_path(workspace_path);
    if config.compat.is_null() {
        config.compat = default_compat_config();
    }

    config.providers = normalize_provider_entries(config.providers, provider_catalog);
    let fallback_provider = preferred_default_provider(provider_catalog)
        .map(|provider| provider.provider.clone())
        .unwrap_or_else(|| "deepseek".to_string());

    if config.defaults.provider.trim().is_empty()
        || find_provider_catalog_entry(provider_catalog, &config.defaults.provider).is_none()
    {
        config.defaults.provider = fallback_provider;
    }

    config.defaults.model = resolve_model_for_provider(
        provider_catalog,
        &config.providers,
        &config.defaults.provider,
        normalize_optional(Some(config.defaults.model.as_str())),
    );

    config
}

fn maybe_persist_workspace_config(
    config_path: &Path,
    config: &PiTestConfig,
    previous: Option<&PiTestConfig>,
) -> Result<(), String> {
    if previous.is_some() && previous == Some(config) {
        return Ok(());
    }

    let encoded = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("序列化 .pitest.json 失败: {error}"))?;
    write(config_path, encoded).map_err(|error| {
        format!(
            "写入 .pitest.json 失败: {}: {error}",
            display_path(config_path)
        )
    })
}

fn build_config_snapshot(
    workspace_path: &Path,
    workspace_state: &WorkspaceRuntimeState,
    provider_catalog: &PiProviderCatalog,
) -> Result<PiConfigSnapshot, String> {
    let auth_entries = read_auth_map(&workspace_state.auth_path)?;
    let compaction = resolve_compaction_snapshot(&workspace_state.config);

    Ok(PiConfigSnapshot {
        workspace_path: display_path(workspace_path),
        config_path: display_path(&workspace_state.config_path),
        auth_path: display_path(&workspace_state.auth_path),
        models_path: display_path(&workspace_state.models_path),
        settings_path: display_path(&workspace_state.settings_path),
        defaults: PiConfigDefaultsSnapshot {
            provider: workspace_state.config.defaults.provider.clone(),
            model: workspace_state.config.defaults.model.clone(),
        },
        providers: provider_catalog
            .builtin_providers
            .iter()
            .chain(provider_catalog.custom_providers.iter())
            .map(|provider_entry| {
                let saved = workspace_state
                    .config
                    .providers
                    .iter()
                    .find(|provider| provider.provider.eq_ignore_ascii_case(&provider_entry.provider));

                WorkspaceProviderConfigSnapshot {
                    provider: provider_entry.provider.clone(),
                    kind: saved
                        .map(|provider| provider.kind.clone())
                        .unwrap_or_else(|| provider_entry.kind.clone()),
                    enabled: saved.map(|provider| provider.enabled).unwrap_or(true),
                    default_model: saved
                        .map(|provider| provider.default_model.clone())
                        .unwrap_or_else(|| provider_entry.default_model.clone()),
                    api_key_env_name: saved
                        .and_then(|provider| provider.api_key_env_name.clone())
                        .or_else(|| Some(provider_entry.api_key_env_name.clone())),
                    base_url: saved.and_then(|provider| provider.base_url.clone()),
                    headers: saved.and_then(|provider| provider.headers.clone()),
                    has_stored_credential: auth_entries.contains_key(&provider_entry.provider),
                }
            })
            .collect(),
        compaction,
    })
}

fn apply_config_patches(
    config: &mut PiTestConfig,
    auth_path: &Path,
    provider_catalog: &PiProviderCatalog,
    defaults_patch: Option<PiConfigDefaultsPatch>,
    provider_patch: Option<PiProviderConfigPatch>,
    credential_patch: Option<PiProviderCredentialPatch>,
    compaction_patch: Option<PiCompactionPatch>,
) -> Result<(), String> {
    if let Some(defaults_patch) = defaults_patch {
        if let Some(provider) = normalize_optional(defaults_patch.provider.as_deref()) {
            let provider_entry = find_provider_catalog_entry(provider_catalog, provider)
                .ok_or_else(|| format!("未知 provider: {provider}"))?;
            config.defaults.provider = provider_entry.provider.clone();
        }

        if !config.defaults.provider.trim().is_empty() {
            config.defaults.model = resolve_model_for_provider(
                provider_catalog,
                &config.providers,
                &config.defaults.provider,
                normalize_optional(defaults_patch.model.as_deref()),
            );
        }
    }

    if let Some(provider_patch) = provider_patch {
        let provider_id = normalize_optional(Some(provider_patch.provider.as_str()))
            .ok_or_else(|| "保存 provider 配置时必须指定 provider。".to_string())?
            .to_string();
        let provider_entry = find_provider_catalog_entry(provider_catalog, &provider_id)
            .ok_or_else(|| format!("未知 provider: {provider_id}"))?;
        let default_model = resolve_model_for_provider(
            provider_catalog,
            &config.providers,
            &provider_id,
            normalize_optional(provider_patch.default_model.as_deref()),
        );
        let next_env_name = resolve_api_key_env_name(
            normalize_optional(provider_patch.api_key_env_name.as_deref()),
            Some(&provider_id),
        )?;
        let next_base_url = normalize_optional(provider_patch.base_url.as_deref()).map(ToOwned::to_owned);
        let next_headers = provider_patch.headers.and_then(|headers| {
            let cleaned = headers
                .into_iter()
                .filter_map(|(key, value)| {
                    let next_key = key.trim();
                    let next_value = value.trim();
                    if next_key.is_empty() || next_value.is_empty() {
                        None
                    } else {
                        Some((next_key.to_string(), next_value.to_string()))
                    }
                })
                .collect::<HashMap<_, _>>();

            (!cleaned.is_empty()).then_some(cleaned)
        });

        if let Some(existing) = config
            .providers
            .iter_mut()
            .find(|entry| entry.provider.eq_ignore_ascii_case(&provider_id))
        {
            existing.kind = provider_entry.kind.clone();
            existing.enabled = provider_patch.enabled.unwrap_or(true);
            existing.default_model = default_model;
            existing.api_key_env_name = Some(next_env_name);
            existing.base_url = next_base_url;
            existing.headers = next_headers;
        } else {
            config.providers.push(WorkspaceProviderConfig {
                provider: provider_id.clone(),
                kind: provider_entry.kind.clone(),
                enabled: provider_patch.enabled.unwrap_or(true),
                default_model,
                api_key_env_name: Some(next_env_name),
                base_url: next_base_url,
                headers: next_headers,
            });
        }
    }

    if let Some(credential_patch) = credential_patch {
        let provider_id = normalize_optional(Some(credential_patch.provider.as_str()))
            .ok_or_else(|| "保存 API Key 时必须指定 provider。".to_string())?;
        match normalize_optional(credential_patch.api_key.as_deref()) {
            Some(api_key) => update_auth_file(auth_path, provider_id, api_key)?,
            None => remove_auth_provider(auth_path, provider_id)?,
        }
    }

    if let Some(compaction_patch) = compaction_patch {
        apply_compaction_patch(&mut config.compat, compaction_patch);
    }

    config.providers = normalize_provider_entries(config.providers.clone(), provider_catalog);

    Ok(())
}

fn normalize_provider_entries(
    providers: Vec<WorkspaceProviderConfig>,
    provider_catalog: &PiProviderCatalog,
) -> Vec<WorkspaceProviderConfig> {
    let mut deduped = Vec::<WorkspaceProviderConfig>::new();

    for entry in providers {
        let provider = entry.provider.trim().to_string();
        if provider.is_empty() {
            continue;
        }

        let kind = if provider.eq_ignore_ascii_case("deepseek") {
            "app-custom".to_string()
        } else {
            "pi-builtin".to_string()
        };

        let default_model = resolve_model_for_provider(
            provider_catalog,
            &deduped,
            &provider,
            normalize_optional(Some(entry.default_model.as_str())),
        );
        let api_key_env_name = normalize_optional(entry.api_key_env_name.as_deref())
            .map(ToOwned::to_owned)
            .or_else(|| default_api_key_env_name(&provider).map(ToOwned::to_owned));
        let base_url = normalize_optional(entry.base_url.as_deref()).map(ToOwned::to_owned);
        let headers = entry.headers.and_then(|headers| {
            let next = headers
                .into_iter()
                .filter_map(|(key, value)| {
                    let trimmed_key = key.trim();
                    let trimmed_value = value.trim();
                    if trimmed_key.is_empty() || trimmed_value.is_empty() {
                        None
                    } else {
                        Some((trimmed_key.to_string(), trimmed_value.to_string()))
                    }
                })
                .collect::<HashMap<_, _>>();

            (!next.is_empty()).then_some(next)
        });

        if let Some(existing) = deduped.iter_mut().find(|candidate| candidate.provider == provider) {
            existing.kind = kind;
            existing.enabled = entry.enabled;
            existing.default_model = default_model;
            existing.api_key_env_name = api_key_env_name;
            existing.base_url = base_url;
            existing.headers = headers;
            continue;
        }

        deduped.push(WorkspaceProviderConfig {
            provider,
            kind,
            enabled: entry.enabled,
            default_model,
            api_key_env_name,
            base_url,
            headers,
        });
    }

    deduped
}

fn preferred_default_provider<'a>(
    provider_catalog: &'a PiProviderCatalog,
) -> Option<&'a PiProviderCatalogEntry> {
    ["zai", "openai", "anthropic", "google", "minimax", "minimax-cn"]
        .iter()
        .find_map(|provider| {
            provider_catalog
                .builtin_providers
                .iter()
                .find(|entry| entry.provider == *provider)
        })
        .or_else(|| provider_catalog.builtin_providers.first())
        .or_else(|| provider_catalog.custom_providers.first())
}

fn find_provider_catalog_entry<'a>(
    provider_catalog: &'a PiProviderCatalog,
    provider: &str,
) -> Option<&'a PiProviderCatalogEntry> {
    provider_catalog
        .builtin_providers
        .iter()
        .chain(provider_catalog.custom_providers.iter())
        .find(|entry| entry.provider.eq_ignore_ascii_case(provider))
}

fn resolve_model_for_provider(
    provider_catalog: &PiProviderCatalog,
    configured_providers: &[WorkspaceProviderConfig],
    provider: &str,
    requested_model: Option<&str>,
) -> String {
    let provider_entry = match find_provider_catalog_entry(provider_catalog, provider) {
        Some(entry) => entry,
        None => return requested_model.unwrap_or_default().to_string(),
    };

    if let Some(model) = requested_model {
        if provider_entry.models.iter().any(|candidate| candidate.id == model) {
            return model.to_string();
        }
    }

    if let Some(saved) = configured_providers
        .iter()
        .find(|entry| entry.provider.eq_ignore_ascii_case(provider))
        .and_then(|entry| normalize_optional(Some(entry.default_model.as_str())))
    {
        if provider_entry.models.iter().any(|candidate| candidate.id == saved) {
            return saved.to_string();
        }
    }

    provider_entry.default_model.clone()
}

fn read_auth_map(auth_path: &Path) -> Result<serde_json::Map<String, Value>, String> {
    ensure_auth_file(auth_path)?;
    let raw = read_to_string(auth_path).map_err(|error| {
        format!(
            "读取 auth.json 失败: {}: {error}",
            display_path(auth_path)
        )
    })?;
    serde_json::from_str::<serde_json::Map<String, Value>>(&raw).map_err(|error| {
        format!(
            "解析 auth.json 失败: {}: {error}",
            display_path(auth_path)
        )
    })
}

fn write_auth_map(
    auth_path: &Path,
    auth_data: &serde_json::Map<String, Value>,
) -> Result<(), String> {
    let encoded = serde_json::to_vec_pretty(auth_data)
        .map_err(|error| format!("序列化 auth.json 失败: {error}"))?;
    write(auth_path, encoded).map_err(|error| {
        format!(
            "写入 auth.json 失败: {}: {error}",
            display_path(auth_path)
        )
    })
}

fn resolve_compaction_snapshot(config: &PiTestConfig) -> PiCompactionSnapshot {
    let compaction = config
        .compat
        .get("openclaw")
        .and_then(|value| value.get("agents"))
        .and_then(|value| value.get("defaults"))
        .and_then(|value| value.get("compaction"))
        .and_then(Value::as_object);

    let mode = compaction
        .and_then(|value| value.get("mode"))
        .and_then(Value::as_str)
        .unwrap_or("safeguard")
        .trim()
        .to_string();
    let reserve_tokens = compaction
        .and_then(|value| value.get("reserveTokens"))
        .and_then(Value::as_u64)
        .unwrap_or(24_576);
    let keep_recent_tokens = compaction
        .and_then(|value| value.get("keepRecentTokens"))
        .and_then(Value::as_u64)
        .unwrap_or(16_000);
    let enabled = compaction
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or_else(|| !matches!(mode.trim().to_ascii_lowercase().as_str(), "off" | "disabled"));

    PiCompactionSnapshot {
        mode,
        enabled,
        reserve_tokens,
        keep_recent_tokens,
    }
}

fn apply_compaction_patch(compat: &mut Value, patch: PiCompactionPatch) {
    if !compat.is_object() {
        *compat = default_compat_config();
    }

    let root = compat
        .as_object_mut()
        .expect("compat must be an object after initialization");
    let openclaw = root
        .entry("openclaw".to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("openclaw compat block must be an object");
    let agents = openclaw
        .entry("agents".to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("agents compat block must be an object");
    let defaults = agents
        .entry("defaults".to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("defaults compat block must be an object");
    let compaction = defaults
        .entry("compaction".to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("compaction compat block must be an object");

    if let Some(mode) = normalize_optional(patch.mode.as_deref()) {
        compaction.insert("mode".to_string(), Value::String(mode.to_string()));
    }
    if let Some(enabled) = patch.enabled {
        compaction.insert("enabled".to_string(), Value::Bool(enabled));
    }
    if let Some(reserve_tokens) = patch.reserve_tokens {
        compaction.insert("reserveTokens".to_string(), Value::Number(reserve_tokens.into()));
    }
    if let Some(keep_recent_tokens) = patch.keep_recent_tokens {
        compaction.insert(
            "keepRecentTokens".to_string(),
            Value::Number(keep_recent_tokens.into()),
        );
    }
}

fn write_settings_json(settings_path: &Path, config: &PiTestConfig) -> Result<(), String> {
    if let Some(parent) = settings_path.parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "创建 settings.json 目录失败: {}: {error}",
                display_path(parent)
            )
        })?;
    }

    let compaction = resolve_compaction_snapshot(config);
    let encoded = serde_json::to_vec_pretty(&json!({
        "compaction": {
            "enabled": compaction.enabled,
            "reserveTokens": compaction.reserve_tokens,
            "keepRecentTokens": compaction.keep_recent_tokens
        }
    }))
    .map_err(|error| format!("序列化 settings.json 失败: {error}"))?;

    write(settings_path, encoded).map_err(|error| {
        format!(
            "写入 settings.json 失败: {}: {error}",
            display_path(settings_path)
        )
    })
}

fn looks_like_env_var_name(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|char| char.is_ascii_uppercase() || char.is_ascii_digit() || char == '_')
}

fn migrate_legacy_plaintext_provider_secrets(
    config: &mut PiTestConfig,
    auth_path: &Path,
    provider_catalog: &PiProviderCatalog,
) -> Result<(), String> {
    let mut migrations = Vec::<(String, String, String)>::new();
    let Some(openclaw_models) = config
        .compat
        .get_mut("openclaw")
        .and_then(Value::as_object_mut)
        .and_then(|openclaw| openclaw.get_mut("models"))
        .and_then(Value::as_object_mut)
    else {
        return Ok(());
    };

    let Some(providers) = openclaw_models
        .get_mut("providers")
        .and_then(Value::as_object_mut)
    else {
        return Ok(());
    };

    for (provider, value) in providers.iter_mut() {
        let Some(provider_config) = value.as_object_mut() else {
            continue;
        };

        let plaintext_api_key = provider_config
            .get("apiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|api_key| !api_key.is_empty() && !looks_like_env_var_name(api_key))
            .map(ToOwned::to_owned);

        let Some(plaintext_api_key) = plaintext_api_key else {
            continue;
        };

        let Some(env_name) = config
            .providers
            .iter()
            .find(|entry| entry.provider.eq_ignore_ascii_case(provider))
            .and_then(|entry| entry.api_key_env_name.clone())
            .or_else(|| default_api_key_env_name(provider).map(ToOwned::to_owned))
        else {
            continue;
        };
        provider_config.insert("apiKey".to_string(), Value::String(env_name.clone()));
        migrations.push((provider.to_string(), plaintext_api_key, env_name));
    }

    for (provider, plaintext_api_key, env_name) in migrations {
        update_auth_file(auth_path, &provider, &plaintext_api_key)?;

        if let Some(existing) = config
            .providers
            .iter_mut()
            .find(|entry| entry.provider.eq_ignore_ascii_case(&provider))
        {
            if existing.api_key_env_name.is_none() {
                existing.api_key_env_name = Some(env_name);
            }
        } else if let Some(provider_entry) = find_provider_catalog_entry(provider_catalog, &provider) {
            config.providers.push(WorkspaceProviderConfig {
                provider: provider.clone(),
                kind: provider_entry.kind.clone(),
                enabled: true,
                default_model: provider_entry.default_model.clone(),
                api_key_env_name: Some(env_name),
                base_url: None,
                headers: None,
            });
        }
    }

    Ok(())
}

fn ensure_auth_file(auth_path: &Path) -> Result<(), String> {
    if auth_path.exists() {
        return Ok(());
    }

    if let Some(parent) = auth_path.parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "创建 auth.json 目录失败: {}: {error}",
                display_path(parent)
            )
        })?;
    }

    write(auth_path, b"{}").map_err(|error| {
        format!(
            "写入 auth.json 失败: {}: {error}",
            display_path(auth_path)
        )
    })
}

fn update_auth_file(auth_path: &Path, provider: &str, api_key: &str) -> Result<(), String> {
    let mut auth_data = read_auth_map(auth_path)?;
    auth_data.insert(
        provider.to_string(),
        json!({
            "type": "api_key",
            "key": api_key
        }),
    );

    write_auth_map(auth_path, &auth_data)
}

fn remove_auth_provider(auth_path: &Path, provider: &str) -> Result<(), String> {
    let mut auth_data = read_auth_map(auth_path)?;
    auth_data.remove(provider);
    write_auth_map(auth_path, &auth_data)
}

fn write_models_json(
    models_path: &Path,
    config: &PiTestConfig,
    provider_catalog: &PiProviderCatalog,
) -> Result<(), String> {
    let mut providers = serde_json::Map::<String, Value>::new();

    for provider in &config.providers {
        if !provider.enabled {
            continue;
        }

        if provider.provider.eq_ignore_ascii_case("deepseek") {
            let api_key_env_name = provider
                .api_key_env_name
                .clone()
                .unwrap_or_else(|| "DEEPSEEK_API_KEY".to_string());
            providers.insert(
                "deepseek".to_string(),
                json!({
                    "baseUrl": "https://api.deepseek.com/v1",
                    "api": "openai-completions",
                    "apiKey": api_key_env_name,
                    "compat": {
                        "supportsDeveloperRole": false,
                        "supportsReasoningEffort": false
                    },
                    "models": provider_catalog
                        .custom_providers
                        .iter()
                        .find(|entry| entry.provider == "deepseek")
                        .map(|entry| {
                            entry.models.iter().map(|model| {
                                json!({
                                    "id": model.id,
                                    "name": model.name,
                                    "reasoning": model.reasoning,
                                    "input": if model.supports_images {
                                        vec!["text", "image"]
                                    } else {
                                        vec!["text"]
                                    },
                                    "cost": {
                                        "input": 0,
                                        "output": 0,
                                        "cacheRead": 0,
                                        "cacheWrite": 0
                                    },
                                    "contextWindow": model.context_window,
                                    "maxTokens": model.max_tokens
                                })
                            }).collect::<Vec<_>>()
                        })
                        .unwrap_or_default(),
                }),
            );
            continue;
        }

        if find_provider_catalog_entry(provider_catalog, &provider.provider).is_none() {
            continue;
        }

        let base_url = normalize_optional(provider.base_url.as_deref());
        let mut provider_config = serde_json::Map::<String, Value>::new();
        if let Some(base_url) = base_url {
            provider_config.insert("baseUrl".to_string(), Value::String(base_url.to_string()));

            if let Some(api_key_env_name) = normalize_optional(provider.api_key_env_name.as_deref()) {
                provider_config.insert(
                    "apiKey".to_string(),
                    Value::String(api_key_env_name.to_string()),
                );
            }

            if let Some(headers) = &provider.headers {
                if !headers.is_empty() {
                    provider_config.insert("headers".to_string(), json!(headers));
                }
            }
        }

        if !provider_config.is_empty() {
            providers.insert(provider.provider.clone(), Value::Object(provider_config));
        }
    }

    if let Some(parent) = models_path.parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "创建 models.json 目录失败: {}: {error}",
                display_path(parent)
            )
        })?;
    }

    let encoded = serde_json::to_vec_pretty(&json!({ "providers": providers }))
        .map_err(|error| format!("序列化 models.json 失败: {error}"))?;
    write(models_path, encoded).map_err(|error| {
        format!(
            "写入 models.json 失败: {}: {error}",
            display_path(models_path)
        )
    })
}

fn resolve_start_selection(
    config: &PiTestConfig,
    provider_catalog: &PiProviderCatalog,
    requested_provider: Option<&str>,
    requested_model: Option<&str>,
    requested_api_key_env_name: Option<&str>,
) -> Result<ResolvedWorkspaceSelection, String> {
    let provider = normalize_optional(requested_provider)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| config.defaults.provider.clone());
    let provider_entry = find_provider_catalog_entry(provider_catalog, &provider).ok_or_else(|| {
        format!("当前 provider `{provider}` 不在 Pi runtime 的可用 provider 目录中。")
    })?;
    let resolved_model = resolve_model_for_provider(
        provider_catalog,
        &config.providers,
        &provider,
        normalize_optional(requested_model),
    );
    let configured_env_name = config
        .providers
        .iter()
        .find(|entry| entry.provider.eq_ignore_ascii_case(&provider))
        .and_then(|entry| normalize_optional(entry.api_key_env_name.as_deref()));
    let api_key_env_name = resolve_api_key_env_name(
        normalize_optional(requested_api_key_env_name).or(configured_env_name),
        Some(&provider),
    )?;

    Ok(ResolvedWorkspaceSelection {
        provider: provider_entry.provider.clone(),
        model: resolved_model,
        api_key_env_name,
    })
}

fn current_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn iso_timestamp_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn session_file_path(workspace_path: &Path, session_id: &str) -> PathBuf {
    workspace_sessions_dir(workspace_path).join(format!("{session_id}.json"))
}

fn pi_session_file_path(workspace_path: &Path, session_id: &str) -> PathBuf {
    workspace_pi_sessions_dir(workspace_path).join(format!("{session_id}.jsonl"))
}

fn ensure_session_storage_dirs(workspace_path: &Path) -> Result<(), String> {
    create_dir_all(workspace_sessions_dir(workspace_path)).map_err(|error| {
        format!(
            "创建 session 目录失败: {}: {error}",
            display_path(&workspace_sessions_dir(workspace_path))
        )
    })?;
    create_dir_all(workspace_pi_sessions_dir(workspace_path)).map_err(|error| {
        format!(
            "创建 PI session 目录失败: {}: {error}",
            display_path(&workspace_pi_sessions_dir(workspace_path))
        )
    })?;
    create_dir_all(workspace_exports_dir(workspace_path)).map_err(|error| {
        format!(
            "创建导出目录失败: {}: {error}",
            display_path(&workspace_exports_dir(workspace_path))
        )
    })?;
    Ok(())
}

fn read_session_value(path: &Path) -> Result<Value, String> {
    let raw = read_to_string(path).map_err(|error| {
        format!(
            "读取 session 文件失败: {}: {error}",
            display_path(path)
        )
    })?;
    serde_json::from_str::<Value>(&raw).map_err(|error| {
        format!(
            "解析 session 文件失败: {}: {error}",
            display_path(path)
        )
    })
}

fn write_session_value(path: &Path, session: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent).map_err(|error| {
            format!(
                "创建 session 目录失败: {}: {error}",
                display_path(parent)
            )
        })?;
    }

    let encoded = serde_json::to_vec_pretty(session)
        .map_err(|error| format!("序列化 session 失败: {error}"))?;
    write(path, encoded).map_err(|error| {
        format!(
            "写入 session 文件失败: {}: {error}",
            display_path(path)
        )
    })
}

fn session_id_from_value(session: &Value) -> Result<String, String> {
    session
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "session 保存失败：缺少有效的 session.id".to_string())
}

fn value_string(object: &serde_json::Map<String, Value>, key: &str, fallback: &str) -> String {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| fallback.to_string())
}

fn value_u64(object: &serde_json::Map<String, Value>, key: &str) -> Option<u64> {
    object.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|next| (next >= 0).then_some(next as u64)))
    })
}

fn array_len(object: &serde_json::Map<String, Value>, key: &str) -> u64 {
    object
        .get(key)
        .and_then(Value::as_array)
        .map(|rows| rows.len() as u64)
        .unwrap_or(0)
}

fn session_summary_from_value(
    session: &Value,
    default_workspace_path: &Path,
) -> Option<PiSessionSummary> {
    let object = session.as_object()?;
    let usage = object.get("usage").and_then(Value::as_object);
    let diagnostics = object.get("diagnostics").and_then(Value::as_object);

    Some(PiSessionSummary {
        id: value_string(object, "id", ""),
        title: value_string(object, "title", "New Session"),
        created_at: value_string(object, "createdAt", ""),
        updated_at: value_string(object, "updatedAt", ""),
        workspace_path: value_string(object, "workspacePath", &display_path(default_workspace_path)),
        provider: value_string(object, "provider", ""),
        model: value_string(object, "model", ""),
        api_key_env_name: value_string(object, "apiKeyEnvName", ""),
        runtime_state: value_string(object, "runtimeState", "idle"),
        message_count: array_len(object, "messages"),
        event_count: array_len(object, "events"),
        total_tokens: usage.and_then(|usage| value_u64(usage, "totalTokens")),
        input_tokens: usage.and_then(|usage| value_u64(usage, "input")),
        output_tokens: usage.and_then(|usage| value_u64(usage, "output")),
        stderr_count: diagnostics
            .and_then(|diagnostics| value_u64(diagnostics, "stderrCount"))
            .unwrap_or(0),
        error_count: diagnostics
            .and_then(|diagnostics| value_u64(diagnostics, "errorCount"))
            .unwrap_or(0),
    })
}

fn list_sessions_for_workspace(workspace_path: &Path) -> Result<Vec<PiSessionSummary>, String> {
    ensure_session_storage_dirs(workspace_path)?;
    let sessions_dir = workspace_sessions_dir(workspace_path);
    let mut sessions = Vec::new();

    for entry in read_dir(&sessions_dir).map_err(|error| {
        format!(
            "读取 session 目录失败: {}: {error}",
            display_path(&sessions_dir)
        )
    })? {
        let entry = entry.map_err(|error| {
            format!(
                "读取 session 文件失败: {}: {error}",
                display_path(&sessions_dir)
            )
        })?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let session = read_session_value(&path)?;
        if let Some(summary) = session_summary_from_value(&session, workspace_path) {
            if !summary.id.is_empty() {
                sessions.push(summary);
            }
        }
    }

    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(sessions)
}

fn matches_log_filter(event: &Value, filter: &PiLogFilter) -> bool {
    let Some(object) = event.as_object() else {
        return false;
    };

    let session_id = value_string(object, "sessionId", "");
    let source = value_string(object, "source", "");
    let kind = value_string(object, "kind", "");
    let severity = value_string(object, "severity", "");
    let summary = value_string(object, "summary", "");
    let payload_text = object
        .get("payload")
        .map(Value::to_string)
        .unwrap_or_default()
        .to_lowercase();

    if let Some(filter_session) = normalize_optional(filter.session_id.as_deref()) {
        if session_id != filter_session {
            return false;
        }
    }

    if let Some(filter_source) = normalize_optional(filter.source.as_deref()) {
        if !source.eq_ignore_ascii_case(filter_source) {
            return false;
        }
    }

    if let Some(filter_kind) = normalize_optional(filter.kind.as_deref()) {
        if !kind.eq_ignore_ascii_case(filter_kind) {
            return false;
        }
    }

    if let Some(filter_severity) = normalize_optional(filter.severity.as_deref()) {
        if !severity.eq_ignore_ascii_case(filter_severity) {
            return false;
        }
    }

    if let Some(query) = normalize_optional(filter.query.as_deref()) {
        let query = query.to_lowercase();
        if !summary.to_lowercase().contains(&query)
            && !payload_text.contains(&query)
            && !kind.to_lowercase().contains(&query)
            && !source.to_lowercase().contains(&query)
        {
            return false;
        }
    }

    true
}

fn export_logs_for_filter(
    workspace_path: &Path,
    filter: &PiLogFilter,
) -> Result<PiLogExportResponse, String> {
    ensure_session_storage_dirs(workspace_path)?;
    let sessions = list_sessions_for_workspace(workspace_path)?;
    let export_dir = workspace_exports_dir(workspace_path);
    create_dir_all(&export_dir).map_err(|error| {
        format!(
            "创建日志导出目录失败: {}: {error}",
            display_path(&export_dir)
        )
    })?;

    let export_path = export_dir.join(format!("logs-{}.jsonl", current_unix_millis()));
    let mut file = File::create(&export_path).map_err(|error| {
        format!(
            "创建日志导出文件失败: {}: {error}",
            display_path(&export_path)
        )
    })?;
    let mut entry_count = 0_usize;

    for session in sessions {
        let path = session_file_path(workspace_path, &session.id);
        let session_value = read_session_value(&path)?;
        let Some(events) = session_value.get("events").and_then(Value::as_array) else {
            continue;
        };

        for event in events {
            if !matches_log_filter(event, filter) {
                continue;
            }

            let encoded = serde_json::to_string(event)
                .map_err(|error| format!("序列化日志导出条目失败: {error}"))?;
            writeln!(file, "{encoded}")
                .map_err(|error| format!("写入日志导出文件失败: {error}"))?;
            entry_count += 1;
        }
    }

    Ok(PiLogExportResponse {
        path: display_path(&export_path),
        entry_count,
    })
}

fn load_provider_catalog(runtime: &PiRuntimePaths) -> Result<PiProviderCatalog, String> {
    let builtin_providers = load_builtin_provider_catalog(runtime)?;
    Ok(PiProviderCatalog {
        builtin_providers,
        custom_providers: vec![deepseek_provider_catalog_entry()],
    })
}

fn load_builtin_provider_catalog(
    runtime: &PiRuntimePaths,
) -> Result<Vec<PiProviderCatalogEntry>, String> {
    let package_root = runtime
        .cli_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| {
            format!(
                "无法从 CLI 路径解析 pi-coding-agent 包根目录: {}",
                display_path(&runtime.cli_path)
            )
        })?;

    let env_map = json!({
        "anthropic": "ANTHROPIC_API_KEY",
        "cerebras": "CEREBRAS_API_KEY",
        "google": "GEMINI_API_KEY",
        "google-antigravity": "GEMINI_API_KEY",
        "google-gemini-cli": "GEMINI_API_KEY",
        "groq": "GROQ_API_KEY",
        "huggingface": "HUGGINGFACE_API_KEY",
        "kimi-coding": "KIMI_API_KEY",
        "minimax": "MINIMAX_API_KEY",
        "minimax-cn": "MINIMAX_API_KEY",
        "mistral": "MISTRAL_API_KEY",
        "openai": "OPENAI_API_KEY",
        "openai-codex": "OPENAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
        "xai": "XAI_API_KEY",
        "zai": "ZAI_API_KEY"
    });
    let script = r#"
const envMap = JSON.parse(process.argv[1]);
const { getProviders, getModels } = await import('@mariozechner/pi-ai');
const rows = getProviders()
  .filter((provider) => Boolean(envMap[provider]))
  .sort((left, right) => left.localeCompare(right))
  .map((provider) => {
    const models = getModels(provider)
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        reasoning: Boolean(model.reasoning),
        contextWindow: Number(model.contextWindow ?? 0),
        maxTokens: Number(model.maxTokens ?? 0),
        supportsImages: Array.isArray(model.input) && model.input.includes('image')
      }));
    return {
      provider,
      apiKeyEnvName: envMap[provider],
      defaultModel: models[0]?.id ?? '',
      models
    };
  });
console.log(JSON.stringify(rows));
"#;

    let output = Command::new(&runtime.node_path)
        .arg("--input-type=module")
        .arg("--eval")
        .arg(script)
        .arg(env_map.to_string())
        .current_dir(package_root)
        .output()
        .map_err(|error| {
            format!(
                "调用 Node 读取 provider 目录失败: {}: {error}",
                display_path(&runtime.node_path)
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Pi runtime provider 目录查询失败{}",
            if stderr.is_empty() {
                String::new()
            } else {
                format!(": {stderr}")
            }
        ));
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BuiltinProviderRow {
        provider: String,
        api_key_env_name: String,
        default_model: String,
        models: Vec<BuiltinModelRow>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BuiltinModelRow {
        id: String,
        name: String,
        reasoning: bool,
        context_window: u64,
        max_tokens: u64,
        supports_images: bool,
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("Pi provider 目录输出不是合法 UTF-8: {error}"))?;
    let rows = serde_json::from_str::<Vec<BuiltinProviderRow>>(&stdout).map_err(|error| {
        format!("解析 Pi provider 目录 JSON 失败: {error}")
    })?;

    Ok(rows
        .into_iter()
        .map(|row| PiProviderCatalogEntry {
            label: provider_display_name(&row.provider),
            kind: "pi-builtin".to_string(),
            provider: row.provider,
            api_key_env_name: row.api_key_env_name,
            default_model: row.default_model,
            models: row
                .models
                .into_iter()
                .map(|model| PiModelCatalogEntry {
                    id: model.id,
                    name: model.name,
                    reasoning: model.reasoning,
                    context_window: model.context_window,
                    max_tokens: model.max_tokens,
                    supports_images: model.supports_images,
                })
                .collect(),
        })
        .collect())
}

fn deepseek_provider_catalog_entry() -> PiProviderCatalogEntry {
    PiProviderCatalogEntry {
        provider: "deepseek".to_string(),
        label: "DeepSeek".to_string(),
        kind: "app-custom".to_string(),
        api_key_env_name: "DEEPSEEK_API_KEY".to_string(),
        default_model: "deepseek-chat".to_string(),
        models: vec![
            PiModelCatalogEntry {
                id: "deepseek-chat".to_string(),
                name: "DeepSeek Chat".to_string(),
                reasoning: false,
                context_window: 128000,
                max_tokens: 8192,
                supports_images: false,
            },
            PiModelCatalogEntry {
                id: "deepseek-reasoner".to_string(),
                name: "DeepSeek Reasoner".to_string(),
                reasoning: true,
                context_window: 128000,
                max_tokens: 8192,
                supports_images: false,
            },
        ],
    }
}

fn provider_display_name(provider: &str) -> String {
    match provider {
        "openai" => "OpenAI".to_string(),
        "openai-codex" => "OpenAI Codex".to_string(),
        "anthropic" => "Anthropic".to_string(),
        "google" => "Google".to_string(),
        "google-antigravity" => "Google Antigravity".to_string(),
        "google-gemini-cli" => "Google Gemini CLI".to_string(),
        "groq" => "Groq".to_string(),
        "xai" => "xAI".to_string(),
        "openrouter" => "OpenRouter".to_string(),
        "mistral" => "Mistral".to_string(),
        "cerebras" => "Cerebras".to_string(),
        "huggingface" => "Hugging Face".to_string(),
        "kimi-coding" => "Kimi Coding".to_string(),
        "minimax" => "MiniMax".to_string(),
        "minimax-cn" => "MiniMax CN".to_string(),
        "zai" => "ZAI".to_string(),
        "vercel-ai-gateway" => "Vercel AI Gateway".to_string(),
        other => other
            .split('-')
            .filter(|segment| !segment.is_empty())
            .map(|segment| {
                let mut chars = segment.chars();
                match chars.next() {
                    Some(first) => {
                        format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
                    }
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn default_workspace_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户的 HOME 目录".to_string())?;
    let path = home.join(".pitest");

    if !path.exists() {
        create_dir_all(&path).map_err(|error| format!("创建默认工作目录失败: {error}"))?;
    }

    Ok(path)
}

fn list_installed_skills() -> Result<Vec<InstalledSkill>, String> {
    let mut skills = Vec::new();

    for (source, root) in installed_skill_roots()? {
        if !root.exists() {
            continue;
        }

        collect_skills_from_dir(&root, &root, &source, &mut skills)?;
    }

    skills.sort_by(|left, right| {
        left.system
            .cmp(&right.system)
            .then_with(|| left.source.cmp(&right.source))
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
    });

    Ok(skills)
}

fn installed_skill_roots() -> Result<Vec<(String, PathBuf)>, String> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "无法确定当前用户的 HOME 目录".to_string())?;

    Ok(vec![
        ("codex".to_string(), home.join(".codex").join("skills")),
        ("agents".to_string(), home.join(".agents").join("skills")),
    ])
}

fn collect_skills_from_dir(
    root: &Path,
    directory: &Path,
    source: &str,
    skills: &mut Vec<InstalledSkill>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(directory).map_err(|error| {
        format!(
            "读取技能目录失败: {}: {error}",
            display_path(directory)
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "读取技能目录条目失败: {}: {error}",
                display_path(directory)
            )
        })?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let skill_file_path = path.join("SKILL.md");
        if skill_file_path.exists() {
            skills.push(build_installed_skill(root, &path, &skill_file_path, source)?);
            continue;
        }

        collect_skills_from_dir(root, &path, source, skills)?;
    }

    Ok(())
}

fn build_installed_skill(
    root: &Path,
    folder_path: &Path,
    skill_file_path: &Path,
    source: &str,
) -> Result<InstalledSkill, String> {
    let relative_folder = folder_path
        .strip_prefix(root)
        .map_err(|error| {
            format!(
                "解析技能相对路径失败: {} from {}: {error}",
                display_path(folder_path),
                display_path(root)
            )
        })?
        .to_path_buf();
    let relative_path = relative_folder.to_string_lossy().replace('\\', "/");
    let parsed = parse_skill_markdown(skill_file_path)?;
    let name = folder_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();
    let system = relative_path
        .split('/')
        .any(|segment| segment.eq_ignore_ascii_case(".system"));
    let scope = relative_path
        .split('/')
        .find(|segment| !segment.is_empty() && !segment.eq_ignore_ascii_case(".system"))
        .unwrap_or(&name)
        .to_string();

    Ok(InstalledSkill {
        id: format!("{source}::{relative_path}"),
        name,
        title: parsed.title,
        description: parsed.description,
        source: source.to_string(),
        scope,
        relative_path,
        folder_path: display_path(folder_path),
        skill_file_path: display_path(skill_file_path),
        system,
    })
}

fn parse_skill_markdown(skill_file_path: &Path) -> Result<ParsedSkillMarkdown, String> {
    let markdown = read_to_string(skill_file_path).map_err(|error| {
        format!(
            "读取技能说明失败: {}: {error}",
            display_path(skill_file_path)
        )
    })?;

    let mut title = skill_file_path
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .unwrap_or("Skill")
        .to_string();
    let mut description_lines = Vec::new();
    let mut heading_found = false;
    let mut in_code_block = false;

    for raw_line in markdown.lines() {
        let line = raw_line.trim();

        if line.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }

        if in_code_block || line.is_empty() {
            if heading_found && !description_lines.is_empty() {
                break;
            }
            continue;
        }

        if let Some(heading) = line.strip_prefix("# ") {
            title = heading.trim().to_string();
            heading_found = true;
            continue;
        }

        if line.starts_with('#') {
            continue;
        }

        if !heading_found {
            heading_found = true;
        }

        if line.starts_with("- ")
            || line.starts_with("* ")
            || line.starts_with("```")
            || line.starts_with("###")
            || line.starts_with("##")
        {
            if !description_lines.is_empty() {
                break;
            }
            continue;
        }

        description_lines.push(line.to_string());

        if description_lines.join(" ").chars().count() >= 180 {
            break;
        }
    }

    let description = if description_lines.is_empty() {
        "暂无技能说明。".to_string()
    } else {
        truncate_text(&description_lines.join(" "), 180)
    };

    Ok(ParsedSkillMarkdown { title, description })
}

struct ParsedSkillMarkdown {
    title: String,
    description: String,
}

fn expand_home_path(path: &str) -> Result<PathBuf, String> {
    if path == "~" {
        return std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "无法确定当前用户的 HOME 目录".to_string());
    }

    if let Some(suffix) = path.strip_prefix("~/") {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "无法确定当前用户的 HOME 目录".to_string())?;
        return Ok(home.join(suffix));
    }

    Ok(PathBuf::from(path))
}

fn project_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn pi_cli_path() -> PathBuf {
    project_root()
        .join("node_modules")
        .join("@mariozechner")
        .join("pi-coding-agent")
        .join("dist")
        .join("cli.js")
}

fn resolve_pi_runtime(app_handle: &AppHandle) -> Result<PiRuntimePaths, String> {
    if let Some(bundle_dir) = bundled_runtime_dir(app_handle) {
        let manifest_path = bundle_dir.join("manifest.json");
        if manifest_path.exists() {
            emit_runtime_event(
                app_handle,
                "正在检查运行时",
                "正在检查内置 PI 运行时缓存。",
                14,
            );
            return ensure_bundled_runtime_ready(app_handle, &bundle_dir);
        }
    }

    emit_runtime_event(
        app_handle,
        "正在使用开发运行时",
        "正在使用开发环境中的本地 PI 运行时。",
        90,
    );

    Ok(PiRuntimePaths {
        cli_path: pi_cli_path(),
        node_path: resolve_node_command()?,
    })
}

fn bundled_runtime_dir(app_handle: &AppHandle) -> Option<PathBuf> {
    app_handle
        .path()
        .resource_dir()
        .ok()
        .map(|resource_dir| resource_dir.join(BUNDLED_RUNTIME_DIR))
}

fn ensure_bundled_runtime_ready(
    app_handle: &AppHandle,
    bundle_dir: &Path,
) -> Result<PiRuntimePaths, String> {
    let manifest = read_bundled_runtime_manifest(bundle_dir)?;
    let cache_root = runtime_cache_root()?;
    let target_dir = cache_root.join(&manifest.runtime_id);
    let cli_path = target_dir.join(&manifest.cli_relative_path);
    let bundled_node_path = target_dir.join(&manifest.node_relative_path);
    let ready_path = target_dir.join(RUNTIME_READY_FILE_NAME);

    if ready_path.exists() && cli_path.exists() && bundled_node_path.exists() {
        emit_runtime_event(
            app_handle,
            "运行时已就绪",
            "已找到本地缓存的 PI 运行时，本次无需重新解压。",
            82,
        );
        return Ok(PiRuntimePaths {
            cli_path,
            node_path: resolve_node_from_env().unwrap_or(bundled_node_path),
        });
    }

    create_dir_all(&cache_root)
        .map_err(|error| format!("创建 PI runtime 缓存目录失败: {error}"))?;

    let staging_dir = cache_root.join(format!(".{}.staging", manifest.runtime_id));
    if staging_dir.exists() {
        remove_dir_all(&staging_dir).map_err(|error| {
            format!(
                "清理旧的 PI runtime staging 目录失败: {}: {error}",
                display_path(&staging_dir)
            )
        })?;
    }
    create_dir_all(&staging_dir)
        .map_err(|error| format!("创建 PI runtime staging 目录失败: {error}"))?;

    extract_tar_gz_with_progress(
        app_handle,
        &bundle_dir.join(&manifest.node_archive),
        &staging_dir,
        "正在解压 Node runtime",
        "首次启动正在解压内置 Node.js 运行时",
        34,
        46,
    )?;
    extract_tar_gz_with_progress(
        app_handle,
        &bundle_dir.join(&manifest.pi_archive),
        &staging_dir,
        "正在解压 PI runtime",
        "正在解压 PI CLI 和它的运行时依赖",
        46,
        78,
    )?;

    let staged_cli_path = staging_dir.join(&manifest.cli_relative_path);
    let staged_node_path = staging_dir.join(&manifest.node_relative_path);

    if !staged_cli_path.exists() {
        return Err(format!(
            "PI runtime 解压完成后缺少 CLI 文件: {}",
            display_path(&staged_cli_path)
        ));
    }

    if !staged_node_path.exists() {
        return Err(format!(
            "PI runtime 解压完成后缺少 Node 可执行文件: {}",
            display_path(&staged_node_path)
        ));
    }

    let ready_contents = format!(
        "piVersion={}\nnodeVersion={}\n",
        manifest.pi_version, manifest.node_version
    );
    emit_runtime_event(
        app_handle,
        "正在完成运行时准备",
        "正在写入缓存标记并切换到新的本地运行时。",
        86,
    );
    write(staging_dir.join(RUNTIME_READY_FILE_NAME), ready_contents)
        .map_err(|error| format!("写入 PI runtime ready 标记失败: {error}"))?;

    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("序列化 runtime manifest 失败: {error}"))?;
    write(staging_dir.join("manifest.json"), manifest_bytes)
        .map_err(|error| format!("写入 runtime manifest 失败: {error}"))?;

    if target_dir.exists() {
        remove_dir_all(&target_dir).map_err(|error| {
            format!(
                "替换旧的 PI runtime 缓存失败: {}: {error}",
                display_path(&target_dir)
            )
        })?;
    }

    rename(&staging_dir, &target_dir).map_err(|error| {
        format!(
            "激活 PI runtime 缓存失败: {} -> {}: {error}",
            display_path(&staging_dir),
            display_path(&target_dir)
        )
    })?;

    emit_runtime_event(
        app_handle,
        "运行时准备完成",
        "内置 PI 运行时准备完成，正在恢复应用状态。",
        92,
    );

    Ok(PiRuntimePaths {
        cli_path: target_dir.join(&manifest.cli_relative_path),
        node_path: resolve_node_from_env()
            .unwrap_or_else(|| target_dir.join(&manifest.node_relative_path)),
    })
}

fn read_bundled_runtime_manifest(bundle_dir: &Path) -> Result<BundledRuntimeManifest, String> {
    let manifest_path = bundle_dir.join("manifest.json");
    let manifest_text = read_to_string(&manifest_path).map_err(|error| {
        format!(
            "读取 bundled PI runtime manifest 失败: {}: {error}",
            display_path(&manifest_path)
        )
    })?;

    serde_json::from_str(&manifest_text).map_err(|error| {
        format!(
            "解析 bundled PI runtime manifest 失败: {}: {error}",
            display_path(&manifest_path)
        )
    })
}

fn runtime_cache_root() -> Result<PathBuf, String> {
    Ok(default_workspace_dir()?.join(RUNTIME_CACHE_DIR_NAME))
}

fn extract_tar_gz_with_progress(
    app_handle: &AppHandle,
    archive_path: &Path,
    destination_dir: &Path,
    title: &str,
    detail_prefix: &str,
    progress_start: u8,
    progress_end: u8,
) -> Result<(), String> {
    let total_size = tar_total_size(archive_path)?;
    let archive_file = File::open(archive_path).map_err(|error| {
        format!(
            "打开 bundled runtime 归档失败: {}: {error}",
            display_path(archive_path)
        )
    })?;

    let decoder = GzDecoder::new(archive_file);
    let mut archive = Archive::new(decoder);
    let progress_span = u64::from(progress_end.saturating_sub(progress_start));
    let mut unpacked_size = 0_u64;
    let mut last_progress = progress_start.saturating_sub(1);

    emit_runtime_event(
        app_handle,
        title,
        &format!("{detail_prefix} 0%"),
        progress_start,
    );

    let entries = archive.entries().map_err(|error| {
        format!(
            "读取 bundled runtime 归档目录失败: {}: {error}",
            display_path(archive_path)
        )
    })?;

    for entry in entries {
        let mut entry = entry.map_err(|error| {
            format!(
                "读取 bundled runtime 归档条目失败: {}: {error}",
                display_path(archive_path)
            )
        })?;

        let entry_size = entry.size();
        entry.unpack_in(destination_dir).map_err(|error| {
            format!(
                "解压 bundled runtime 条目失败: {} -> {}: {error}",
                display_path(archive_path),
                display_path(destination_dir)
            )
        })?;

        unpacked_size = unpacked_size.saturating_add(entry_size);

        let archive_progress = if total_size == 0 {
            100
        } else {
            ((unpacked_size.saturating_mul(100)) / total_size).min(100)
        };

        let mapped_progress = if total_size == 0 {
            progress_end
        } else {
            progress_start
                .saturating_add(
                    ((unpacked_size.saturating_mul(progress_span)) / total_size)
                        .try_into()
                        .unwrap_or(progress_span as u8),
                )
                .min(progress_end)
        };

        if mapped_progress > last_progress {
            emit_runtime_event(
                app_handle,
                title,
                &format!("{detail_prefix} {archive_progress}%"),
                mapped_progress,
            );
            last_progress = mapped_progress;
        }
    }

    emit_runtime_event(
        app_handle,
        title,
        &format!("{detail_prefix} 100%"),
        progress_end,
    );

    Ok(())
}

fn tar_total_size(archive_path: &Path) -> Result<u64, String> {
    let archive_file = File::open(archive_path).map_err(|error| {
        format!(
            "打开 bundled runtime 归档失败: {}: {error}",
            display_path(archive_path)
        )
    })?;

    let decoder = GzDecoder::new(archive_file);
    let mut archive = Archive::new(decoder);
    let mut total_size = 0_u64;
    let entries = archive.entries().map_err(|error| {
        format!(
            "读取 bundled runtime 归档目录失败: {}: {error}",
            display_path(archive_path)
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "读取 bundled runtime 归档条目失败: {}: {error}",
                display_path(archive_path)
            )
        })?;
        total_size = total_size.saturating_add(entry.size());
    }

    Ok(total_size)
}

fn resolve_node_command() -> Result<PathBuf, String> {
    if let Some(path) = resolve_node_from_env() {
        return Ok(path);
    }

    if let Some(path) = resolve_node_from_path() {
        return Ok(path);
    }

    for candidate in common_node_candidates() {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(
        "未找到可用的 Node.js 可执行文件。开发环境请安装 node，或设置环境变量 `PI_NODE_PATH` 指向 node 可执行文件。"
            .to_string(),
    )
}

fn resolve_node_from_env() -> Option<PathBuf> {
    for key in ["PI_NODE_PATH", "NODE_BINARY"] {
        if let Some(value) = env::var_os(key) {
            let path = PathBuf::from(value);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

fn resolve_node_from_path() -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;

    for directory in env::split_paths(&path_var) {
        let candidate = directory.join(node_binary_name());
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

fn common_node_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(format!("/opt/homebrew/bin/{}", node_binary_name())),
        PathBuf::from(format!("/usr/local/bin/{}", node_binary_name())),
        PathBuf::from(format!("/usr/bin/{}", node_binary_name())),
    ];

    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".volta").join("bin").join(node_binary_name()));
        candidates.push(
            home.join(".fnm")
                .join("current")
                .join("bin")
                .join(node_binary_name()),
        );

        let nvm_root = home.join(".nvm").join("versions").join("node");
        if let Ok(entries) = std::fs::read_dir(nvm_root) {
            let mut versions = entries
                .filter_map(Result::ok)
                .map(|entry| entry.path().join("bin").join(node_binary_name()))
                .collect::<Vec<_>>();
            versions.sort();
            versions.reverse();
            candidates.extend(versions);
        }
    }

    candidates
}

fn node_binary_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn normalize_optional(value: Option<&str>) -> Option<&str> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

fn display_path(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .display()
        .to_string()
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn response_error_message(payload: &Value) -> String {
    payload
        .get("error")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            payload
                .get("message")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .or_else(|| {
            payload
                .get("data")
                .and_then(|data| data.get("error"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| payload.to_string())
}

fn fail_all_pending_requests(
    pending: &Arc<Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>>,
    message: &str,
) {
    if let Ok(mut pending_requests) = pending.lock() {
        for (_, sender) in pending_requests.drain() {
            let _ = sender.send(Err(message.to_string()));
        }
    }
}

fn emit_pi_event(app_handle: &AppHandle, payload: Value) {
    let _ = app_handle.emit(PI_EVENT_NAME, payload);
}

fn emit_terminal_event(app_handle: &AppHandle, payload: Value) {
    let _ = app_handle.emit(TERMINAL_EVENT_NAME, payload);
}

fn emit_runtime_event(app_handle: &AppHandle, title: &str, detail: &str, progress: u8) {
    update_bootstrap_progress(app_handle, title, detail, progress);
    emit_pi_event(
        app_handle,
        json!({
            "kind": "runtime",
            "title": title,
            "detail": detail,
            "progress": progress,
        }),
    );
}

fn update_bootstrap_progress(app_handle: &AppHandle, title: &str, detail: &str, progress: u8) {
    app_handle
        .state::<AppBootstrapManager>()
        .update_booting(title, detail, progress);
}

fn set_bootstrap_error(app_handle: &AppHandle, message: &str) {
    app_handle.state::<AppBootstrapManager>().set_error(message);
}

fn wait_for_app_bootstrap(
    app_handle: &AppHandle,
    timeout: Duration,
) -> Result<PiBootstrapInfo, String> {
    let start = std::time::Instant::now();

    loop {
        let snapshot = app_handle.state::<AppBootstrapManager>().snapshot();

        match snapshot.phase.as_str() {
            "ready" => {
                return snapshot
                    .info
                    .ok_or_else(|| "应用启动状态已就绪，但缺少运行时信息。".to_string());
            }
            "error" => {
                return Err(snapshot
                    .error
                    .unwrap_or_else(|| snapshot.detail.to_string()));
            }
            _ => {
                if start.elapsed() >= timeout {
                    return Err("等待应用启动准备完成超时。".to_string());
                }

                std::thread::sleep(Duration::from_millis(60));
            }
        }
    }
}

fn reveal_main_window(app_handle: &AppHandle) -> Result<(), String> {
    let main_window = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "未找到主窗口 `main`。".to_string())?;

    main_window
        .show()
        .map_err(|error| format!("显示主窗口失败: {error}"))?;
    let _ = main_window.set_focus();

    if let Some(splashscreen) = app_handle.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }

    Ok(())
}

fn format_exit_error(code: Option<i32>, stderr: &str) -> String {
    match (code, stderr.trim().is_empty()) {
        (Some(code), false) => format!("PI 进程已退出，退出码 {code}：{stderr}"),
        (Some(code), true) => format!("PI 进程已退出，退出码 {code}"),
        (None, false) => format!("PI 进程已退出：{stderr}"),
        (None, true) => "PI 进程已退出".to_string(),
    }
}
