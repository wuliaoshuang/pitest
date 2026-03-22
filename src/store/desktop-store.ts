import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import {
  PiBootstrapInfo,
  PiRuntimeSnapshot,
  PiSessionState,
  PiUsageSummary,
} from "@/lib/pi";
import { AppearanceMode, ThemeAccentId } from "@/lib/theme";

export type ToolExecutionStatus = "pending" | "running" | "success" | "error";

export type MarkdownSegment = {
  type: "markdown_text";
  text: string;
};

export type ThinkingSegment = {
  type: "thinking";
  text: string;
  isStreaming: boolean;
};

export type ToolCallSegment = {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  args?: unknown;
  status: ToolExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
};

export type ToolResultSegment = {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  status: ToolExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
};

export type ChatSegment =
  | MarkdownSegment
  | ThinkingSegment
  | ToolCallSegment
  | ToolResultSegment;

export type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  createdAt: string;
  segments: ChatSegment[];
  meta?: string;
  tone?: "default" | "muted" | "error";
  provider?: string;
  model?: string;
  usage?: PiUsageSummary | null;
  stopReason?: string;
};

export type PiEventRecord = {
  id: string;
  sessionId: string;
  timestamp: string;
  source: string;
  kind: string;
  severity: "info" | "warning" | "error";
  summary: string;
  toolCallId?: string;
  payload?: Record<string, unknown> | null;
};

export type PiDiagnosticsState = {
  stderrCount: number;
  errorCount: number;
  lastError: string;
  lastEventAt: string;
};

export type ToolExecutionRecord = {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  status: ToolExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  partialResult?: unknown;
  result?: unknown;
  isError?: boolean;
};

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type RuntimeState = "idle" | "connecting" | "connected" | "streaming" | "stopped" | "error";

export type AppRouteState =
  | { kind: "new" }
  | { kind: "chat"; sessionId: string }
  | { kind: "activity" }
  | { kind: "skills" }
  | { kind: "settings" };

export type StoredUiState = {
  activeSessionId?: string;
  sidebarCollapsed?: boolean;
  appearanceMode?: AppearanceMode;
  themeAccent?: ThemeAccentId;
};

export type StoredSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UiMessage[];
  events: PiEventRecord[];
  workspacePath: string;
  provider: string;
  model: string;
  apiKeyEnvName: string;
  runtimeState: RuntimeState;
  usage: PiUsageSummary;
  diagnostics: PiDiagnosticsState;
  toolExecutions: Record<string, ToolExecutionRecord>;
};

export type SessionConfig = Pick<
  StoredSession,
  "workspacePath" | "provider" | "model" | "apiKeyEnvName"
>;

export type DesktopState = {
  bootstrapInfo: PiBootstrapInfo | null;
  runtimeSnapshot: PiRuntimeSnapshot | null;
  connectionStatus: ConnectionStatus;
  connectionError: string;
  sessionState: PiSessionState | null;
  workspacePath: string;
  provider: string;
  model: string;
  apiKeyEnvName: string;
  composer: string;
  sessions: StoredSession[];
  activeSessionId: string | null;
  liveSessionId: string | null;
  messages: UiMessage[];
  events: PiEventRecord[];
  usage: PiUsageSummary;
  diagnostics: PiDiagnosticsState;
  toolExecutions: Record<string, ToolExecutionRecord>;
  routeState: AppRouteState;
  sidebarCollapsed: boolean;
  appearanceMode: AppearanceMode;
  themeAccent: ThemeAccentId;
};

const UI_STORAGE_KEY = "pi-desktop-ui-v2";

export function createEmptyUsageSummary(): PiUsageSummary {
  return {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    totalTokens: null,
    costTotal: null,
    contextTokens: null,
    turnCount: 0,
  };
}

export function createEmptyDiagnosticsState(): PiDiagnosticsState {
  return {
    stderrCount: 0,
    errorCount: 0,
    lastError: "",
    lastEventAt: "",
  };
}

const initialDesktopState = buildPreloadedDesktopState();

