import { invoke } from "@tauri-apps/api/core";

export type PiModelInfo = {
  provider: string;
  id: string;
};

export type PiUsageSummary = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  totalTokens: number | null;
  costTotal: number | null;
  contextTokens: number | null;
  turnCount: number;
};

export type PiSessionState = {
  model?: PiModelInfo;
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
};

export type PiBootstrapInfo = {
  defaultWorkspacePath: string;
  cliPath: string;
  nodeCommand: string;
  configPath: string;
  agentRuntimeDir: string;
  authPath: string;
  modelsPath: string;
  settingsPath: string;
  defaultProvider: string;
  defaultModel: string;
  defaultApiKeyEnvName: string;
  configuredProviders: WorkspaceProviderConfig[];
  onboarding: PiWorkspaceOnboardingInfo;
};

export type PiWorkspaceOnboardingInfo = {
  required: boolean;
  assistantIdentityKnown: boolean;
  userIdentityKnown: boolean;
  assistantName?: string | null;
  userName?: string | null;
  bootstrapSeededAt?: string | null;
  suggestedStarterPrompt?: string | null;
};

export type WorkspaceProviderConfig = {
  provider: string;
  kind: "pi-builtin" | "app-custom" | string;
  enabled: boolean;
  defaultModel: string;
  apiKeyEnvName?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
};

export type WorkspaceProviderConfigSnapshot = WorkspaceProviderConfig & {
  hasStoredCredential: boolean;
};

export type PiCompactionSnapshot = {
  mode: string;
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
};

export type PiConfigSnapshot = {
  workspacePath: string;
  configPath: string;
  authPath: string;
  modelsPath: string;
  settingsPath: string;
  defaults: {
    provider: string;
    model: string;
  };
  providers: WorkspaceProviderConfigSnapshot[];
  compaction: PiCompactionSnapshot;
};

export type PiModelCatalogEntry = {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  supportsImages: boolean;
};

export type PiProviderCatalogEntry = {
  provider: string;
  label: string;
  kind: "pi-builtin" | "app-custom" | string;
  apiKeyEnvName: string;
  defaultModel: string;
  models: PiModelCatalogEntry[];
};

export type PiProviderCatalog = {
  builtinProviders: PiProviderCatalogEntry[];
  customProviders: PiProviderCatalogEntry[];
};

export type PiSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspacePath: string;
  provider: string;
  model: string;
  apiKeyEnvName: string;
  runtimeState: string;
  messageCount: number;
  eventCount: number;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  stderrCount: number;
  errorCount: number;
};

export type PiRuntimeSnapshot = {
  connectionStatus: string;
  workspacePath: string;
  provider: string;
  model: string;
  apiKeyEnvName: string;
  configPath: string;
  agentRuntimeDir: string;
  authPath: string;
  modelsPath: string;
  startedAt: number | null;
  isStreaming: boolean;
  sessionId: string | null;
  sessionName: string | null;
  messageCount: number | null;
  pendingMessageCount: number | null;
};

export type PiLogFilter = {
  sessionId?: string;
  source?: string;
  kind?: string;
  severity?: string;
  query?: string;
};

export type PiLogExportResult = {
  path: string;
  entryCount: number;
};

export type TerminalSnapshot = {
  cwd: string;
  running: boolean;
  reused: boolean;
  shell: string;
  instanceId: number;
};

export type TerminalEvent =
  | {
      kind: "data";
      instanceId: number;
      data: string;
    }
  | {
      kind: "exit" | "error";
      instanceId: number;
      message: string;
    };

export type TerminalResizeInput = {
  cols: number;
  rows: number;
};

export type WindowChromeMetrics = {
  controlGroupLeft: number;
  buttonCenterY: number;
};

export type InstalledSkill = {
  id: string;
  name: string;
  title: string;
  description: string;
  source: string;
  scope: string;
  relativePath: string;
  folderPath: string;
  skillFilePath: string;
  system: boolean;
};

export type AppBootstrapSnapshot = {
  phase: "booting" | "ready" | "error";
  title: string;
  detail: string;
  progress: number;
  info?: PiBootstrapInfo;
  error?: string;
};

export type PiStartInput = {
  workspacePath?: string;
  provider?: string;
  model?: string;
  apiKeyEnvName?: string;
  sessionId?: string;
  sessionTitle?: string;
};

export type PiStartResult = {
  state: PiSessionState;
  workspacePath: string;
  cliPath: string;
  provider: string;
  model: string;
  apiKeyEnvName: string;
};

export type PiConfigSaveInput = {
  workspacePath?: string;
  defaults?: {
    provider?: string;
    model?: string;
  };
  providerPatch?: {
    provider: string;
    enabled?: boolean;
    defaultModel?: string;
    apiKeyEnvName?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
  };
  credentialPatch?: {
    provider: string;
    apiKey?: string | null;
  };
  compactionPatch?: {
    mode?: string;
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
  };
};