const desktopSlice = createSlice({
  name: "desktop",
  initialState: initialDesktopState,
  reducers: {
    setBootstrapInfo(state, action: PayloadAction<PiBootstrapInfo | null>) {
      state.bootstrapInfo = action.payload;
    },
    setRuntimeSnapshot(state, action: PayloadAction<PiRuntimeSnapshot | null>) {
      state.runtimeSnapshot = action.payload;
    },
    setConnectionStatus(state, action: PayloadAction<ConnectionStatus>) {
      state.connectionStatus = action.payload;
    },
    setConnectionError(state, action: PayloadAction<string>) {
      state.connectionError = action.payload;
    },
    setSessionState(state, action: PayloadAction<PiSessionState | null>) {
      state.sessionState = action.payload;
    },
    setWorkspacePath(state, action: PayloadAction<string>) {
      state.workspacePath = action.payload;
    },
    setProvider(state, action: PayloadAction<string>) {
      state.provider = action.payload;
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload;
    },
    setApiKeyEnvName(state, action: PayloadAction<string>) {
      state.apiKeyEnvName = action.payload;
    },
    setComposer(state, action: PayloadAction<string>) {
      state.composer = action.payload;
    },
    setSessions(state, action: PayloadAction<StoredSession[]>) {
      state.sessions = action.payload;
    },
    setActiveSessionId(state, action: PayloadAction<string | null>) {
      state.activeSessionId = action.payload;
    },
    setLiveSessionId(state, action: PayloadAction<string | null>) {
      state.liveSessionId = action.payload;
    },
    setMessages(state, action: PayloadAction<UiMessage[]>) {
      state.messages = action.payload;
    },
    setEvents(state, action: PayloadAction<PiEventRecord[]>) {
      state.events = action.payload;
    },
    setUsage(state, action: PayloadAction<PiUsageSummary>) {
      state.usage = action.payload;
    },
    setDiagnostics(state, action: PayloadAction<PiDiagnosticsState>) {
      state.diagnostics = action.payload;
    },
    setToolExecutions(state, action: PayloadAction<Record<string, ToolExecutionRecord>>) {
      state.toolExecutions = action.payload;
    },
    setRouteState(state, action: PayloadAction<AppRouteState>) {
      state.routeState = action.payload;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    setAppearanceMode(state, action: PayloadAction<AppearanceMode>) {
      state.appearanceMode = action.payload;
    },
    setThemeAccent(state, action: PayloadAction<ThemeAccentId>) {
      state.themeAccent = action.payload;
    },
  },
});

const logger =
  import.meta.env.DEV
    ? createLogger({
        collapsed: true,
        duration: true,
      })
    : undefined;

export const store = configureStore({
  reducer: {
    desktop: desktopSlice.reducer,
  },
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    logger ? getDefaultMiddleware().concat(logger) : getDefaultMiddleware(),
});

store.subscribe(() => {
  if (typeof window === "undefined") {
    return;
  }

  const desktop = store.getState().desktop;
  writeStoredUiState({
    activeSessionId: desktop.activeSessionId ?? undefined,
    sidebarCollapsed: desktop.sidebarCollapsed,
    appearanceMode: desktop.appearanceMode,
    themeAccent: desktop.themeAccent,
  });
});

export const desktopActions = desktopSlice.actions;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

function buildPreloadedDesktopState(): DesktopState {
  const uiState = readStoredUiState();

  return {
    bootstrapInfo: null,
    runtimeSnapshot: null,
    connectionStatus: "idle",
    connectionError: "",
    sessionState: null,
    workspacePath: "",
    provider: "",
    model: "",
    apiKeyEnvName: "",
    composer: "",
    sessions: [],
    activeSessionId: uiState.activeSessionId ?? null,
    liveSessionId: null,
    messages: [],
    events: [],
    usage: createEmptyUsageSummary(),
    diagnostics: createEmptyDiagnosticsState(),
    toolExecutions: {},
    routeState: { kind: "new" },
    sidebarCollapsed: Boolean(uiState.sidebarCollapsed),
    appearanceMode: uiState.appearanceMode ?? "light",
    themeAccent: uiState.themeAccent ?? "blue",
  };
}

function readStoredUiState(): StoredUiState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as StoredUiState;
    return {
      activeSessionId:
        typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : undefined,
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      appearanceMode:
        parsed.appearanceMode === "light" ||
        parsed.appearanceMode === "dark" ||
        parsed.appearanceMode === "system"
          ? parsed.appearanceMode
          : undefined,
      themeAccent:
        parsed.themeAccent === "blue" ||
        parsed.themeAccent === "teal" ||
        parsed.themeAccent === "indigo" ||
        parsed.themeAccent === "emerald" ||
        parsed.themeAccent === "amber" ||
        parsed.themeAccent === "rose"
          ? parsed.themeAccent
          : undefined,
    };
  } catch {
    return {};
  }
}

function writeStoredUiState(state: StoredUiState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(state));
}

export function sortSessions(sessions: StoredSession[]) {
  return [...sessions].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function findSessionById(
  sessions: StoredSession[],
  sessionId: string | null | undefined,
) {
  if (!sessionId) {
    return null;
  }

  return sessions.find((session) => session.id === sessionId) ?? null;
}

export function isUiMessage(value: unknown): value is UiMessage {
  const message = asRecord(value);
  if (!message) {
    return false;
  }

  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.createdAt === "string" &&
    Array.isArray(message.segments)
  );
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}