export type PiPromptInput = {
  message: string;
  streamingBehavior?: "steer" | "followUp";
};

export type PiEventEnvelope =
  | {
      kind: "event";
      payload: Record<string, unknown>;
    }
  | {
      kind: "runtime";
      title: string;
      detail: string;
      progress: number;
    }
  | {
      kind: "stderr";
      line: string;
    }
  | {
      kind: "status";
      status: "connected" | "stopped";
    }
  | {
      kind: "error";
      message: string;
      raw?: string;
    };

export const providerEnvDefaults: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  "google-gemini-cli": "GEMINI_API_KEY",
  "google-antigravity": "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_API_KEY",
  zai: "ZAI_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
};

export function inferApiKeyEnv(provider: string) {
  return providerEnvDefaults[provider.trim().toLowerCase()] ?? "";
}

export function bootstrapPi() {
  return invoke<PiBootstrapInfo>("pi_bootstrap");
}

export function getAppBootstrapState() {
  return invoke<AppBootstrapSnapshot>("app_bootstrap_state");
}

export function restartAppBootstrap() {
  return invoke<void>("app_restart_bootstrap");
}

export function signalAppFrontendReady() {
  return invoke<void>("app_frontend_ready");
}

export function listInstalledSkills() {
  return invoke<InstalledSkill[]>("app_list_skills");
}

export function getWindowChromeMetrics() {
  return invoke<WindowChromeMetrics | null>("app_window_chrome_metrics");
}

export function getPiProviderCatalog() {
  return invoke<PiProviderCatalog>("pi_provider_catalog");
}

export function getPiConfigSnapshot(workspacePath?: string) {
  return invoke<PiConfigSnapshot>("pi_config_snapshot", {
    request: {
      workspacePath,
    },
  });
}

export function savePiConfig(input: PiConfigSaveInput) {
  return invoke<PiConfigSnapshot>("pi_config_save", {
    request: {
      workspacePath: input.workspacePath,
      defaults: input.defaults,
      providerPatch: input.providerPatch,
      credentialPatch: input.credentialPatch,
      compactionPatch: input.compactionPatch,
    },
  });
}

export function startPi(input: PiStartInput) {
  return invoke<PiStartResult>("pi_start", {
    request: {
      workspacePath: input.workspacePath,
      provider: input.provider,
      model: input.model,
      apiKeyEnvName: input.apiKeyEnvName,
      sessionId: input.sessionId,
      sessionTitle: input.sessionTitle,
    },
  });
}

export function stopPi() {
  return invoke<void>("pi_stop");
}

export function promptPi(input: PiPromptInput) {
  return invoke<void>("pi_prompt", {
    request: {
      message: input.message,
      streamingBehavior: input.streamingBehavior,
    },
  });
}

export function abortPi() {
  return invoke<void>("pi_abort");
}

export function getPiState() {
  return invoke<PiSessionState>("pi_get_state");
}

export function getPiRuntimeSnapshot() {
  return invoke<PiRuntimeSnapshot>("pi_runtime_snapshot");
}

export function listPiSessions(workspacePath?: string) {
  return invoke<PiSessionSummary[]>("pi_sessions_list", {
    request: {
      workspacePath,
    },
  });
}

export function loadPiSession(workspacePath: string | undefined, sessionId: string) {
  return invoke<Record<string, unknown>>("pi_session_load", {
    request: {
      workspacePath,
      sessionId,
    },
  });
}

export function savePiSession(
  workspacePath: string | undefined,
  session: Record<string, unknown>,
) {
  return invoke<void>("pi_session_save", {
    request: {
      workspacePath,
      session,
    },
  });
}

export function renamePiSession(
  workspacePath: string | undefined,
  sessionId: string,
  title: string,
) {
  return invoke<void>("pi_session_rename", {
    request: {
      workspacePath,
      sessionId,
      title,
    },
  });
}

export function deletePiSession(workspacePath: string | undefined, sessionId: string) {
  return invoke<void>("pi_session_delete", {
    request: {
      workspacePath,
      sessionId,
    },
  });
}

export function clearPiSessionLogs(workspacePath: string | undefined, sessionId: string) {
  return invoke<void>("pi_session_clear_logs", {
    request: {
      workspacePath,
      sessionId,
    },
  });
}

export function exportPiSessionLogs(
  workspacePath: string | undefined,
  filter: PiLogFilter = {},
) {
  return invoke<PiLogExportResult>("pi_session_export_logs", {
    request: {
      workspacePath,
      filter,
    },
  });
}

export function openEmbeddedTerminal(workspacePath?: string) {
  return invoke<TerminalSnapshot>("terminal_open", {
    request: {
      workspacePath,
    },
  });
}

export function sendEmbeddedTerminalInput(input: string) {
  return invoke<void>("terminal_input", {
    request: {
      input,
    },
  });
}

export function resizeEmbeddedTerminal(input: TerminalResizeInput) {
  return invoke<void>("terminal_resize", {
    request: input,
  });
}
