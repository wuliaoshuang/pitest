import {
  ComponentType,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  startTransition,
  UIEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Antigravity,
  Anthropic,
  Aws,
  AzureAI,
  Baidu,
  Bedrock,
  Cerebras,
  ChatGLM,
  Claude,
  Codex,
  DeepSeek,
  Gemini,
  GithubCopilot,
  Google,
  Grok,
  Groq,
  HuggingFace,
  Huawei,
  Kimi,
  Minimax,
  Mistral,
  Moonshot,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
  SiliconCloud,
  Tencent,
  Vercel,
  VertexAI,
  Volcengine,
  XAI,
  ZAI,
  Zhipu,
} from "@lobehub/icons";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  KeyRound,
  LoaderCircle,
  LucideIcon,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  SquareTerminal,
  SquarePen,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmbeddedTerminal } from "@/components/embedded-terminal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type PanelImperativeHandle,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AppTerminalTheme,
  AppearanceMode,
  applyAppTheme,
  getAppTerminalTheme,
  resolveAppearanceMode,
  resolveSystemDarkPreference,
  themeAccentOptions,
  ThemeAccentId,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  abortPi,
  bootstrapPi,
  clearPiSessionLogs,
  deletePiSession,
  exportPiSessionLogs,
  getPiConfigSnapshot,
  getPiProviderCatalog,
  getPiRuntimeSnapshot,
  getPiState,
  getWindowChromeMetrics,
  inferApiKeyEnv,
  InstalledSkill,
  listInstalledSkills,
  listPiSessions,
  loadPiSession,
  PiLogFilter,
  PiBootstrapInfo,
  PiConfigSnapshot,
  PiEventEnvelope,
  PiProviderCatalog,
  PiProviderCatalogEntry,
  PiRuntimeSnapshot,
  PiSessionState,
  PiUsageSummary,
  savePiConfig,
  signalAppFrontendReady,
  type WindowChromeMetrics,
  promptPi,
  renamePiSession,
  savePiSession,
  startPi,
  stopPi,
} from "@/lib/pi";
import {
  createEmptyDiagnosticsState,
  createEmptyUsageSummary,
  desktopActions,
  findSessionById,
  store,
  type AppRouteState,
  type ConnectionStatus,
  type PiDiagnosticsState,
  type PiEventRecord,
  type SessionConfig,
  type StoredSession,
  type ToolExecutionRecord,
  type UiMessage,
  type ChatSegment,
  type RuntimeState,
  sortSessions,
} from "@/store/desktop-store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type SidebarRoute = {
  key: "new" | "activity" | "skills" | "settings";
  label: string;
  icon: LucideIcon;
};

type ComposerAttachment = {
  path: string;
  label: string;
};

type ProviderDraft = {
  provider: string;
  kind: string;
  label: string;
  enabled: boolean;
  defaultModel: string;
  apiKeyEnvName: string;
  baseUrl: string;
  headers: Record<string, string>;
  hasStoredCredential: boolean;
  apiKeyDraft: string;
  dirty: boolean;
};

type AppToast = {
  id: string;
  tone: "info" | "success" | "error";
  title: string;
  description?: string;
};

const sidebarRoutes: SidebarRoute[] = [
  {
    key: "new",
    label: "New",
    icon: SquarePen,
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
  },
  {
    key: "skills",
    label: "Skills",
    icon: Sparkles,
  },
];

type LobeHubIconPack = {
  Avatar?: ComponentType<{ className?: string; size: number }>;
};

const providerIconAliasMap: Record<string, string> = {
  "amazon-bedrock": "bedrock",
  "anthropic-claude": "anthropic",
  "azure-openai": "azureai",
  claude: "anthropic",
  codex: "openai",
  copilot: "githubcopilot",
  "cerebras-ai": "cerebras",
  "github-copilot": "githubcopilot",
  "google-antigravity": "antigravity",
  "google-gemini-cli": "gemini",
  "google-vertex": "vertexai",
  glm: "chatglm",
  hf: "huggingface",
  "hugging-face": "huggingface",
  "minimax-cn": "minimax",
  "kimi-coding": "kimi",
  "moonshot-ai": "moonshot",
  "openai-codex": "openai",
  "silicon-flow": "siliconcloud",
  "vercel-ai": "vercel",
  "vertex-ai": "vertexai",
  v0: "vercel",
  zhipuai: "zhipu",
};

const lobeProviderIconRegistry = new Map<string, LobeHubIconPack>([
  ["antigravity", Antigravity],
  ["anthropic", Anthropic],
  ["aws", Aws],
  ["azureai", AzureAI],
  ["baidu", Baidu],
  ["bedrock", Bedrock],
  ["cerebras", Cerebras],
  ["chatglm", ChatGLM],
  ["claude", Claude],
  ["codex", Codex],
  ["deepseek", DeepSeek],
  ["gemini", Gemini],
  ["githubcopilot", GithubCopilot],
  ["google", Google],
  ["grok", Grok],
  ["groq", Groq],
  ["huggingface", HuggingFace],
  ["huawei", Huawei],
  ["kimi", Kimi],
  ["minimax", Minimax],
  ["mistral", Mistral],
  ["moonshot", Moonshot],
  ["ollama", Ollama],
  ["openai", OpenAI],
  ["openrouter", OpenRouter],
  ["qwen", Qwen],
  ["siliconcloud", SiliconCloud],
  ["tencent", Tencent],
  ["vercel", Vercel],
  ["vertexai", VertexAI],
  ["volcengine", Volcengine],
  ["xai", XAI],
  ["zai", ZAI],
  ["zhipu", Zhipu],
]);

const bottomSidebarRoute: SidebarRoute = {
  key: "settings",
  label: "Settings",
  icon: Settings2,
};

const starterPrompts = [
  "扫描当前仓库，告诉我应用入口、主窗口和 splash 的启动路径。",
  "帮我检查这个项目里与 PI RPC 相关的 Rust 和前端调用链。",
  "看看当前工作区有哪些未完成的 UI 改动，并给我一个优化清单。",
];

const MAX_STORED_SESSIONS = 20;
const CHROME_TOOLBAR_BUTTON_SIZE = 28;
const CHROME_TOOLBAR_BUTTON_GAP = 6;
const CHROME_TOOLBAR_GROUP_WIDTH =
  (CHROME_TOOLBAR_BUTTON_SIZE * 3) + (CHROME_TOOLBAR_BUTTON_GAP * 2);
const COLLAPSED_SIDEBAR_WIDTH = 76;
const MAX_SIDEBAR_SIZE = "70%";
const MIN_MAIN_PANEL_SIZE = "30%";
const ACTIVITY_EVENT_PAGE_SIZE = 10;
const DEFAULT_SIDEBAR_LAYOUT = {
  "pitest-sidebar-panel": 19,
  "pitest-main-panel": 81,
};
const SIDEBAR_LAYOUT_STORAGE_KEY = "pitest.layout.sidebar";
const DEFAULT_CHAT_TERMINAL_LAYOUT = {
  "pitest-chat-main-panel": 66,
  "pitest-chat-terminal-panel": 34,
};
const CHAT_TERMINAL_LAYOUT_STORAGE_KEY = "pitest.layout.chat-terminal";
const TERMINAL_VISIBLE_STORAGE_KEY = "pitest.ui.terminal-visible";

const fieldClassName =
  "apple-input h-10 w-full rounded-[0.9rem] px-3 text-[13px] tracking-[-0.01em]";

const textareaClassName =
  "min-h-[68px] max-h-[136px] w-full resize-none border-0 bg-transparent px-4 pb-1.5 pt-3 text-[13px] leading-5.5 tracking-[-0.02em] text-slate-800 outline-none placeholder:text-slate-300 dark:text-slate-100 dark:placeholder:text-slate-500";

const primaryButtonClassName =
  "theme-primary-button inline-flex h-9 items-center justify-center gap-2 rounded-full px-3.5 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClassName =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-white/78 bg-white/64 px-3.5 text-[12px] font-semibold text-slate-700 shadow-[0_8px_20px_rgba(31,41,55,0.08)] backdrop-blur-xl transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/12 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12";

const chromeButtonClassName =
  "theme-chrome-button inline-flex size-7 items-center justify-center rounded-[0.8rem] text-slate-500 backdrop-blur-xl transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100";

const composerChipButtonClassName =
  "inline-flex h-[30px] items-center gap-1 rounded-full px-2 text-[12px] font-medium text-slate-500 transition hover:bg-slate-100/80 hover:text-slate-800 disabled:cursor-default disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100";

function readStoredPanelLayout(
  storageKey: string,
  fallbackLayout: Record<string, number>,
) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return fallbackLayout;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nextLayout = { ...fallbackLayout };
    Object.keys(fallbackLayout).forEach((panelId) => {
      const value = parsed?.[panelId];
      if (typeof value === "number" && Number.isFinite(value)) {
        nextLayout[panelId] = value;
      }
    });
    return nextLayout;
  } catch {
    return fallbackLayout;
  }
}

function writeStoredPanelLayout(storageKey: string, layout: Record<string, number>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Ignore localStorage failures and keep the current layout in memory.
  }
}

function readStoredBoolean(storageKey: string, fallbackValue = false) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    return fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeStoredBoolean(storageKey: string, value: boolean) {
  try {
    window.localStorage.setItem(storageKey, value ? "true" : "false");
  } catch {
    // Ignore localStorage failures and keep the current state in memory.
  }
}

const scrollIndicatorTimeouts = new WeakMap<HTMLElement, number>();

function activateAutoScrollbar(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.dataset.scrolling = "true";
  const previousTimeout = scrollIndicatorTimeouts.get(target);
  if (previousTimeout) {
    window.clearTimeout(previousTimeout);
  }

  const timeoutId = window.setTimeout(() => {
    if (target.dataset.scrolling === "true") {
      delete target.dataset.scrolling;
    }
    scrollIndicatorTimeouts.delete(target);
  }, 720);

  scrollIndicatorTimeouts.set(target, timeoutId);
}

function App() {
  const dispatch = useAppDispatch();
  const desktop = useAppSelector((state) => state.desktop);
  const {
    bootstrapInfo,
    runtimeSnapshot,
    connectionStatus,
    connectionError,
    sessionState,
    sessions,
    activeSessionId,
    liveSessionId,
    sidebarCollapsed,
    workspacePath,
    provider,
    model,
    apiKeyEnvName,
    composer,
    messages,
    events,
    usage,
    diagnostics,
    toolExecutions,
    routeState,
    appearanceMode,
    themeAccent,
  } = desktop;

  const messageCounterRef = useRef(0);
  const eventCounterRef = useRef(0);
  const activeAssistantIdRef = useRef<string | null>(null);
  const onboardingPromptedSessionIdsRef = useRef<Set<string>>(new Set());
  const startupConnectAttemptRef = useRef(false);
  const connectedConfigRef = useRef("");
  const desktopRef = useRef(desktop);
  const frontendReadySignaledRef = useRef(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionSaveTimeoutRef = useRef<number | null>(null);
  const autoFollowEnabledRef = useRef(true);
  const userPausedScrollRef = useRef(false);
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [skillsActionError, setSkillsActionError] = useState("");
  const [skillsQuery, setSkillsQuery] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [windowChromeMetrics, setWindowChromeMetrics] =
    useState<WindowChromeMetrics | null>(null);
  const [providerCatalog, setProviderCatalog] = useState<PiProviderCatalog | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<PiConfigSnapshot | null>(null);
  const [providerCatalogError, setProviderCatalogError] = useState("");
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [settingsProviderId, setSettingsProviderId] = useState("");
  const [providerSaveBusy, setProviderSaveBusy] = useState(false);
  const [providerSaveMessage, setProviderSaveMessage] = useState("");
  const [providerSaveError, setProviderSaveError] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [feedIsNearBottom, setFeedIsNearBottom] = useState(true);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const [sessionsHydrated, setSessionsHydrated] = useState(false);
  const [initialUiReady, setInitialUiReady] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(() =>
    readStoredBoolean(TERMINAL_VISIBLE_STORAGE_KEY, false),
  );
  const [pendingDeleteSession, setPendingDeleteSession] = useState<StoredSession | null>(null);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [sidebarLayout, setSidebarLayout] = useState<Record<string, number>>(() =>
    readStoredPanelLayout(SIDEBAR_LAYOUT_STORAGE_KEY, DEFAULT_SIDEBAR_LAYOUT),
  );
  const [chatTerminalLayout, setChatTerminalLayout] = useState<Record<string, number>>(() =>
    readStoredPanelLayout(CHAT_TERMINAL_LAYOUT_STORAGE_KEY, DEFAULT_CHAT_TERMINAL_LAYOUT),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    resolveSystemDarkPreference(),
  );

  const providerOptions = flattenProviderCatalog(providerCatalog);
  const selectedProvider =
    providerOptions.find((entry) => entry.provider === provider) ?? null;
  const configuredProvider =
    configSnapshot?.providers.find((entry) => entry.provider === provider) ?? null;
  const settingsSelectedProviderId =
    settingsProviderId || provider || configSnapshot?.defaults.provider || providerOptions[0]?.provider || "";

  useEffect(() => {
    desktopRef.current = desktop;
  }, [desktop]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    applyAppTheme({
      appearanceMode,
      themeAccent,
      prefersDark: systemPrefersDark,
    });
  }, [appearanceMode, systemPrefersDark, themeAccent]);

  useEffect(() => {
    let disposed = false;
    let timeoutId = 0;
    let removeFocusListener: (() => void) | undefined;

    async function refreshChromeMetrics() {
      try {
        const metrics = await getWindowChromeMetrics();
        if (!disposed && metrics) {
          setWindowChromeMetrics(metrics);
        }
      } catch {
        // Ignore macOS chrome measurements failures and keep the fallback offsets.
      }
    }

    void refreshChromeMetrics();
    timeoutId = window.setTimeout(() => {
      void refreshChromeMetrics();
    }, 220);

    void getCurrentWindow()
      .onFocusChanged(() => {
        void refreshChromeMetrics();
      })
      .then((unlisten) => {
        removeFocusListener = unlisten;
      })
      .catch(() => {
        removeFocusListener = undefined;
      });

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      removeFocusListener?.();
    };
  }, []);

  const setBootstrapInfo = useEffectEvent((updater: StateUpdater<PiBootstrapInfo | null>) => {
    dispatch(
      desktopActions.setBootstrapInfo(
        resolveUpdater(updater, store.getState().desktop.bootstrapInfo),
      ),
    );
  });
  const setRuntimeSnapshot = useEffectEvent((updater: StateUpdater<PiRuntimeSnapshot | null>) => {
    dispatch(
      desktopActions.setRuntimeSnapshot(
        resolveUpdater(updater, store.getState().desktop.runtimeSnapshot),
      ),
    );
  });
  const setConnectionStatus = useEffectEvent((updater: StateUpdater<ConnectionStatus>) => {
    dispatch(
      desktopActions.setConnectionStatus(
        resolveUpdater(updater, store.getState().desktop.connectionStatus),
      ),
    );
  });
  const setConnectionError = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(
      desktopActions.setConnectionError(
        resolveUpdater(updater, store.getState().desktop.connectionError),
      ),
    );
  });
  const setSessionState = useEffectEvent((updater: StateUpdater<PiSessionState | null>) => {
    dispatch(desktopActions.setSessionState(resolveUpdater(updater, store.getState().desktop.sessionState)));
  });
  const setWorkspacePath = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(
      desktopActions.setWorkspacePath(
        resolveUpdater(updater, store.getState().desktop.workspacePath),
      ),
    );
  });
  const setProvider = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(desktopActions.setProvider(resolveUpdater(updater, store.getState().desktop.provider)));
  });
  const setModel = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(desktopActions.setModel(resolveUpdater(updater, store.getState().desktop.model)));
  });
  const setApiKeyEnvName = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(
      desktopActions.setApiKeyEnvName(
        resolveUpdater(updater, store.getState().desktop.apiKeyEnvName),
      ),
    );
  });
  const setComposer = useEffectEvent((updater: StateUpdater<string>) => {
    dispatch(desktopActions.setComposer(resolveUpdater(updater, store.getState().desktop.composer)));
  });
  const setMessages = useEffectEvent((updater: StateUpdater<UiMessage[]>) => {
    dispatch(desktopActions.setMessages(resolveUpdater(updater, store.getState().desktop.messages)));
  });
  const setEvents = useEffectEvent((updater: StateUpdater<PiEventRecord[]>) => {
    dispatch(desktopActions.setEvents(resolveUpdater(updater, store.getState().desktop.events)));
  });
  const setUsage = useEffectEvent((updater: StateUpdater<PiUsageSummary>) => {
    dispatch(desktopActions.setUsage(resolveUpdater(updater, store.getState().desktop.usage)));
  });
  const setDiagnostics = useEffectEvent((updater: StateUpdater<PiDiagnosticsState>) => {
    dispatch(
      desktopActions.setDiagnostics(
        resolveUpdater(updater, store.getState().desktop.diagnostics),
      ),
    );
  });
  const setToolExecutions = useEffectEvent(
    (updater: StateUpdater<Record<string, ToolExecutionRecord>>) => {
      dispatch(
        desktopActions.setToolExecutions(
          resolveUpdater(updater, store.getState().desktop.toolExecutions),
        ),
      );
    },
  );
  const setSessions = useEffectEvent((updater: StateUpdater<StoredSession[]>) => {
    dispatch(desktopActions.setSessions(resolveUpdater(updater, store.getState().desktop.sessions)));
  });
  const setActiveSessionId = useEffectEvent((updater: StateUpdater<string | null>) => {
    dispatch(
      desktopActions.setActiveSessionId(
        resolveUpdater(updater, store.getState().desktop.activeSessionId),
      ),
    );
  });
  const setLiveSessionId = useEffectEvent((updater: StateUpdater<string | null>) => {
    dispatch(
      desktopActions.setLiveSessionId(
        resolveUpdater(updater, store.getState().desktop.liveSessionId),
      ),
    );
  });
  const setRouteState = useEffectEvent((updater: StateUpdater<AppRouteState>) => {
    const currentRouteState = store.getState().desktop.routeState;
    const nextRouteState = resolveUpdater(updater, currentRouteState);
    if (isSameRouteState(currentRouteState, nextRouteState)) {
      return;
    }

    dispatch(desktopActions.setRouteState(nextRouteState));
  });
  const setSidebarCollapsed = useEffectEvent((updater: StateUpdater<boolean>) => {
    dispatch(
      desktopActions.setSidebarCollapsed(
        resolveUpdater(updater, store.getState().desktop.sidebarCollapsed),
      ),
    );
  });
  const setAppearanceMode = useEffectEvent((updater: StateUpdater<AppearanceMode>) => {
    dispatch(
      desktopActions.setAppearanceMode(
        resolveUpdater(updater, store.getState().desktop.appearanceMode),
      ),
    );
  });
  const setThemeAccent = useEffectEvent((updater: StateUpdater<ThemeAccentId>) => {
    dispatch(
      desktopActions.setThemeAccent(
        resolveUpdater(updater, store.getState().desktop.themeAccent),
      ),
    );
  });

  const resolveProviderEnvName = useEffectEvent(
    (providerId: string, fallback = "") => {
      const savedConfig = configSnapshot?.providers.find((entry) => entry.provider === providerId);
      const catalogEntry = findProviderEntry(providerCatalog, providerId);
      return (
        savedConfig?.apiKeyEnvName ||
        catalogEntry?.apiKeyEnvName ||
        inferApiKeyEnv(providerId) ||
        fallback
      );
    },
  );

  const activeSession = findSessionById(sessions, activeSessionId);
  const connectionLabel = formatConnectionStatus(connectionStatus);
  const isConnected = connectionStatus === "connected";
  const isBusy = sessionState?.isStreaming ?? false;
  const modelLabel = formatModel(sessionState) || model || selectedProvider?.label || "未选择";
  const breadcrumbs = getBreadcrumbs(routeState);
  const sortedSessions = sortSessions(sessions);
  const viewedProvider = activeSession?.provider || provider;
  const viewedModel = activeSession?.model || model;
  const viewedProviderEntry = findProviderEntry(providerCatalog, viewedProvider);
  const viewedModelEntry =
    viewedProviderEntry?.models.find((entry) => entry.id === viewedModel) ?? null;
  const viewedContextLimit = viewedModelEntry?.contextWindow ?? 0;
  const resolvedAppearanceMode = resolveAppearanceMode(appearanceMode, systemPrefersDark);
  const terminalTheme = getAppTerminalTheme(themeAccent, appearanceMode, systemPrefersDark);
  const isChatRoute = routeState.kind === "chat" || routeState.kind === "new";
  const terminalWorkspace =
    activeSession?.workspacePath ||
    workspacePath ||
    bootstrapInfo?.defaultWorkspacePath ||
    "~/.pitest";
  const showSessionListLoading =
    !sessionsHydrated && !connectionError && !providerCatalogError;
  const showChatLoading = isChatRoute && showSessionListLoading;
  const headerSessionTitle =
    routeState.kind === "chat" || routeState.kind === "new"
      ? activeSession?.title ?? "New Session"
      : "";

  useEffect(() => {
    const syncRoute = () => {
      setRouteState(getRouteFromHash());
    };

    if (!window.location.hash) {
      const currentDesktop = desktopRef.current;
      const fallbackSessionId =
        currentDesktop.activeSessionId ??
        sortSessions(currentDesktop.sessions)[0]?.id ??
        null;

      if (fallbackSessionId) {
        navigate(
          {
            kind: "chat",
            sessionId: fallbackSessionId,
          },
          { replace: true },
        );
      }
    } else {
      syncRoute();
    }

    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  useEffect(() => {
    if (!sidebarPanelRef.current) {
      return;
    }

    if (sidebarCollapsed) {
      sidebarPanelRef.current.collapse();
      return;
    }

    if (sidebarPanelRef.current.isCollapsed()) {
      sidebarPanelRef.current.expand();
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (routeState.kind === "chat" || routeState.kind === "new") {
      return;
    }

    if (terminalVisible) {
      setTerminalVisible(false);
    }
  }, [routeState.kind, terminalVisible]);

  useEffect(() => {
    writeStoredBoolean(TERMINAL_VISIBLE_STORAGE_KEY, terminalVisible);
  }, [terminalVisible]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    async function loadInitialState() {
      unlisten = await listen<PiEventEnvelope>("pi-event", (event) => {
        if (!disposed) {
          handlePiEnvelope(event.payload);
        }
      });

      if (disposed) {
        unlisten();
        return;
      }

      try {
        const bootstrap = await bootstrapPi();
        const catalog = await getPiProviderCatalog();
        const snapshot = await getPiRuntimeSnapshot();
        const config = await getPiConfigSnapshot(
          snapshot.workspacePath || bootstrap.defaultWorkspacePath,
        );

        if (disposed) {
          return;
        }

        setProviderCatalog(catalog);
        setConfigSnapshot(config);
        setProviderDrafts(buildProviderDraftMap(catalog, config));
        setSettingsProviderId(
          config.defaults.provider || snapshot.provider || bootstrap.defaultProvider,
        );
        setProviderCatalogError("");
        setRuntimeSnapshot(snapshot);
        setBootstrapInfo(bootstrap);
        setWorkspacePath(
          snapshot.workspacePath ||
            config.workspacePath ||
            bootstrap.defaultWorkspacePath,
        );
        setProvider((currentProvider) =>
          currentProvider && hasProviderCatalogEntry(catalog, currentProvider)
            ? currentProvider
            : snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
        );
        setModel((currentModel) => {
          const currentProvider = desktopRef.current.provider;
          const targetProvider =
            currentProvider && hasProviderCatalogEntry(catalog, currentProvider)
              ? currentProvider
              : snapshot.provider || config.defaults.provider || bootstrap.defaultProvider;
          const providerEntry = findProviderEntry(catalog, targetProvider);
          if (currentModel && providerEntry?.models.some((entry) => entry.id === currentModel)) {
            return currentModel;
          }
          return (
            providerEntry?.models.find((entry) => entry.id === config.defaults.model)?.id ??
            providerEntry?.defaultModel ??
            snapshot.model ??
            config.defaults.model ??
            bootstrap.defaultModel
          );
        });
        setApiKeyEnvName((currentEnv) =>
          currentEnv ||
          snapshot.apiKeyEnvName ||
          resolveConfiguredApiKeyEnvName(
            snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
            config,
            catalog,
          ) ||
          bootstrap.defaultApiKeyEnvName,
        );
        setInitialUiReady(true);

        const summaries = await listPiSessions(
          snapshot.workspacePath || bootstrap.defaultWorkspacePath,
        );
        const hydratedSessions = (
          await Promise.all(
            summaries.slice(0, MAX_STORED_SESSIONS).map(async (summary) => {
              const raw = await loadPiSession(summary.workspacePath, summary.id);
              return normalizeStoredSession(raw, {
                workspacePath:
                  summary.workspacePath ||
                  snapshot.workspacePath ||
                  config.workspacePath ||
                  bootstrap.defaultWorkspacePath,
                provider: summary.provider || config.defaults.provider || bootstrap.defaultProvider,
                model: summary.model || config.defaults.model || bootstrap.defaultModel,
                apiKeyEnvName:
                  summary.apiKeyEnvName ||
                  resolveConfiguredApiKeyEnvName(
                    summary.provider || config.defaults.provider || bootstrap.defaultProvider,
                    config,
                    catalog,
                  ) ||
                  bootstrap.defaultApiKeyEnvName,
              });
            }),
          )
        ).filter(Boolean) as StoredSession[];

        if (disposed) {
          return;
        }

        setSessions(sortSessions(hydratedSessions).slice(0, MAX_STORED_SESSIONS));
        setSessionsHydrated(true);

        const initialSession =
          findSessionById(hydratedSessions, desktopRef.current.activeSessionId) ??
          sortSessions(hydratedSessions)[0] ??
          null;

        if (initialSession) {
          setActiveSessionId(initialSession.id);
          setMessages(initialSession.messages);
          setEvents(initialSession.events);
          setUsage(initialSession.usage);
          setDiagnostics(initialSession.diagnostics);
          setToolExecutions(initialSession.toolExecutions);
          setWorkspacePath(initialSession.workspacePath);
          setProvider(initialSession.provider);
          setModel(initialSession.model);
          setApiKeyEnvName(
            resolveConfiguredApiKeyEnvName(initialSession.provider, config, catalog) ||
              initialSession.apiKeyEnvName ||
              inferApiKeyEnv(initialSession.provider),
          );
          if (routeState.kind === "new") {
            navigate({ kind: "chat", sessionId: initialSession.id }, { replace: true });
          }
        } else {
          setWorkspacePath(
            snapshot.workspacePath ||
              config.workspacePath ||
              bootstrap.defaultWorkspacePath,
          );
          setProvider((currentProvider) =>
            currentProvider && hasProviderCatalogEntry(catalog, currentProvider)
              ? currentProvider
              : snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
          );
          setModel((currentModel) => {
            const currentProvider = desktopRef.current.provider;
            const targetProvider =
              currentProvider && hasProviderCatalogEntry(catalog, currentProvider)
                ? currentProvider
                : snapshot.provider || config.defaults.provider || bootstrap.defaultProvider;
            const providerEntry = findProviderEntry(catalog, targetProvider);
            if (currentModel && providerEntry?.models.some((entry) => entry.id === currentModel)) {
              return currentModel;
            }
            return (
              providerEntry?.models.find((entry) => entry.id === config.defaults.model)?.id ??
              providerEntry?.defaultModel ??
              snapshot.model ??
              config.defaults.model ??
              bootstrap.defaultModel
            );
          });
          setApiKeyEnvName((currentEnv) =>
            currentEnv ||
            snapshot.apiKeyEnvName ||
            resolveConfiguredApiKeyEnvName(
              snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
              config,
              catalog,
            ) ||
            bootstrap.defaultApiKeyEnvName,
          );
          const created = createSession({
            workspacePath:
              snapshot.workspacePath ||
              config.workspacePath ||
              bootstrap.defaultWorkspacePath,
            provider: snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
            model: snapshot.model || config.defaults.model || bootstrap.defaultModel,
            apiKeyEnvName:
              snapshot.apiKeyEnvName ||
              resolveConfiguredApiKeyEnvName(
                snapshot.provider || config.defaults.provider || bootstrap.defaultProvider,
                config,
                catalog,
              ) ||
              bootstrap.defaultApiKeyEnvName,
          });
          setSessions([created]);
          setActiveSessionId(created.id);
          setLiveSessionId(created.id);
          setMessages(created.messages);
          setEvents(created.events);
          setUsage(created.usage);
          setDiagnostics(created.diagnostics);
          setToolExecutions(created.toolExecutions);
          navigate({ kind: "chat", sessionId: created.id }, { replace: true });
        }
      } catch (error) {
        if (!disposed) {
          setProviderCatalogError(formatError(error));
          setConnectionStatus("error");
          setConnectionError(formatError(error));
          setInitialUiReady(true);
        }
        return;
      }

      try {
        const currentSnapshot = await getPiRuntimeSnapshot();
        if (disposed) {
          return;
        }

        setRuntimeSnapshot(currentSnapshot);
        if (currentSnapshot.connectionStatus === "connected") {
          const currentState = await getPiState();
          if (disposed) {
            return;
          }

          setSessionState(currentState);
          setConnectionStatus("connected");
          connectedConfigRef.current = configKey({
            workspacePath: currentSnapshot.workspacePath,
            provider: currentSnapshot.provider,
            model: currentSnapshot.model,
            apiKeyEnvName: currentSnapshot.apiKeyEnvName,
            sessionId: store.getState().desktop.activeSessionId ?? undefined,
          });
          setLiveSessionId((current) => current || store.getState().desktop.activeSessionId);
          pushEventRecord({
            source: "runtime",
            kind: "status",
            severity: "info",
            summary: "检测到已存在的 PI RPC 会话。",
          });
        } else {
          setConnectionStatus((currentStatus) =>
            currentStatus === "error" ? "error" : "idle",
          );
          setLiveSessionId(null);
        }
      } catch {
        if (!disposed) {
          setConnectionStatus((currentStatus) =>
            currentStatus === "error" ? "error" : "idle",
          );
        }
      }
    }

    void loadInitialState();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (frontendReadySignaledRef.current || !initialUiReady) {
      return;
    }

    frontendReadySignaledRef.current = true;

    void signalAppFrontendReady().catch(() => {
      // Ignore readiness signal failures to avoid blocking the UI thread.
    });
  }, [initialUiReady]);

  useEffect(() => {
    if (!providerCatalog) {
      return;
    }

    const fallbackProvider =
      configSnapshot?.defaults.provider ||
      bootstrapInfo?.defaultProvider ||
      flattenProviderCatalog(providerCatalog)[0]?.provider ||
      "";
    const currentProvider = provider;
    const nextProvider =
      currentProvider && hasProviderCatalogEntry(providerCatalog, currentProvider)
        ? currentProvider
        : fallbackProvider;

    if (nextProvider && nextProvider !== currentProvider) {
      setProvider(nextProvider);
    }

    if (!nextProvider) {
      return;
    }

    const providerEntry = findProviderEntry(providerCatalog, nextProvider);
    if (!providerEntry) {
      return;
    }

    if (!model || !providerEntry.models.some((entry) => entry.id === model)) {
      setModel(resolveProviderDefaultModel(providerEntry, configuredProvider, configSnapshot, bootstrapInfo));
    }

    if (!apiKeyEnvName) {
      setApiKeyEnvName(resolveProviderEnvName(nextProvider));
    }
  }, [
    apiKeyEnvName,
    bootstrapInfo,
    configSnapshot,
    configuredProvider,
    model,
    provider,
    providerCatalog,
    resolveProviderEnvName,
    setApiKeyEnvName,
    setModel,
    setProvider,
  ]);

  useEffect(() => {
    if (!providerOptions.length) {
      return;
    }

    setSettingsProviderId((current) =>
      current && providerOptions.some((entry) => entry.provider === current)
        ? current
        : configSnapshot?.defaults.provider || provider || providerOptions[0]?.provider || "",
    );
  }, [configSnapshot?.defaults.provider, provider, providerOptions]);

  useEffect(() => {
    setProviderSaveMessage("");
    setProviderSaveError("");
  }, [settingsProviderId]);

  useEffect(() => {
    if (routeState.kind !== "skills" || skillsLoaded || skillsLoading) {
      return;
    }

    void loadSkills();
  }, [routeState.kind, skillsLoaded, skillsLoading]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setSessions((currentSessions) =>
      updateSessionSnapshot(currentSessions, activeSessionId, {
        title: buildSessionTitle(messages),
        updatedAt: new Date().toISOString(),
        messages,
        events,
        workspacePath,
        provider,
        model,
        apiKeyEnvName,
        runtimeState: resolveRuntimeState(connectionStatus, isBusy),
        usage,
        diagnostics,
        toolExecutions,
      }),
    );
  }, [
    activeSessionId,
    apiKeyEnvName,
    connectionStatus,
    diagnostics,
    events,
    isBusy,
    messages,
    model,
    provider,
    toolExecutions,
    usage,
    workspacePath,
  ]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const active = findSessionById(sessions, activeSessionId);
    if (!active) {
      return;
    }

    if (sessionSaveTimeoutRef.current) {
      window.clearTimeout(sessionSaveTimeoutRef.current);
    }

    sessionSaveTimeoutRef.current = window.setTimeout(() => {
      void savePiSession(active.workspacePath, serializeStoredSession(active)).catch((error) => {
        setConnectionError(formatError(error));
      });
    }, 280);

    return () => {
      if (sessionSaveTimeoutRef.current) {
        window.clearTimeout(sessionSaveTimeoutRef.current);
      }
    };
  }, [activeSessionId, sessions, setConnectionError]);

  useEffect(() => {
    if (!feedRef.current) {
      return;
    }

    if (autoFollowEnabledRef.current && !userPausedScrollRef.current) {
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
      setHasUnreadBelow(false);
      return;
    }

    setHasUnreadBelow(true);
  }, [messages]);

  useEffect(() => {
    if (!bootstrapInfo || startupConnectAttemptRef.current || !sessionsHydrated) {
      return;
    }

    if (connectionStatus === "connected" || connectionStatus === "connecting") {
      return;
    }

    startupConnectAttemptRef.current = true;
    const targetSession = findSessionById(sessions, activeSessionId);

    if (targetSession) {
      setLiveSessionId(targetSession.id);
      void connectPi(targetSession, {
        preserveMessages: true,
        navigateOnConnect: false,
        targetSessionId: targetSession.id,
        targetSessionTitle: targetSession.title,
      });
      return;
    }

    void connectPi(
      {
        workspacePath,
        provider,
        model,
        apiKeyEnvName,
      },
      {
        preserveMessages: true,
        navigateOnConnect: false,
        targetSessionId: activeSessionId,
        targetSessionTitle: activeSession?.title ?? null,
      },
    );
  }, [
    activeSessionId,
    apiKeyEnvName,
    bootstrapInfo,
    connectionStatus,
    model,
    provider,
    sessions,
    workspacePath,
  ]);

  useEffect(() => {
    if (!sessionsHydrated) {
      return;
    }

    if (routeState.kind === "chat") {
      const targetSession = findSessionById(sessions, routeState.sessionId);

      if (!targetSession) {
        const fallbackSession = sessions[0];
        if (fallbackSession) {
          navigate({ kind: "chat", sessionId: fallbackSession.id }, { replace: true });
        } else {
          navigate({ kind: "new" }, { replace: true });
        }
        return;
      }

      if (activeSessionId !== targetSession.id) {
        setActiveSessionId(targetSession.id);
        setMessages(targetSession.messages);
        setEvents(targetSession.events);
        setUsage(targetSession.usage);
        setDiagnostics(targetSession.diagnostics);
        setToolExecutions(targetSession.toolExecutions);
        setWorkspacePath(targetSession.workspacePath);
        setProvider(targetSession.provider);
        setModel(targetSession.model);
        setApiKeyEnvName(resolveProviderEnvName(targetSession.provider, targetSession.apiKeyEnvName));
        setComposer("");
        setComposerAttachments([]);
        setConnectionError("");
        if (bootstrapInfo) {
          const nextConfigKey = configKey({
            ...targetSession,
            sessionId: targetSession.id,
          });
          const shouldReconnect =
            connectionStatus !== "connected" || connectedConfigRef.current !== nextConfigKey;
          if (shouldReconnect) {
            setLiveSessionId(targetSession.id);
            void connectPi(targetSession, {
              preserveMessages: true,
              navigateOnConnect: false,
              targetSessionId: targetSession.id,
              targetSessionTitle: targetSession.title,
            });
          }
        }
      }
    }
  }, [
    activeSessionId,
    apiKeyEnvName,
    bootstrapInfo,
    connectionStatus,
    model,
    provider,
    routeState,
    sessionsHydrated,
    sessions,
    workspacePath,
  ]);

  const pushEventRecord = useEffectEvent(
    (input: Pick<PiEventRecord, "source" | "kind" | "severity" | "summary"> &
      Partial<Pick<PiEventRecord, "payload" | "toolCallId">>) => {
      const sessionId = store.getState().desktop.activeSessionId;
      if (!sessionId) {
        return;
      }

      const timestamp = new Date().toISOString();
      const record: PiEventRecord = {
        id: nextEventId("event"),
        sessionId,
        timestamp,
        source: input.source,
        kind: input.kind,
        severity: input.severity,
        summary: input.summary,
        toolCallId: input.toolCallId,
        payload: input.payload ?? null,
      };

      startTransition(() => {
        setEvents((currentEvents) => [record, ...currentEvents].slice(0, 400));
      });
      setDiagnostics((currentDiagnostics) => ({
        stderrCount:
          input.kind === "stderr"
            ? currentDiagnostics.stderrCount + 1
            : currentDiagnostics.stderrCount,
        errorCount:
          input.severity === "error"
            ? currentDiagnostics.errorCount + 1
            : currentDiagnostics.errorCount,
        lastError:
          input.severity === "error" ? input.summary : currentDiagnostics.lastError,
        lastEventAt: timestamp,
      }));
    },
  );

  const dismissToast = useEffectEvent((toastId: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  });

  const pushToast = useEffectEvent(
    (toast: Omit<AppToast, "id"> & { durationMs?: number }) => {
      const toastId = nextEventId("toast");
      const durationMs = toast.durationMs ?? 2600;
      setToasts((currentToasts) => [
        ...currentToasts,
        {
          id: toastId,
          tone: toast.tone,
          title: toast.title,
          description: toast.description,
        },
      ]);
      window.setTimeout(() => {
        dismissToast(toastId);
      }, durationMs);
    },
  );

  const handlePiEnvelope = useEffectEvent((envelope: PiEventEnvelope) => {
    if (envelope.kind === "runtime") {
      return;
    }

    if (envelope.kind === "status") {
      if (envelope.status === "connected") {
        setConnectionStatus("connected");
        setConnectionError("");
        void refreshRuntimeSnapshot();
      }

      if (envelope.status === "stopped") {
        setConnectionStatus("idle");
        setSessionState((currentState) =>
          currentState
            ? {
                ...currentState,
                isStreaming: false,
              }
            : null,
        );
        activeAssistantIdRef.current = null;
        connectedConfigRef.current = "";
        setLiveSessionId(null);
        void refreshRuntimeSnapshot();
      }

      return;
    }

    if (envelope.kind === "stderr") {
      pushEventRecord({
        source: "runtime",
        kind: "stderr",
        severity: "warning",
        summary: envelope.line,
        payload: { line: envelope.line },
      });
      return;
    }

    if (envelope.kind === "error") {
      setConnectionError(envelope.message);
      setConnectionStatus("error");
      connectedConfigRef.current = "";
      pushSystemMessage(envelope.message, "error");
      pushEventRecord({
        source: "runtime",
        kind: "runtime_error",
        severity: "error",
        summary: envelope.message,
        payload: { raw: "raw" in envelope ? envelope.raw : null },
      });
      void refreshRuntimeSnapshot();
      return;
    }

    const rpcEvent = envelope.payload;
    const eventType = asString(rpcEvent.type);

    switch (eventType) {
      case "agent_start":
        setSessionState((currentState) =>
          currentState
            ? {
                ...currentState,
                isStreaming: true,
              }
            : currentState,
        );
        pushEventRecord({
          source: "agent",
          kind: "agent_start",
          severity: "info",
          summary: "PI 开始处理请求。",
          payload: rpcEvent,
        });
        break;
      case "agent_end":
        setSessionState((currentState) =>
          currentState
            ? {
                ...currentState,
                isStreaming: false,
                pendingMessageCount: 0,
              }
            : currentState,
        );
        activeAssistantIdRef.current = null;
        pushEventRecord({
          source: "agent",
          kind: "agent_end",
          severity: "info",
          summary: "PI 完成了当前回复。",
          payload: rpcEvent,
        });
        break;
      case "auto_compaction_start":
        setSessionState((currentState) =>
          currentState
            ? {
                ...currentState,
                isCompacting: true,
              }
            : currentState,
        );
        pushEventRecord({
          source: "runtime",
          kind: "auto_compaction_start",
          severity: "warning",
          summary: "上下文接近上限，PI 正在压缩上下文。",
          payload: rpcEvent,
        });
        break;
      case "auto_compaction_end": {
        const success = rpcEvent.success !== false;
        setSessionState((currentState) =>
          currentState
            ? {
                ...currentState,
                isCompacting: false,
              }
            : currentState,
        );
        pushEventRecord({
          source: "runtime",
          kind: "auto_compaction_end",
          severity: success ? "info" : "error",
          summary: success ? "上下文压缩完成。" : "上下文压缩失败，存在超长上下文风险。",
          payload: rpcEvent,
        });
        if (!success) {
          pushSystemMessage("当前上下文压缩失败，继续对话可能触发上下文溢出。", "error");
        }
        break;
      }
      case "message_start": {
        const message = asRecord(rpcEvent.message);
        if (asString(message?.role) === "assistant") {
          ensureAssistantDraft();
        }
        break;
      }
      case "message_update": {
        const assistantMessageEvent = asRecord(rpcEvent.assistantMessageEvent);
        const assistantEventType = asString(assistantMessageEvent?.type);

        if (assistantEventType === "text_delta") {
          appendAssistantText(asString(assistantMessageEvent?.delta));
        }

        if (assistantEventType === "thinking_delta") {
          appendAssistantThinking(asString(assistantMessageEvent?.delta));
        }

        if (assistantEventType === "toolcall_end") {
          const toolCall = asRecord(assistantMessageEvent?.toolCall);
          registerToolCall(toolCall);
          pushEventRecord({
            source: "tool",
            kind: "tool_call",
            severity: "info",
            summary: `准备调用工具: ${asString(toolCall?.name) || "unknown"}`,
            payload: toolCall,
            toolCallId: asString(toolCall?.id),
          });
        }

        break;
      }
      case "message_end": {
        const message = asRecord(rpcEvent.message);
        if (message && asString(message.role) === "assistant") {
          replaceAssistantMessage(message);
          activeAssistantIdRef.current = null;
        }
        break;
      }
      case "tool_execution_start":
        applyToolExecutionEvent(rpcEvent, "running");
        pushEventRecord({
          source: "tool",
          kind: "tool_start",
          severity: "info",
          summary: `工具开始执行: ${asString(rpcEvent.toolName) || "unknown"}`,
          payload: rpcEvent,
          toolCallId: asString(rpcEvent.toolCallId),
        });
        break;
      case "tool_execution_update":
        applyToolExecutionEvent(rpcEvent, "running");
        break;
      case "tool_execution_end": {
        const toolName = asString(rpcEvent.toolName) || "unknown";
        const isError = Boolean(rpcEvent.isError);
        applyToolExecutionEvent(rpcEvent, isError ? "error" : "success");
        pushEventRecord({
          source: "tool",
          kind: "tool_end",
          severity: isError ? "error" : "info",
          summary: `${isError ? "工具失败" : "工具完成"}: ${toolName}`,
          payload: rpcEvent,
          toolCallId: asString(rpcEvent.toolCallId),
        });
        break;
      }
      default:
        break;
    }
  });

  function nextMessageId(prefix: string) {
    messageCounterRef.current += 1;
    return `${prefix}-${Date.now()}-${messageCounterRef.current}`;
  }

  function nextEventId(prefix: string) {
    eventCounterRef.current += 1;
    return `${prefix}-${Date.now()}-${eventCounterRef.current}`;
  }

  function pushSystemMessage(content: string, tone: UiMessage["tone"] = "muted") {
    startTransition(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nextMessageId("system"),
          role: "system",
          createdAt: new Date().toISOString(),
          segments: toMarkdownSegments(content),
          tone,
          meta: "system",
        },
      ]);
    });
  }

  function ensureAssistantDraft() {
    if (activeAssistantIdRef.current) {
      return activeAssistantIdRef.current;
    }

    const nextId = nextMessageId("assistant");
    activeAssistantIdRef.current = nextId;

    startTransition(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nextId,
          role: "assistant",
          createdAt: new Date().toISOString(),
          segments: [],
          meta: "PI",
        },
      ]);
    });

    return nextId;
  }

  function appendAssistantText(delta: string) {
    if (!delta) {
      return;
    }

    const assistantId = ensureAssistantDraft();

    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                segments: appendMarkdownDelta(message.segments, delta),
              }
            : message,
        ),
      );
    });
  }

  function appendAssistantThinking(delta: string) {
    if (!delta) {
      return;
    }

    const assistantId = ensureAssistantDraft();

    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                segments: appendThinkingDelta(message.segments, delta),
              }
            : message,
        ),
      );
    });
  }

  function replaceAssistantMessage(message: Record<string, unknown>) {
    const assistantId = ensureAssistantDraft();
    const parsedMessage = parseAssistantMessage(message, assistantId);

    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                ...parsedMessage,
              }
            : message,
        ),
      );
    });

    const nextUsage = parsedMessage.usage;
    if (nextUsage) {
      setUsage((currentUsage) => accumulateUsageSummary(currentUsage, nextUsage));
    }
  }

  function registerToolCall(toolCall: Record<string, unknown> | null) {
    if (!toolCall) {
      return;
    }

    const assistantId = ensureAssistantDraft();

    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                segments: upsertToolCallSegment(message.segments, toolCall),
              }
            : message,
        ),
      );
    });
  }

  function applyToolExecutionEvent(
    rpcEvent: Record<string, unknown>,
    status: ToolExecutionRecord["status"],
  ) {
    const toolCallId = asString(rpcEvent.toolCallId);
    if (!toolCallId) {
      return;
    }

    const nextRecord = buildToolExecutionRecord(
      toolExecutions[toolCallId],
      rpcEvent,
      status,
    );
    setToolExecutions((currentExecutions) => ({
      ...currentExecutions,
      [toolCallId]: nextRecord,
    }));
    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) => {
          if (message.role !== "assistant") {
            return message;
          }

          const hasMatchingToolSegment = message.segments.some(
            (segment) =>
              (segment.type === "tool_call" || segment.type === "tool_result") &&
              segment.toolCallId === toolCallId,
          );
          const shouldAllowInsertIfMissing = message.id === activeAssistantIdRef.current;

          if (!hasMatchingToolSegment && !shouldAllowInsertIfMissing) {
            return message;
          }

          return {
            ...message,
            segments: updateToolExecutionSegments(message.segments, toolCallId, nextRecord, {
              allowInsertIfMissing: shouldAllowInsertIfMissing,
            }),
          };
        }),
      );
    });
  }

  async function refreshRuntimeSnapshot() {
    try {
      const snapshot = await getPiRuntimeSnapshot();
      setRuntimeSnapshot(snapshot);
    } catch {
      // Ignore snapshot refresh failures during transient runtime state transitions.
    }
  }

  async function handleAddComposerFiles() {
    try {
      const selection = await openFileDialog({
        directory: false,
        multiple: true,
        title: "选择要附加到当前消息的文件",
      });
      const nextPaths = normalizeFileDialogSelection(selection);
      if (nextPaths.length === 0) {
        return;
      }

      setComposerAttachments((currentAttachments) =>
        mergeComposerAttachments(currentAttachments, nextPaths),
      );
    } catch (error) {
      setConnectionError(formatError(error));
    }
  }

  async function handleQuickModelChange(
    providerEntry: PiProviderCatalogEntry,
    nextModel: string,
  ) {
    const nextProvider = providerEntry.provider;
    const providerDraft = providerDrafts[nextProvider];
    if (provider === nextProvider && model === nextModel) {
      return;
    }

    if (nextProvider !== provider && providerDraft && !providerDraft.hasStoredCredential) {
      const message = `请先在 Provider Catalog 里配置 ${providerEntry.label} 的 API Key。`;
      setConnectionError(message);
      pushToast({
        tone: "info",
        title: message,
      });
      return;
    }

    const nextApiKeyEnvName = resolveProviderEnvName(nextProvider);
    setProvider(nextProvider);
    setModel(nextModel);
    setApiKeyEnvName(nextApiKeyEnvName);
    setConnectionError("");

    if (connectionStatus === "connected" || connectionStatus === "connecting") {
      await connectPi(
        {
          workspacePath,
          provider: nextProvider,
          model: nextModel,
          apiKeyEnvName: nextApiKeyEnvName,
        },
        {
          preserveMessages: true,
          appendSystemNotice: `已切换到 ${nextProvider}/${nextModel}。`,
          targetSessionId: activeSessionId,
          targetSessionTitle: activeSession?.title ?? null,
        },
      );
    }
  }

  function updateProviderDraft(
    providerId: string,
    updater: (current: ProviderDraft) => ProviderDraft,
  ) {
    setProviderDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[providerId];
      if (!currentDraft) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [providerId]: updater(currentDraft),
      };
    });
    setProviderSaveMessage("");
    setProviderSaveError("");
  }

  async function handleSaveProviderDraft(providerId: string) {
    const draft = providerDrafts[providerId];
    if (!draft) {
      return;
    }

    setProviderSaveBusy(true);
    setProviderSaveMessage("");
    setProviderSaveError("");

    try {
      const snapshot = await savePiConfig({
        workspacePath,
        providerPatch: {
          provider: draft.provider,
          enabled: draft.enabled,
          apiKeyEnvName: draft.apiKeyEnvName,
          baseUrl: draft.baseUrl || undefined,
          headers: draft.headers,
        },
        credentialPatch: draft.dirty
          ? {
              provider: draft.provider,
              apiKey: draft.apiKeyDraft.trim() ? draft.apiKeyDraft.trim() : null,
            }
          : undefined,
      });

      setConfigSnapshot(snapshot);
      setProviderDrafts(buildProviderDraftMap(providerCatalog, snapshot));
      setProviderSaveMessage(`${draft.label} 的 API 配置已保存。`);
      setProviderSaveError("");

      if (provider === draft.provider) {
        const nextEnvName = resolveConfiguredApiKeyEnvName(draft.provider, snapshot, providerCatalog);
        setApiKeyEnvName(nextEnvName);
        setSessions((currentSessions) =>
          currentSessions.map((session) =>
            session.provider === draft.provider
              ? {
                  ...session,
                  apiKeyEnvName: resolveConfiguredApiKeyEnvName(
                    session.provider,
                    snapshot,
                    providerCatalog,
                  ),
                }
              : session,
          ),
        );
      }
    } catch (error) {
      setProviderSaveError(formatError(error));
      setProviderSaveMessage("");
    } finally {
      setProviderSaveBusy(false);
    }
  }

  function applyStarterPrompt(prompt: string) {
    setComposer(prompt);
    composerRef.current?.focus();
  }

  function createAndOpenSession(partialConfig?: Partial<SessionConfig>) {
    const nextConfig: SessionConfig = {
      workspacePath: normalizeConfigValue(
        partialConfig?.workspacePath,
        workspacePath || bootstrapInfo?.defaultWorkspacePath || "~/.pitest",
      ),
      provider: normalizeConfigValue(
        partialConfig?.provider,
        provider || bootstrapInfo?.defaultProvider || "",
      ),
      model: normalizeConfigValue(
        partialConfig?.model,
        model || bootstrapInfo?.defaultModel || "",
      ),
      apiKeyEnvName: normalizeConfigValue(
        partialConfig?.apiKeyEnvName,
        resolveProviderEnvName(
          partialConfig?.provider ||
            provider ||
            configSnapshot?.defaults.provider ||
            bootstrapInfo?.defaultProvider ||
            "",
          apiKeyEnvName || bootstrapInfo?.defaultApiKeyEnvName || "",
        ),
      ),
    };

    const created = createSession(nextConfig);
    setSessions((currentSessions) =>
      sortSessions([created, ...currentSessions]).slice(0, MAX_STORED_SESSIONS),
    );
    setActiveSessionId(created.id);
    setLiveSessionId(
      connectionStatus === "connected" || connectionStatus === "connecting"
        ? created.id
        : null,
    );
    setMessages(created.messages);
    setEvents(created.events);
    setUsage(created.usage);
    setDiagnostics(created.diagnostics);
    setToolExecutions(created.toolExecutions);
    setWorkspacePath(created.workspacePath);
    setProvider(created.provider);
    setModel(created.model);
    setApiKeyEnvName(created.apiKeyEnvName);
    setConnectionError("");
    setComposer("");
    setComposerAttachments([]);
    navigate({ kind: "chat", sessionId: created.id });

    if (connectionStatus === "connected" || connectionStatus === "connecting") {
      void connectPi(created, {
        preserveMessages: true,
        navigateOnConnect: false,
        targetSessionId: created.id,
        targetSessionTitle: created.title,
      });
    }
  }

  function navigate(route: AppRouteState, options?: { replace?: boolean }) {
    if (typeof window === "undefined") {
      setRouteState(route);
      return;
    }

    const nextHash = routeToHash(route);
    if (options?.replace) {
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, "", nextHash);
        setRouteState(route);
      }
      return;
    }

    if (window.location.hash === nextHash) {
      setRouteState(route);
      return;
    }

    window.location.hash = nextHash.slice(1);
  }

  function scrollFeedToBottom(behavior: ScrollBehavior = "smooth") {
    if (!feedRef.current) {
      return;
    }

    feedRef.current.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior,
    });
    setFeedIsNearBottom(true);
    setHasUnreadBelow(false);
  }

  function handleFeedScroll(event: UIEvent<HTMLDivElement>) {
    activateAutoScrollbar(event.currentTarget);

    if (!feedRef.current) {
      return;
    }

    const distanceFromBottom =
      feedRef.current.scrollHeight -
      (feedRef.current.scrollTop + feedRef.current.clientHeight);
    const isNearBottom = distanceFromBottom < 72;
    setFeedIsNearBottom(isNearBottom);

    if (isNearBottom) {
      autoFollowEnabledRef.current = true;
      userPausedScrollRef.current = false;
      setHasUnreadBelow(false);
      return;
    }

    autoFollowEnabledRef.current = false;
    userPausedScrollRef.current = true;
  }

  async function connectPi(
    config?: Partial<SessionConfig>,
    options?: {
      preserveMessages?: boolean;
      appendSystemNotice?: string;
      navigateOnConnect?: boolean;
      targetSessionId?: string | null;
      targetSessionTitle?: string | null;
    },
  ) {
    const nextConfig: SessionConfig = {
      workspacePath: normalizeConfigValue(
        config?.workspacePath,
        workspacePath || bootstrapInfo?.defaultWorkspacePath || "~/.pitest",
      ),
      provider: normalizeConfigValue(config?.provider, provider),
      model: normalizeConfigValue(config?.model, model),
      apiKeyEnvName: normalizeConfigValue(
        config?.apiKeyEnvName,
        resolveProviderEnvName(config?.provider || provider, apiKeyEnvName || inferApiKeyEnv(provider)),
      ),
    };

    setWorkspacePath(nextConfig.workspacePath);
    setProvider(nextConfig.provider);
    setModel(nextConfig.model);
    setApiKeyEnvName(nextConfig.apiKeyEnvName);
    setConnectionStatus("connecting");
    setConnectionError("");
    setSessionState(null);
    activeAssistantIdRef.current = null;
    connectedConfigRef.current = "";
    const boundSessionId = options?.targetSessionId ?? activeSessionId ?? null;
    const boundSessionTitle =
      options?.targetSessionTitle ??
      findSessionById(sessions, boundSessionId)?.title ??
      activeSession?.title ??
      null;
    setLiveSessionId(boundSessionId);

    try {
      const result = await startPi({
        workspacePath: nextConfig.workspacePath,
        provider: nextConfig.provider,
        model: nextConfig.model,
        apiKeyEnvName: nextConfig.apiKeyEnvName,
        sessionId: boundSessionId ?? undefined,
        sessionTitle: boundSessionTitle ?? undefined,
      });

      setConnectionStatus("connected");
      setSessionState(result.state);
      setWorkspacePath(result.workspacePath);
      setProvider(result.provider);
      setModel(result.model);
      setApiKeyEnvName(result.apiKeyEnvName);
      setLiveSessionId(boundSessionId);
      connectedConfigRef.current = configKey({
        workspacePath: result.workspacePath,
        provider: result.provider,
        model: result.model,
        apiKeyEnvName: result.apiKeyEnvName,
        sessionId: boundSessionId ?? undefined,
      });
      await refreshRuntimeSnapshot();
      pushEventRecord({
        source: "runtime",
        kind: "session_meta",
        severity: "info",
        summary: `workspace: ${result.workspacePath}`,
        payload: {
          workspacePath: result.workspacePath,
          cliPath: result.cliPath,
          provider: result.provider,
          model: result.model,
        },
      });

      if (options?.appendSystemNotice) {
        pushToast({
          tone: "success",
          title: options.appendSystemNotice,
        });
      } else if (!options?.preserveMessages && messages.length === 0) {
        pushEventRecord({
          source: "runtime",
          kind: "status",
          severity: "info",
          summary: "PI RPC 已连接。",
        });
      }

      if (options?.navigateOnConnect !== false && activeSessionId) {
        navigate({ kind: "chat", sessionId: activeSessionId });
      }
    } catch (error) {
      const message = formatError(error);
      setConnectionStatus("error");
      setConnectionError(message);
      connectedConfigRef.current = "";
      pushSystemMessage(message, "error");
      pushEventRecord({
        source: "runtime",
        kind: "runtime_error",
        severity: "error",
        summary: message,
      });
    }
  }

  async function handleDisconnect() {
    try {
      await stopPi();
    } catch (error) {
      setConnectionError(formatError(error));
      setConnectionStatus("error");
      return;
    }

    setConnectionStatus("idle");
    setSessionState(null);
    activeAssistantIdRef.current = null;
    connectedConfigRef.current = "";
    setLiveSessionId(null);
    void refreshRuntimeSnapshot();
    pushToast({
      tone: "info",
      title: "PI 已断开。",
    });
  }

  function settlePendingTaskState(reason = "已手动停止当前任务。") {
    const finishedAt = new Date().toISOString();
    setSessionState((currentState) =>
      currentState
        ? {
            ...currentState,
            isStreaming: false,
            isCompacting: false,
            pendingMessageCount: 0,
          }
        : currentState,
    );
    setToolExecutions((currentExecutions) =>
      markToolExecutionsStopped(currentExecutions, finishedAt, reason),
    );
    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.role === "assistant"
            ? {
                ...message,
                segments: stopRunningToolSegments(message.segments, finishedAt, reason),
              }
            : message,
        ),
      );
    });
    activeAssistantIdRef.current = null;
  }

  async function handleAbort() {
    try {
      settlePendingTaskState();
      await abortPi();
      pushEventRecord({
        source: "runtime",
        kind: "abort",
        severity: "warning",
        summary: "已发送 abort。",
      });
      void refreshRuntimeSnapshot();
    } catch (error) {
      setConnectionError(formatError(error));
      setConnectionStatus("error");
    }
  }

  async function handleSend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedComposer = composer.trim();
    const nextAttachments = composerAttachments;
    if (
      (trimmedComposer.length === 0 && nextAttachments.length === 0) ||
      isBusy ||
      Boolean(sessionState?.isCompacting) ||
      connectionStatus !== "connected" ||
      activeSessionId !== liveSessionId
    ) {
      return;
    }

    const nextPrompt = buildPromptForPi(trimmedComposer, nextAttachments);
    const userFacingPrompt = buildUserFacingPrompt(trimmedComposer, nextAttachments);

    setComposer("");
    setComposerAttachments([]);
    setConnectionError("");
    autoFollowEnabledRef.current = true;
    userPausedScrollRef.current = false;
    setHasUnreadBelow(false);
    window.requestAnimationFrame(() => {
      scrollFeedToBottom("smooth");
    });

    startTransition(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nextMessageId("user"),
          role: "user",
          createdAt: new Date().toISOString(),
          segments: toMarkdownSegments(userFacingPrompt),
          meta: "you",
        },
      ]);
    });
    pushEventRecord({
      source: "user",
      kind: "prompt",
      severity: "info",
      summary: truncateText(userFacingPrompt.replace(/\s+/g, " ").trim(), 96),
    });
    const draftId = ensureAssistantDraft();

    try {
      await promptPi({ message: nextPrompt });
    } catch (error) {
      const message = formatError(error);
      setConnectionError(message);
      setConnectionStatus("error");
      connectedConfigRef.current = "";
      clearEmptyAssistantDraft(draftId);
      pushSystemMessage(message, "error");
    }
  }

  useEffect(() => {
    const sessionId = activeSessionId;
    const starterPrompt = bootstrapInfo?.onboarding.suggestedStarterPrompt?.trim() ?? "";

    if (!sessionId || sessionId !== liveSessionId) {
      return;
    }
    if (connectionStatus !== "connected") {
      return;
    }
    if (!bootstrapInfo?.onboarding.required || !starterPrompt) {
      return;
    }
    if (messages.length > 0) {
      return;
    }
    if ((sessionState?.messageCount ?? 0) > 0) {
      return;
    }
    if (onboardingPromptedSessionIdsRef.current.has(sessionId)) {
      return;
    }

    onboardingPromptedSessionIdsRef.current.add(sessionId);
    pushEventRecord({
      source: "runtime",
      kind: "onboarding",
      severity: "info",
      summary: "触发首次身份 onboarding。",
    });

    void promptPi({ message: starterPrompt }).catch((error) => {
      onboardingPromptedSessionIdsRef.current.delete(sessionId);
      const message = formatError(error);
      setConnectionError(message);
      pushSystemMessage(message, "error");
    });
  }, [
    activeSessionId,
    bootstrapInfo,
    connectionStatus,
    liveSessionId,
    messages.length,
    pushEventRecord,
    sessionState?.messageCount,
  ]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function clearEmptyAssistantDraft(draftId: string) {
    startTransition(() => {
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            !(
              message.id === draftId &&
              message.role === "assistant" &&
              message.segments.length === 0
            ),
        ),
      );
    });

    if (activeAssistantIdRef.current === draftId) {
      activeAssistantIdRef.current = null;
    }
  }

  async function handleRenameSession(session: StoredSession) {
    const nextTitle = window.prompt("Session 名称", session.title)?.trim();
    if (!nextTitle || nextTitle === session.title) {
      return;
    }

    setSessions((currentSessions) =>
      currentSessions.map((candidate) =>
        candidate.id === session.id
          ? {
              ...candidate,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    );
    await renamePiSession(session.workspacePath, session.id, nextTitle);
  }

  function requestDeleteSession(session: StoredSession) {
    setPendingDeleteSession(session);
  }

  async function handleDeleteSession(session: StoredSession) {
    try {
      await deletePiSession(session.workspacePath, session.id);
      const remaining = sessions.filter((candidate) => candidate.id !== session.id);
      setSessions(remaining);
      setPendingDeleteSession((current) => (current?.id === session.id ? null : current));

      if (activeSessionId === session.id) {
        const fallback = sortSessions(remaining)[0] ?? null;
        if (fallback) {
          navigate({ kind: "chat", sessionId: fallback.id }, { replace: true });
        } else {
          setActiveSessionId(null);
          setLiveSessionId(null);
          setMessages([]);
          setEvents([]);
          setUsage(createEmptyUsageSummary());
          setDiagnostics(createEmptyDiagnosticsState());
          setToolExecutions({});
          navigate({ kind: "new" }, { replace: true });
        }
      }

      pushToast({
        tone: "success",
        title: `已删除会话“${session.title}”`,
      });
    } catch (error) {
      const message = formatError(error);
      setConnectionError(message);
      pushToast({
        tone: "error",
        title: "删除会话失败",
        description: message,
        durationMs: 4200,
      });
    }
  }

  async function handleClearLogs(session: StoredSession) {
    await clearPiSessionLogs(session.workspacePath, session.id);
    const clearedDiagnostics = createEmptyDiagnosticsState();
    setSessions((currentSessions) =>
      currentSessions.map((candidate) =>
        candidate.id === session.id
          ? {
              ...candidate,
              events: [],
              diagnostics: clearedDiagnostics,
            }
          : candidate,
      ),
    );

    if (activeSessionId === session.id) {
      setEvents([]);
      setDiagnostics(clearedDiagnostics);
    }
  }

  async function handleExportLogs(filter: PiLogFilter) {
    const exportWorkspace = activeSession?.workspacePath || workspacePath;
    if (!exportWorkspace) {
      return;
    }

    const result = await exportPiSessionLogs(exportWorkspace, filter);
    await revealItemInDir(result.path);
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => !current);
  }

  function toggleTerminal() {
    setTerminalVisible((current) => !current);
  }

  function handleSidebarLayoutChange(nextLayout: Record<string, number>) {
    setSidebarLayout(nextLayout);
    writeStoredPanelLayout(SIDEBAR_LAYOUT_STORAGE_KEY, nextLayout);
  }

  function handleChatTerminalLayoutChange(nextLayout: Record<string, number>) {
    setChatTerminalLayout((current) => {
      const currentMain = current["pitest-chat-main-panel"] ?? 0;
      const currentTerminal = current["pitest-chat-terminal-panel"] ?? 0;
      const nextMain = nextLayout["pitest-chat-main-panel"] ?? 0;
      const nextTerminal = nextLayout["pitest-chat-terminal-panel"] ?? 0;
      if (
        Math.abs(currentMain - nextMain) < 0.1 &&
        Math.abs(currentTerminal - nextTerminal) < 0.1
      ) {
        return current;
      }
      return nextLayout;
    });
    writeStoredPanelLayout(CHAT_TERMINAL_LAYOUT_STORAGE_KEY, nextLayout);
  }

  function handleSidebarResize(panelSize: { asPercentage: number; inPixels: number }) {
    if (panelSize.inPixels <= COLLAPSED_SIDEBAR_WIDTH + 12) {
      setSidebarCollapsed(true);
      return;
    }

    setSidebarCollapsed(false);
  }

  function handleScrollableAreaScroll(event: UIEvent<HTMLElement>) {
    activateAutoScrollbar(event.currentTarget);
  }

  async function loadSkills(force = false) {
    if (skillsLoading || (skillsLoaded && !force)) {
      return;
    }

    setSkillsLoading(true);
    setSkillsError("");
    setSkillsActionError("");

    try {
      const nextSkills = await listInstalledSkills();
      setInstalledSkills(nextSkills);
      setSkillsLoaded(true);
      setSelectedSkillId((current) =>
        nextSkills.some((skill) => skill.id === current) ? current : nextSkills[0]?.id ?? null,
      );
    } catch (error) {
      setSkillsError(formatError(error));
    } finally {
      setSkillsLoading(false);
    }
  }

  async function handleOpenSkillFile(path: string) {
    setSkillsActionError("");
    try {
      await openPath(path);
    } catch (error) {
      setSkillsActionError(formatError(error));
    }
  }

  async function handleRevealSkillFolder(path: string) {
    setSkillsActionError("");
    try {
      await revealItemInDir(path);
    } catch (error) {
      setSkillsActionError(formatError(error));
    }
  }

  const sidebarActiveKey =
    routeState.kind === "activity"
      ? "activity"
      : routeState.kind === "skills"
        ? "skills"
        : routeState.kind === "settings"
          ? "settings"
          : null;
  const chromeControlGroupLeft = windowChromeMetrics?.controlGroupLeft ?? 84;
  const chromeControlGroupTop = Math.max(
    8,
    (windowChromeMetrics?.buttonCenterY ?? 26) - (CHROME_TOOLBAR_BUTTON_SIZE / 2),
  );
  const collapsedHeaderPadding = Math.max(
    12,
    chromeControlGroupLeft + CHROME_TOOLBAR_GROUP_WIDTH - COLLAPSED_SIDEBAR_WIDTH + 18,
  );
  const settingsSidebarColumnWidth = sidebarCollapsed
    ? "240px"
    : `minmax(240px, ${sidebarLayout["pitest-sidebar-panel"]}%)`;
  const exitSettingsRoute = () => {
    if (activeSessionId) {
      navigate({ kind: "chat", sessionId: activeSessionId });
      return;
    }

    navigate({ kind: "new" });
  };
  return (
    <TooltipProvider delayDuration={160} skipDelayDuration={80}>
      <ToastProvider swipeDirection="right">
      {routeState.kind === "settings" ? (
        <StandaloneSettingsShell>
          <SettingsRoute
            compaction={configSnapshot?.compaction ?? null}
            connectionError={connectionError}
            connectionStatus={connectionStatus}
            isBusy={isBusy}
            isConnected={isConnected}
            providerCatalog={providerCatalog}
            providerCatalogError={providerCatalogError}
            providerDrafts={providerDrafts}
            providerSaveBusy={providerSaveBusy}
            providerSaveError={providerSaveError}
            providerSaveMessage={providerSaveMessage}
            selectedProviderId={settingsSelectedProviderId}
            sidebarColumnWidth={settingsSidebarColumnWidth}
            appearanceMode={appearanceMode}
            resolvedAppearanceMode={resolvedAppearanceMode}
            themeAccent={themeAccent}
            onAbort={handleAbort}
            onBackToApp={exitSettingsRoute}
            onDisconnect={handleDisconnect}
            onAppearanceModeChange={setAppearanceMode}
            onProviderDraftChange={updateProviderDraft}
            onSaveProvider={handleSaveProviderDraft}
            onSelectProvider={(providerId) => setSettingsProviderId(providerId)}
            onThemeAccentChange={setThemeAccent}
          />
        </StandaloneSettingsShell>
      ) : (
        <main className="relative flex h-[100dvh] overflow-hidden text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12%] top-[-18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--app-glow-left),transparent_72%)] blur-3xl" />
        <div className="absolute right-[-10%] top-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,var(--app-glow-right),transparent_72%)] blur-3xl" />
      </div>

      <div
        data-no-window-drag="true"
        className="absolute z-30 flex items-center gap-1.5"
        style={{
          left: `${chromeControlGroupLeft}px`,
          top: `${chromeControlGroupTop}px`,
        }}
      >
        <ToolbarButton
          label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </ToolbarButton>
        <ToolbarButton label="后退" onClick={() => window.history.back()}>
          <ArrowLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="前进" onClick={() => window.history.forward()}>
          <ArrowRight className="size-3.5" />
        </ToolbarButton>
      </div>

      <ResizablePanelGroup
        className="relative z-10 h-full flex-1"
        defaultLayout={sidebarLayout}
        onLayoutChanged={handleSidebarLayoutChange}
        orientation="horizontal"
      >
        <ResizablePanel
          id="pitest-sidebar-panel"
          panelRef={sidebarPanelRef}
          className="h-full min-w-0"
          collapsible
          collapsedSize={`${COLLAPSED_SIDEBAR_WIDTH}px`}
          groupResizeBehavior="preserve-pixel-size"
          maxSize={MAX_SIDEBAR_SIZE}
          minSize="220px"
          onResize={handleSidebarResize}
        >
          <aside
            className="app-sidebar-panel relative z-10 flex h-full min-w-0 flex-col overflow-hidden"
          >
            <div
              data-tauri-drag-region
              className="h-[52px] shrink-0 select-none"
            />

            <div className="auto-fade-scrollbar min-h-0 flex-1 overflow-y-auto" onScroll={handleScrollableAreaScroll}>
              <div className={cn("pb-2", sidebarCollapsed ? "px-1" : "px-2")}>
                <nav className="space-y-1">
                  {sidebarRoutes.map((item) => (
                    <SidebarNavItem
                      key={item.key}
                      collapsed={sidebarCollapsed}
                      icon={item.icon}
                      label={item.label}
                      active={sidebarActiveKey === item.key}
                      onClick={() => {
                        if (item.key === "new") {
                          createAndOpenSession();
                          return;
                        }
                        navigate({ kind: item.key });
                      }}
                    />
                  ))}
                </nav>
              </div>

              {!sidebarCollapsed ? (
                <div className="border-t border-white/50 pt-3 dark:border-white/10">
                  <div className="flex items-center justify-between px-3 pb-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                        Sessions
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                        本地最近会话
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(chromeButtonClassName, "size-7 rounded-[0.8rem]")}
                      onClick={() => createAndOpenSession()}
                    >
                      <SquarePen className="size-3.5" />
                    </button>
                  </div>

                  <div className="px-2 pb-3">
                    {showSessionListLoading ? (
                      <SidebarSessionsSkeleton />
                    ) : sortedSessions.length === 0 ? (
                      <div className="rounded-[0.95rem] border border-white/70 bg-white/58 px-3 py-3 text-[12px] leading-5 text-slate-500 shadow-[0_8px_20px_rgba(52,72,112,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:text-slate-400">
                        还没有会话
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {sortedSessions.map((session) => (
                          <SessionListItem
                            key={session.id}
                            active={activeSessionId === session.id && routeState.kind === "chat"}
                            collapsed={sidebarCollapsed}
                            session={session}
                            onClick={() => navigate({ kind: "chat", sessionId: session.id })}
                            onDelete={() => requestDeleteSession(session)}
                            onRename={() => void handleRenameSession(session)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={cn("border-t border-white/50 py-2 dark:border-white/10", sidebarCollapsed ? "px-1" : "px-2")}>
              <SidebarNavItem
                collapsed={sidebarCollapsed}
                icon={bottomSidebarRoute.icon}
                label={bottomSidebarRoute.label}
                active={sidebarActiveKey === bottomSidebarRoute.key}
                onClick={() => navigate({ kind: "settings" })}
              />
            </div>
          </aside>
        </ResizablePanel>

        <ResizableHandle className="data-[orientation=horizontal]:mx-0.5" />

        <ResizablePanel
          id="pitest-main-panel"
          className="h-full min-w-0"
          minSize={MIN_MAIN_PANEL_SIZE}
        >
          <section className="app-shell-panel relative z-10 ml-[5px] flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[20px] rounded-r-none">
            <header
              data-tauri-drag-region
              className="app-shell-header relative h-[52px] shrink-0"
            >
              <div
                className={cn(
                  "pointer-events-none relative z-10 flex h-full items-center pr-2.5",
                )}
                style={{
                  paddingLeft: sidebarCollapsed ? `${collapsedHeaderPadding}px` : "10px",
                }}
              >
                <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3 px-1 select-none">
                  {headerSessionTitle ? (
                    <>
                      <span className="max-w-[240px] truncate text-[13px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                        {headerSessionTitle}
                      </span>
                      <span className="h-4 w-px shrink-0 bg-slate-200/90 dark:bg-white/12" />
                    </>
                  ) : null}
                  <Breadcrumbs items={breadcrumbs} />
                </div>

                <div
                  className="pointer-events-auto flex min-w-0 shrink-0 items-center gap-1.5"
                  data-no-window-drag="true"
                >
                  {isChatRoute ? (
                    <ToolbarButton
                      active={terminalVisible}
                      label={terminalVisible ? "隐藏终端" : "打开终端"}
                      onClick={toggleTerminal}
                    >
                      <SquareTerminal className="size-3.5" />
                    </ToolbarButton>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="app-content-surface flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {routeState.kind === "activity" ? (
                <ActivityRoute
                  activeSessionId={activeSessionId}
                  connectionLabel={connectionLabel}
                  isBusy={isBusy}
                  onClearLogs={handleClearLogs}
                  onDeleteSession={requestDeleteSession}
                  onExportLogs={handleExportLogs}
                  onOpenSession={(sessionId) => navigate({ kind: "chat", sessionId })}
                  onRenameSession={handleRenameSession}
                  runtimeSnapshot={runtimeSnapshot}
                  sessions={sortedSessions}
                />
              ) : null}

              {routeState.kind === "skills" ? (
                <SkillsRoute
                  actionError={skillsActionError}
                  loading={skillsLoading}
                  error={skillsError}
                  query={skillsQuery}
                  selectedSkillId={selectedSkillId}
                  skills={installedSkills}
                  onOpenSkillFile={handleOpenSkillFile}
                  onQueryChange={setSkillsQuery}
                  onRefresh={() => void loadSkills(true)}
                  onRevealSkillFolder={handleRevealSkillFolder}
                  onSelectSkill={setSelectedSkillId}
                />
              ) : null}

              {isChatRoute ? (
                <ChatRoute
                  canSend={isConnected && activeSessionId === liveSessionId}
                  chatTerminalLayout={chatTerminalLayout}
                  composerAttachments={composerAttachments}
                  composer={composer}
                  composerRef={composerRef}
                  connectionLabel={connectionLabel}
                  contextLimit={viewedContextLimit}
                  currentModel={viewedModel || modelLabel}
                  currentProvider={viewedProvider}
                  diagnostics={diagnostics}
                  feedIsNearBottom={feedIsNearBottom}
                  hasProviderCredential={(providerId) =>
                    Boolean(providerDrafts[providerId]?.hasStoredCredential)
                  }
                  isBusy={isBusy}
                  isConnected={isConnected}
                  isCompacting={Boolean(sessionState?.isCompacting)}
                  isLiveSession={activeSessionId === liveSessionId}
                  hasUnreadBelow={hasUnreadBelow}
                  loading={showChatLoading}
                  messages={messages}
                  feedRef={feedRef}
                  modelOptions={providerOptions}
                  modelPickerBusy={showChatLoading || connectionStatus === "connecting" || isBusy}
                  onAddFiles={handleAddComposerFiles}
                  onAbort={handleAbort}
                  onFeedScroll={handleFeedScroll}
                  onChatTerminalLayoutChange={handleChatTerminalLayoutChange}
                  onComposerChange={setComposer}
                  onComposerKeyDown={handleComposerKeyDown}
                  onGoSettings={() => navigate({ kind: "settings" })}
                  onModelSelect={handleQuickModelChange}
                  onReconnect={() =>
                    connectPi(
                      {
                        workspacePath,
                        provider,
                        model,
                        apiKeyEnvName,
                      },
                      {
                        preserveMessages: true,
                        appendSystemNotice: "PI RPC 已根据最新配置重新连接。",
                        targetSessionId: activeSessionId,
                        targetSessionTitle: activeSession?.title ?? null,
                      },
                    )
                  }
                  onRemoveAttachment={(path) =>
                    setComposerAttachments((currentAttachments) =>
                      currentAttachments.filter((attachment) => attachment.path !== path),
                    )
                  }
                  onSend={handleSend}
                  onScrollToBottom={() => scrollFeedToBottom("smooth")}
                  onStarterPrompt={applyStarterPrompt}
                  onTerminalError={(message) => {
                    setConnectionError(message);
                    setTerminalVisible(false);
                  }}
                  sessionTitle={activeSession?.title ?? "New Session"}
                  terminalVisible={terminalVisible}
                  terminalTheme={terminalTheme}
                  terminalWorkspacePath={terminalWorkspace}
                  usage={usage}
                />
              ) : null}
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
        </main>
      )}

      <AlertDialog
        open={Boolean(pendingDeleteSession)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteSession(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
              <Trash2 className="size-3.5" />
              删除会话
            </div>
            <AlertDialogTitle>
              删除 “{pendingDeleteSession?.title ?? "当前会话"}”？
            </AlertDialogTitle>
            <AlertDialogDescription>
              会话正文、日志和统计会一起从当前 workspace 中移除，这个动作不能撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={secondaryButtonClassName}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                primaryButtonClassName,
                "bg-[linear-gradient(135deg,#ef4444,#fb7185)] shadow-[0_10px_24px_rgba(239,68,68,0.2)] hover:brightness-105",
              )}
              onClick={(event) => {
                event.preventDefault();
                const targetSession = pendingDeleteSession;
                setPendingDeleteSession(null);
                if (!targetSession) {
                  return;
                }
                void handleDeleteSession(targetSession);
              }}
            >
              删除会话
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {typeof document !== "undefined"
        ? createPortal(
            <>
              {toasts.map((toast) => (
                <Toast
                  key={toast.id}
                  open
                  onOpenChange={(open) => {
                    if (!open) {
                      dismissToast(toast.id);
                    }
                  }}
                  duration={2800}
                  className={cn(
                    toast.tone === "success" &&
                      "border-emerald-100/90 bg-[linear-gradient(180deg,rgba(240,253,244,0.98),rgba(236,253,245,0.94))] dark:border-emerald-500/25 dark:bg-[linear-gradient(180deg,rgba(6,78,59,0.88),rgba(6,95,70,0.76))]",
                    toast.tone === "error" &&
                      "border-rose-100/90 bg-[linear-gradient(180deg,rgba(255,241,242,0.98),rgba(255,245,245,0.94))] dark:border-rose-500/25 dark:bg-[linear-gradient(180deg,rgba(127,29,29,0.82),rgba(136,19,55,0.74))]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/85 bg-white/88 text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.08)] dark:border-white/12 dark:bg-white/10 dark:text-slate-300",
                        toast.tone === "success" && "text-emerald-600 dark:text-emerald-300",
                        toast.tone === "error" && "text-rose-600 dark:text-rose-300",
                        toast.tone === "info" && "text-[color:var(--app-accent-text)]",
                      )}
                    >
                      {toast.tone === "success" ? (
                        <Check className="size-4" />
                      ) : toast.tone === "error" ? (
                        <TriangleAlert className="size-4" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <ToastTitle>{toast.title}</ToastTitle>
                      {toast.description ? (
                        <ToastDescription>{toast.description}</ToastDescription>
                      ) : null}
                    </div>
                    <ToastClose />
                  </div>
                </Toast>
              ))}
              <ToastViewport />
            </>,
            document.body,
          )
        : null}
      </ToastProvider>
    </TooltipProvider>
  );
}

function SidebarSessionsSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[0.95rem] border border-white/68 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton-shimmer h-3.5 w-28 rounded-full" />
              <div className="skeleton-shimmer h-3 w-40 rounded-full" />
            </div>
            <div className="skeleton-shimmer mt-0.5 h-3 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MainRouteLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full border border-white/82 bg-white/74 text-[color:var(--app-accent-text)] shadow-[0_16px_40px_var(--app-shadow-strong)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/8">
          <LoaderCircle className="size-4.5 animate-spin" />
        </span>
        <div className="space-y-1">
          <p className="text-[13px] font-semibold tracking-[-0.02em] text-slate-700 dark:text-slate-100">
            正在同步会话
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">右侧内容准备好后会直接出现。</p>
        </div>
      </div>
    </div>
  );
}

function ChatRoute({
  canSend,
  chatTerminalLayout,
  composerAttachments,
  composer,
  composerRef,
  connectionLabel,
  contextLimit,
  currentModel,
  currentProvider,
  diagnostics,
  feedIsNearBottom,
  hasProviderCredential,
  isBusy,
  isCompacting,
  isConnected,
  isLiveSession,
  hasUnreadBelow,
  loading,
  messages,
  feedRef,
  modelOptions,
  modelPickerBusy,
  onAddFiles,
  onAbort,
  onFeedScroll,
  onChatTerminalLayoutChange,
  onComposerChange,
  onComposerKeyDown,
  onGoSettings,
  onModelSelect,
  onReconnect,
  onRemoveAttachment,
  onSend,
  onScrollToBottom,
  onStarterPrompt,
  onTerminalError,
  sessionTitle,
  terminalVisible,
  terminalTheme,
  terminalWorkspacePath,
  usage,
}: {
  canSend: boolean;
  chatTerminalLayout: Record<string, number>;
  composerAttachments: ComposerAttachment[];
  composer: string;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  connectionLabel: string;
  contextLimit: number;
  currentModel: string;
  currentProvider: string;
  diagnostics: PiDiagnosticsState;
  feedIsNearBottom: boolean;
  hasProviderCredential: (providerId: string) => boolean;
  isBusy: boolean;
  isCompacting: boolean;
  isConnected: boolean;
  isLiveSession: boolean;
  hasUnreadBelow: boolean;
  loading: boolean;
  messages: UiMessage[];
  feedRef: React.RefObject<HTMLDivElement | null>;
  modelOptions: PiProviderCatalogEntry[];
  modelPickerBusy: boolean;
  onAddFiles: () => Promise<void>;
  onAbort: () => Promise<void>;
  onFeedScroll: (event: UIEvent<HTMLDivElement>) => void;
  onChatTerminalLayoutChange: (layout: Record<string, number>) => void;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onGoSettings: () => void;
  onModelSelect: (providerEntry: PiProviderCatalogEntry, modelId: string) => Promise<void>;
  onReconnect: () => Promise<void>;
  onRemoveAttachment: (path: string) => void;
  onSend: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onScrollToBottom: () => void;
  onStarterPrompt: (prompt: string) => void;
  onTerminalError: (message: string) => void;
  sessionTitle: string;
  terminalVisible: boolean;
  terminalTheme: AppTerminalTheme;
  terminalWorkspacePath: string;
  usage: PiUsageSummary;
}) {
  const contextUsage = buildContextUsageMeta(usage, contextLimit);
  const taskRunning = isBusy || isCompacting;
  const modelChipLabel = formatComposerModelLabel(currentModel);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuSearchRef = useRef<HTMLInputElement | null>(null);
  const modelMenuResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuQuery, setModelMenuQuery] = useState("");
  const [modelMenuLayout, setModelMenuLayout] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top: number | null;
    bottom: number | null;
  }>({
    left: 16,
    width: 360,
    maxHeight: 320,
    top: null,
    bottom: 80,
  });
  const syncModelMenuLayout = useEffectEvent(() => {
    const trigger = modelButtonRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const preferredWidth = Math.min(420, Math.max(320, rect.width + 140));
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
    const left = clamp(
      rect.left,
      viewportPadding,
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    );
    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const openUpwards = spaceAbove >= 260 || spaceAbove >= spaceBelow;
    const maxHeight = Math.max(
      180,
      Math.min(360, (openUpwards ? spaceAbove : spaceBelow) - 12),
    );

    setModelMenuLayout((current) => {
      const next = {
        left,
        width,
        maxHeight,
        top: openUpwards ? null : rect.bottom + 10,
        bottom: openUpwards ? window.innerHeight - rect.top + 10 : null,
      };

      if (
        current.left === next.left &&
        current.width === next.width &&
        current.maxHeight === next.maxHeight &&
        current.top === next.top &&
        current.bottom === next.bottom
      ) {
        return current;
      }

      return next;
    });
  });

  const toggleModelMenu = useEffectEvent(() => {
    if (modelMenuOpen) {
      setModelMenuOpen(false);
      setModelMenuQuery("");
      return;
    }

    syncModelMenuLayout();
    setModelMenuQuery("");
    setModelMenuOpen(true);
  });

  useEffect(() => {
    if (!modelMenuOpen) {
      modelMenuResizeObserverRef.current?.disconnect();
      modelMenuResizeObserverRef.current = null;
      return;
    }

    syncModelMenuLayout();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (modelMenuRef.current?.contains(target) || modelButtonRef.current?.contains(target))
      ) {
        return;
      }

      setModelMenuOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
      }
    };

    const handleViewportChange = () => {
      syncModelMenuLayout();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    if (typeof ResizeObserver !== "undefined" && modelButtonRef.current) {
      const observer = new ResizeObserver(() => {
        syncModelMenuLayout();
      });
      observer.observe(modelButtonRef.current);
      modelMenuResizeObserverRef.current = observer;
    }

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      modelMenuResizeObserverRef.current?.disconnect();
      modelMenuResizeObserverRef.current = null;
    };
  }, [modelMenuOpen, syncModelMenuLayout]);

  useEffect(() => {
    if (!modelMenuOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      modelMenuSearchRef.current?.focus();
      modelMenuSearchRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!loading && !modelPickerBusy) {
      return;
    }

    setModelMenuOpen(false);
    setModelMenuQuery("");
  }, [loading, modelPickerBusy]);

  const normalizedModelMenuQuery = modelMenuQuery.trim().toLowerCase();
  const visibleModelSections = [...modelOptions]
    .sort((left, right) => {
      const leftConfigured = hasProviderCredential(left.provider);
      const rightConfigured = hasProviderCredential(right.provider);
      if (leftConfigured !== rightConfigured) {
        return leftConfigured ? -1 : 1;
      }

      const leftCurrent = left.provider === currentProvider;
      const rightCurrent = right.provider === currentProvider;
      if (leftCurrent !== rightCurrent) {
        return leftCurrent ? -1 : 1;
      }

      return left.label.localeCompare(right.label, "zh-Hans-CN");
    })
    .map((providerEntry) => {
      if (!normalizedModelMenuQuery) {
        return {
          providerEntry,
          models: providerEntry.models,
        };
      }

      const providerMatches = buildModelMenuSearchText(providerEntry).includes(
        normalizedModelMenuQuery,
      );
      const matchedModels = providerMatches
        ? providerEntry.models
        : providerEntry.models.filter((candidate) =>
            buildModelMenuSearchText(providerEntry, candidate).includes(
              normalizedModelMenuQuery,
            ),
          );

      if (matchedModels.length === 0) {
        return null;
      }

      return {
        providerEntry,
        models: matchedModels,
      };
    })
    .filter(Boolean) as Array<{
    providerEntry: PiProviderCatalogEntry;
    models: PiProviderCatalogEntry["models"];
  }>;

  const chatContent = (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={feedRef}
        onScroll={onFeedScroll}
        className="auto-fade-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        <div
          className={cn(
            "mx-auto w-full max-w-4xl",
            loading || messages.length === 0
              ? "flex min-h-full flex-col justify-center"
              : "flex flex-col gap-3",
          )}
        >
          {loading ? (
            <MainRouteLoading />
          ) : null}

          {!loading && messages.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                {sessionTitle}
              </p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-50">
                开始一个新的任务
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-[14px] leading-7 text-slate-500 dark:text-slate-400">
                当前状态：{connectionLabel}。给 Agent 一句清晰的目标，它会直接开始工作。
              </p>

              {!isConnected ? (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={onGoSettings}
                  >
                    去 Settings
                  </button>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-white/76 bg-white/72 px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-[0_8px_20px_rgba(52,72,112,0.07)] transition hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12"
                    onClick={() => onStarterPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>

      <form className="relative border-t border-white/55 px-3 py-1.5 dark:border-white/10" onSubmit={onSend}>
        {!feedIsNearBottom ? (
          <button
            type="button"
            className="absolute left-1/2 top-0 z-20 inline-flex -translate-x-1/2 -translate-y-[calc(100%+14px)] items-center gap-2 rounded-full border border-white/88 bg-white/92 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_14px_32px_rgba(41,62,107,0.18)] backdrop-blur-2xl transition hover:bg-white dark:border-white/12 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/12"
            onClick={onScrollToBottom}
          >
            <ArrowDown className="size-3.5" />
            回到底部
            {hasUnreadBelow ? <span className="inline-flex size-1.5 rounded-full bg-[var(--app-accent-solid)]" /> : null}
          </button>
        ) : null}

        <div className="mx-auto w-full max-w-4xl">
          <div className="rounded-[1.25rem] border border-slate-200/80 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.055)] dark:border-white/10 dark:bg-white/6 dark:shadow-[0_12px_24px_rgba(2,6,23,0.28)]">
            <div className="relative min-w-0">
              <textarea
                ref={composerRef}
                className={textareaClassName}
                value={composer}
                onChange={(event) => onComposerChange(event.currentTarget.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={
                  loading
                    ? "正在恢复当前会话…"
                    : isConnected
                      ? isLiveSession
                        ? "要求后续变更"
                        : "当前是历史 session，等待切回 live runtime"
                      : "先去 Settings 确认 Provider 与 API Key"
                }
                disabled={loading || !canSend}
              />
            </div>

            {composerAttachments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-3 pb-1">
                {composerAttachments.map((attachment) => (
                  <MaybeTooltip key={attachment.path} content={attachment.path}>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">
                      <FileText className="size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate">{attachment.label}</span>
                      <MaybeTooltip content={`移除 ${attachment.label}`}>
                        <button
                          type="button"
                          className="inline-flex size-4 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/12 dark:hover:text-slate-200"
                          onClick={() => onRemoveAttachment(attachment.path)}
                        >
                          <X className="size-3" />
                        </button>
                      </MaybeTooltip>
                    </span>
                  </MaybeTooltip>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-1.5 px-2.5 pb-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <MaybeTooltip content="添加文件">
                  <button
                    type="button"
                    className={cn(composerChipButtonClassName, "w-[30px] justify-center px-0 text-slate-400 dark:text-slate-400")}
                    onClick={() => void onAddFiles()}
                  >
                    <Plus className="size-4.5" />
                  </button>
                </MaybeTooltip>
                <div className="relative">
                  <MaybeTooltip content="选择模型" disabled={modelMenuOpen}>
                    <button
                      ref={modelButtonRef}
                      type="button"
                      className={cn(composerChipButtonClassName, "min-w-0")}
                      onClick={toggleModelMenu}
                      disabled={modelOptions.length === 0 || modelPickerBusy}
                    >
                      <ProviderGlyph provider={currentProvider} size={16} />
                      <span className="truncate">{modelChipLabel}</span>
                      <ChevronDown className="size-4 text-slate-400 dark:text-slate-500" />
                    </button>
                  </MaybeTooltip>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <MaybeTooltip content="语音输入稍后提供">
                  <button
                    type="button"
                    className={cn(composerChipButtonClassName, "w-[30px] justify-center px-0 text-slate-400 dark:text-slate-400")}
                    disabled
                  >
                    <Mic className="size-4" />
                  </button>
                </MaybeTooltip>
                <MaybeTooltip content={taskRunning ? "停止当前任务" : "发送"}>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-[34px] items-center justify-center rounded-full text-white shadow-[0_8px_18px_var(--app-shadow-chrome)] transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:bg-none disabled:shadow-none dark:disabled:bg-white/12",
                      taskRunning
                        ? "bg-[linear-gradient(135deg,#ff6b6b,#ef4444)] hover:brightness-105"
                        : "theme-primary-button hover:brightness-105",
                    )}
                    disabled={
                      loading ||
                      (taskRunning
                        ? false
                        : !canSend ||
                          (composer.trim().length === 0 && composerAttachments.length === 0))
                    }
                    onClick={() => {
                      if (taskRunning) {
                        void onAbort();
                        return;
                      }

                      void onSend();
                    }}
                  >
                    {taskRunning ? <X className="size-4" /> : <ArrowUp className="size-4" />}
                  </button>
                </MaybeTooltip>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/55 px-3 py-2 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/72 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-[0_6px_16px_rgba(52,72,112,0.06)] dark:border-white/12 dark:bg-white/8 dark:text-slate-200">
              <ProviderGlyph provider={currentProvider} size={14} />
              <span className="truncate">{currentModel || "未选择模型"}</span>
            </span>
            <MicroBadge tone={contextUsage.tone} text={contextUsage.label} />
            <MicroBadge tone={isConnected ? "connected" : "idle"} text={connectionLabel} />
            {isCompacting ? <MicroBadge tone="busy" text="压缩中" /> : null}
            {diagnostics.stderrCount > 0 ? (
              <MicroBadge tone="neutral" text={`stderr ${diagnostics.stderrCount}`} />
            ) : null}
            {diagnostics.errorCount > 0 ? (
              <MicroBadge tone="error" text={`errors ${diagnostics.errorCount}`} />
            ) : null}
            {isConnected && !isLiveSession ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/84 px-3 py-1.5 text-[11px] font-semibold text-amber-700 shadow-[0_6px_16px_rgba(251,191,36,0.12)] dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-200">
                <TriangleAlert className="size-3.5" />
                当前正在查看历史 session，发送前请重新连接它
              </span>
            ) : null}
          </div>
          <MaybeTooltip content="重新连接当前会话">
            <button
              type="button"
              className="ml-auto inline-flex size-[28px] shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100/80 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
              onClick={() => void onReconnect()}
              disabled={loading}
            >
              <RefreshCw className={cn("size-4", connectionLabel === "连接中" && "animate-spin")} />
            </button>
          </MaybeTooltip>
        </div>
      </div>

      {modelMenuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={modelMenuRef}
              className="fixed z-[80] overflow-hidden rounded-[1rem] border border-white/80 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-surface-tint-strong)_97%,white_3%),color-mix(in_srgb,var(--app-surface-tint)_92%,white_8%))] shadow-[0_24px_60px_var(--app-shadow-strong)] backdrop-blur-2xl"
              style={{
                left: modelMenuLayout.left,
                width: modelMenuLayout.width,
                maxHeight: modelMenuLayout.maxHeight,
                top: modelMenuLayout.top ?? undefined,
                bottom: modelMenuLayout.bottom ?? undefined,
              }}
            >
              <div className="border-b border-slate-200/80 px-3 py-2.5 dark:border-white/10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  切换模型
                </p>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    ref={modelMenuSearchRef}
                    type="text"
                    value={modelMenuQuery}
                    onChange={(event) => setModelMenuQuery(event.currentTarget.value)}
                    placeholder="搜索 Provider 或模型"
                    className={cn(fieldClassName, "h-9 pl-9")}
                  />
                </div>
              </div>
              <div className="auto-fade-scrollbar overflow-y-auto p-2" style={{ maxHeight: modelMenuLayout.maxHeight }}>
                {visibleModelSections.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">没有找到匹配的模型</p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      试试搜索 provider 名称、模型 ID 或能力关键词
                    </p>
                  </div>
                ) : (
                  visibleModelSections.map(({ providerEntry, models }) => {
                    const providerSelected = providerEntry.provider === currentProvider;
                    const providerReady =
                      providerEntry.provider === currentProvider ||
                      hasProviderCredential(providerEntry.provider);
                  return (
                    <div key={providerEntry.provider} className="pb-2 last:pb-0">
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <ProviderGlyph provider={providerEntry.provider} size={14} />
                          <span>{providerEntry.label}</span>
                        </div>
                        {providerReady && providerEntry.provider !== currentProvider ? (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                            已配置
                          </span>
                        ) : null}
                        {!providerReady ? (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-300">
                            先配置 API Key
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {models.map((candidate) => {
                          const isSelected =
                            providerEntry.provider === currentProvider &&
                            candidate.id === currentModel;
                          return (
                            <button
                              key={`${providerEntry.provider}:${candidate.id}`}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[0.9rem] px-2.5 py-2 text-left transition",
                                isSelected
                                  ? "bg-[var(--app-accent-soft)] text-[color:var(--app-accent-text-strong)]"
                                  : providerReady
                                    ? "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/8"
                                    : "cursor-not-allowed text-slate-400 dark:text-slate-500",
                              )}
                              disabled={!providerReady}
                              onClick={() => {
                                setModelMenuOpen(false);
                                setModelMenuQuery("");
                                void onModelSelect(providerEntry, candidate.id);
                              }}
                            >
                              <span
                                className={cn(
                                  "inline-flex size-4 items-center justify-center rounded-full border",
                                  isSelected
                                    ? "border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft-strong)] text-[color:var(--app-accent-text)]"
                                    : providerSelected
                                      ? "border-slate-200 bg-white text-slate-300 dark:border-white/12 dark:bg-white/10 dark:text-slate-500"
                                      : "border-transparent bg-transparent text-transparent",
                                )}
                              >
                                <Check className="size-3" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-medium">
                                  {candidate.id}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {formatModelCapabilityLabel(candidate)}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      {terminalVisible ? (
        <ResizablePanelGroup
          className="min-h-0 flex-1"
          defaultLayout={chatTerminalLayout}
          onLayoutChanged={onChatTerminalLayoutChange}
          orientation="vertical"
        >
          <ResizablePanel
            id="pitest-chat-main-panel"
            className="min-h-0"
            minSize="360px"
          >
            {chatContent}
          </ResizablePanel>

          <ResizableHandle className="border-t border-white/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.18))] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.28))] data-[orientation=vertical]:mx-0 data-[orientation=vertical]:h-3" />

          <ResizablePanel
            id="pitest-chat-terminal-panel"
            className="min-h-0"
            minSize="180px"
          >
            <div className="flex h-full min-h-0 flex-col pt-2">
              <EmbeddedTerminal
                visible
                variant="panel"
                workspacePath={terminalWorkspacePath}
                onError={onTerminalError}
                theme={terminalTheme}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        chatContent
      )}
    </div>
  );
}

function ActivityRoute({
  activeSessionId,
  connectionLabel,
  isBusy,
  onClearLogs,
  onDeleteSession,
  onExportLogs,
  onOpenSession,
  onRenameSession,
  runtimeSnapshot,
  sessions,
}: {
  activeSessionId: string | null;
  connectionLabel: string;
  isBusy: boolean;
  onClearLogs: (session: StoredSession) => Promise<void>;
  onDeleteSession: (session: StoredSession) => void;
  onExportLogs: (filter: PiLogFilter) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
  onRenameSession: (session: StoredSession) => Promise<void>;
  runtimeSnapshot: PiRuntimeSnapshot | null;
  sessions: StoredSession[];
}) {
  const [query, setQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [currentEventPage, setCurrentEventPage] = useState(1);

  const scopedEvents =
    sessionFilter === "all"
      ? sessions.flatMap((session) => session.events)
      : sessions.find((session) => session.id === sessionFilter)?.events ?? [];
  const filteredEvents = scopedEvents.filter((event) => {
    if (severityFilter !== "all" && event.severity !== severityFilter) {
      return false;
    }
    if (kindFilter !== "all" && event.kind !== kindFilter) {
      return false;
    }
    if (!query.trim()) {
      return true;
    }
    const searchValue = query.trim().toLowerCase();
    return (
      event.summary.toLowerCase().includes(searchValue) ||
      event.kind.toLowerCase().includes(searchValue) ||
      event.source.toLowerCase().includes(searchValue) ||
      JSON.stringify(event.payload ?? {}).toLowerCase().includes(searchValue)
    );
  });
  const totalInputTokens = sumSessionUsageValue(sessions, "input");
  const totalOutputTokens = sumSessionUsageValue(sessions, "output");
  const totalTokens = sumSessionUsageValue(sessions, "totalTokens");
  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / ACTIVITY_EVENT_PAGE_SIZE));
  const safeCurrentEventPage = Math.min(currentEventPage, totalEventPages);
  const visibleEvents = filteredEvents.slice(
    (safeCurrentEventPage - 1) * ACTIVITY_EVENT_PAGE_SIZE,
    safeCurrentEventPage * ACTIVITY_EVENT_PAGE_SIZE,
  );
  const paginationItems = buildPaginationItems(safeCurrentEventPage, totalEventPages);

  useEffect(() => {
    setCurrentEventPage(1);
  }, [kindFilter, query, sessionFilter, severityFilter]);

  return (
    <div
      className="auto-fade-scrollbar flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
      onScroll={(event) => activateAutoScrollbar(event.currentTarget)}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="状态" value={connectionLabel} />
          <SummaryCard label="执行中" value={isBusy ? "是" : "否"} />
          <SummaryCard label="Input Tokens" value={formatUsageValue(totalInputTokens)} />
          <SummaryCard label="Output Tokens" value={formatUsageValue(totalOutputTokens)} />
          <SummaryCard label="Total Tokens" value={formatUsageValue(totalTokens)} />
          <SummaryCard label="Live Session" value={runtimeSnapshot?.sessionName || runtimeSnapshot?.sessionId || "未绑定"} mono />
          <SummaryCard label="Workspace" value={runtimeSnapshot?.workspacePath || "未连接"} mono />
          <SummaryCard label="Provider / Model" value={`${runtimeSnapshot?.provider || "—"} · ${runtimeSnapshot?.model || "—"}`} mono />
        </div>

        <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="glass-panel-strong rounded-[1rem] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <SectionEyebrow label="Sessions" />
                <p className="mt-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">管理会话</p>
              </div>
              <button type="button" className={secondaryButtonClassName} onClick={() => onExportLogs({
                sessionId: sessionFilter === "all" ? undefined : sessionFilter,
                severity: severityFilter === "all" ? undefined : severityFilter,
                kind: kindFilter === "all" ? undefined : kindFilter,
                query: query.trim() || undefined,
              })}>
                <Download className="size-4" />
                导出日志
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    "rounded-[0.95rem] border px-3 py-3 shadow-[0_8px_20px_rgba(52,72,112,0.08)]",
                    activeSessionId === session.id ? "theme-accent-surface-soft" : "border-white/72 bg-white/60 dark:border-white/10 dark:bg-white/6",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => onOpenSession(session.id)}>
                      <div className="flex items-center gap-2">
                        <ProviderGlyph provider={session.provider} size={16} />
                        <p className="line-clamp-1 text-[12px] font-semibold text-slate-900 dark:text-slate-100">{session.title}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {session.provider || "provider 未设置"}
                        {session.model ? ` · ${session.model}` : ""}
                      </p>
                    </button>

                    <div className="flex items-center gap-1">
                      <MaybeTooltip content="重命名">
                        <button type="button" className={chromeButtonClassName} onClick={() => void onRenameSession(session)}>
                          <PencilLine className="size-3.5" />
                        </button>
                      </MaybeTooltip>
                      <MaybeTooltip content="清空日志">
                        <button type="button" className={chromeButtonClassName} onClick={() => void onClearLogs(session)}>
                          <RefreshCw className="size-3.5" />
                        </button>
                      </MaybeTooltip>
                      <MaybeTooltip content="删除会话">
                        <button
                          type="button"
                          className={chromeButtonClassName}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onDeleteSession(session);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </MaybeTooltip>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <MicroBadge tone="neutral" text={session.runtimeState} />
                    <MicroBadge tone="neutral" text={`msg ${session.messages.length}`} />
                    <MicroBadge tone="neutral" text={`events ${session.events.length}`} />
                    <MicroBadge tone={session.diagnostics.errorCount > 0 ? "error" : "neutral"} text={`errors ${session.diagnostics.errorCount}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel-strong rounded-[1rem] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  className={cn(fieldClassName, "pl-10")}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="搜索日志 / 工具 / stderr / 错误"
                />
              </div>
              <LogFilterSelect value={sessionFilter} onValueChange={setSessionFilter} placeholder="全部会话">
                <SelectItem value="all">全部会话</SelectItem>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.title}
                  </SelectItem>
                ))}
              </LogFilterSelect>
              <LogFilterSelect value={severityFilter} onValueChange={setSeverityFilter} placeholder="全部严重度">
                <SelectItem value="all">全部严重度</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warning">warning</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </LogFilterSelect>
              <LogFilterSelect value={kindFilter} onValueChange={setKindFilter} placeholder="全部事件">
                <SelectItem value="all">全部事件</SelectItem>
                <SelectItem value="prompt">prompt</SelectItem>
                <SelectItem value="tool_call">tool_call</SelectItem>
                <SelectItem value="tool_start">tool_start</SelectItem>
                <SelectItem value="tool_end">tool_end</SelectItem>
                <SelectItem value="auto_compaction_start">auto_compaction_start</SelectItem>
                <SelectItem value="auto_compaction_end">auto_compaction_end</SelectItem>
                <SelectItem value="stderr">stderr</SelectItem>
                <SelectItem value="runtime_error">runtime_error</SelectItem>
              </LogFilterSelect>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 px-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                第 {safeCurrentEventPage} / {totalEventPages} 页 · 共 {filteredEvents.length} 条日志
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {filteredEvents.length === 0 ? (
                <div className="rounded-[0.95rem] border border-white/72 bg-white/60 px-4 py-4 text-[13px] leading-6 text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
                  当前筛选条件下没有日志。
                </div>
              ) : (
                visibleEvents.map((event) => (
                  <div key={event.id} className="rounded-[0.95rem] border border-white/72 bg-white/62 px-3 py-3 shadow-[0_8px_20px_rgba(52,72,112,0.08)] dark:border-white/10 dark:bg-white/6">
                    <div className="flex flex-wrap items-center gap-2">
                      <MicroBadge tone={event.severity === "error" ? "error" : event.severity === "warning" ? "busy" : "neutral"} text={event.kind} />
                      <MicroBadge tone="neutral" text={event.source} />
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatSessionTime(event.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-slate-700 dark:text-slate-200">{event.summary}</p>
                    {event.payload ? (
                      <details className="mt-2 rounded-[0.9rem] border border-white/70 bg-white/52 px-3 py-2 dark:border-white/10 dark:bg-white/4">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Raw Payload
                        </summary>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {filteredEvents.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
                <MaybeTooltip content="上一页" disabled={safeCurrentEventPage > 1}>
                  <button
                    type="button"
                    className={cn(chromeButtonClassName, "size-8")}
                    onClick={() => setCurrentEventPage((current) => Math.max(1, current - 1))}
                    disabled={safeCurrentEventPage <= 1}
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                </MaybeTooltip>

                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="inline-flex h-8 min-w-[2rem] items-center justify-center px-2 text-[11px] font-medium text-slate-400 dark:text-slate-500"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-[0.8rem] border px-2.5 text-[11px] font-semibold transition",
                        item === safeCurrentEventPage
                          ? "theme-accent-surface text-[color:var(--app-accent-text-strong)]"
                          : "border-white/72 bg-white/60 text-slate-600 hover:bg-white/80 dark:border-white/10 dark:bg-white/6 dark:text-slate-300 dark:hover:bg-white/10",
                      )}
                      onClick={() => setCurrentEventPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}

                <MaybeTooltip content="下一页" disabled={safeCurrentEventPage < totalEventPages}>
                  <button
                    type="button"
                    className={cn(chromeButtonClassName, "size-8")}
                    onClick={() =>
                      setCurrentEventPage((current) => Math.min(totalEventPages, current + 1))
                    }
                    disabled={safeCurrentEventPage >= totalEventPages}
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                </MaybeTooltip>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillsRoute({
  actionError,
  error,
  loading,
  query,
  selectedSkillId,
  skills,
  onOpenSkillFile,
  onQueryChange,
  onRefresh,
  onRevealSkillFolder,
  onSelectSkill,
}: {
  actionError: string;
  error: string;
  loading: boolean;
  query: string;
  selectedSkillId: string | null;
  skills: InstalledSkill[];
  onOpenSkillFile: (path: string) => Promise<void>;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onRevealSkillFolder: (path: string) => Promise<void>;
  onSelectSkill: (skillId: string | null) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSkills = skills.filter((skill) => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      skill.title,
      skill.name,
      skill.description,
      skill.source,
      skill.scope,
      skill.relativePath,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  const selectedSkill =
    filteredSkills.find((skill) => skill.id === selectedSkillId) ??
    filteredSkills[0] ??
    null;

  useEffect(() => {
    if (selectedSkill?.id === selectedSkillId) {
      return;
    }

    onSelectSkill(selectedSkill?.id ?? null);
  }, [onSelectSkill, selectedSkill, selectedSkillId]);

  const codexCount = skills.filter((skill) => skill.source === "codex").length;
  const agentsCount = skills.filter((skill) => skill.source === "agents").length;
  const systemCount = skills.filter((skill) => skill.system).length;

  return (
    <div
      className="auto-fade-scrollbar flex h-full min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
      onScroll={(event) => activateAutoScrollbar(event.currentTarget)}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <div className="glass-panel-strong rounded-[1rem] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <SectionEyebrow label="Skills" />
              <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                本机技能目录
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                这里会扫描 `~/.codex/skills` 和 `~/.agents/skills`，用来查看当前 Agent
                可直接使用的技能资产。
              </p>
            </div>

            <button type="button" className={secondaryButtonClassName} onClick={onRefresh}>
              {loading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  正在刷新
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  刷新目录
                </>
              )}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Installed" value={`${skills.length}`} />
            <SummaryCard label="Codex" value={`${codexCount}`} />
            <SummaryCard label="Agents" value={`${agentsCount}`} />
            <SummaryCard label="System" value={`${systemCount}`} />
          </div>
        </div>

        <div className="grid min-h-[26rem] gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="glass-panel-strong flex min-h-0 flex-col rounded-[1rem] p-3">
            <div className="flex items-center gap-2">
              <input
                className={fieldClassName}
                value={query}
                onChange={(event) => onQueryChange(event.currentTarget.value)}
                placeholder="搜索技能、说明、路径"
              />
            </div>

            <div
              className="auto-fade-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
              onScroll={(event) => activateAutoScrollbar(event.currentTarget)}
            >
              {loading && skills.length === 0 ? (
                <LoadingPanel
                  label="Skills"
                  title="正在同步本机技能目录"
                  description="会扫描 ~/.codex/skills 与 ~/.agents/skills，并把可用技能整理到当前列表。"
                />
              ) : null}

              {!loading && filteredSkills.length === 0 ? (
                <div className="rounded-[0.95rem] border border-white/72 bg-white/60 px-3 py-3 text-[12px] leading-5 text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-400">
                  {query.trim() ? "没有匹配的技能。" : "没有发现已安装技能。"}
                </div>
              ) : null}

              <div className="space-y-1.5">
                {filteredSkills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    className={cn(
                      "w-full rounded-[0.95rem] border px-3 py-2.5 text-left transition",
                      selectedSkill?.id === skill.id
                        ? "theme-accent-surface-soft"
                        : "border-white/68 bg-white/50 hover:bg-white/72 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10",
                    )}
                    onClick={() => onSelectSkill(skill.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                          {skill.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                          {skill.description}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/75 bg-white/72 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-white/12 dark:bg-white/10 dark:text-slate-400">
                        {skill.source}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel-strong min-h-0 rounded-[1rem] p-4">
            {selectedSkill ? (
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <SectionEyebrow label={selectedSkill.system ? "System Skill" : "Installed Skill"} />
                    <h3 className="mt-2 text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                      {selectedSkill.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                      {selectedSkill.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      onClick={() => void onOpenSkillFile(selectedSkill.skillFilePath)}
                    >
                      打开 SKILL
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClassName}
                      onClick={() => void onRevealSkillFolder(selectedSkill.folderPath)}
                    >
                      打开目录
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SummaryCard label="Source" value={selectedSkill.source} />
                  <SummaryCard label="Scope" value={selectedSkill.scope} />
                </div>

                <div className="mt-4 grid gap-3">
                  <SummaryCard label="Relative Path" value={selectedSkill.relativePath} mono />
                  <SummaryCard label="Folder" value={selectedSkill.folderPath} mono />
                  <SummaryCard label="Skill File" value={selectedSkill.skillFilePath} mono />
                </div>

                {actionError ? (
                  <div className="mt-4 rounded-[1rem] border border-rose-200/80 bg-rose-50/88 px-4 py-3 text-[12px] leading-6 text-rose-700 shadow-[0_8px_20px_rgba(225,29,72,0.08)] dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
                    {actionError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[0.95rem] border border-white/72 bg-white/60 px-4 py-4 text-[13px] leading-6 text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-400">
                先从左侧选择一个技能，或者刷新目录重新扫描。
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="rounded-[1rem] border border-rose-200/80 bg-rose-50/88 px-4 py-3 text-[12px] leading-6 text-rose-700 shadow-[0_8px_20px_rgba(225,29,72,0.08)] dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsRoute({
  appearanceMode,
  compaction,
  connectionError,
  connectionStatus,
  isBusy,
  isConnected,
  providerCatalog,
  providerCatalogError,
  onAbort,
  onAppearanceModeChange,
  onBackToApp,
  onDisconnect,
  onProviderDraftChange,
  onSaveProvider,
  onSelectProvider,
  onThemeAccentChange,
  providerDrafts,
  providerSaveBusy,
  providerSaveError,
  providerSaveMessage,
  resolvedAppearanceMode,
  selectedProviderId,
  sidebarColumnWidth,
  themeAccent,
}: {
  appearanceMode: AppearanceMode;
  compaction: PiConfigSnapshot["compaction"] | null;
  connectionError: string;
  connectionStatus: ConnectionStatus;
  isBusy: boolean;
  isConnected: boolean;
  providerCatalog: PiProviderCatalog | null;
  providerCatalogError: string;
  onAbort: () => Promise<void>;
  onAppearanceModeChange: (updater: StateUpdater<AppearanceMode>) => void;
  onBackToApp: () => void;
  onDisconnect: () => Promise<void>;
  onProviderDraftChange: (
    providerId: string,
    updater: (current: ProviderDraft) => ProviderDraft,
  ) => void;
  onSaveProvider: (providerId: string) => Promise<void>;
  onSelectProvider: (providerId: string) => void;
  onThemeAccentChange: (updater: StateUpdater<ThemeAccentId>) => void;
  providerDrafts: Record<string, ProviderDraft>;
  providerSaveBusy: boolean;
  providerSaveError: string;
  providerSaveMessage: string;
  resolvedAppearanceMode: "light" | "dark";
  selectedProviderId: string;
  sidebarColumnWidth: string;
  themeAccent: ThemeAccentId;
}) {
  const providerOptions = flattenProviderCatalog(providerCatalog);
  const selectedProvider =
    providerOptions.find((entry) => entry.provider === selectedProviderId) ?? null;
  const selectedDraft = selectedProvider ? providerDrafts[selectedProvider.provider] ?? null : null;
  const providerTypeLabel =
    selectedProvider?.kind === "app-custom"
      ? "App-managed Custom"
      : "PI Built-in";
  const [activeSection, setActiveSection] = useState<
    "providers" | "appearance" | "context" | "runtime"
  >("providers");
  const settingsSections = [
    {
      key: "providers" as const,
      label: "Provider 配置",
      icon: KeyRound,
    },
    {
      key: "appearance" as const,
      label: "外观",
      icon: Sparkles,
    },
    {
      key: "context" as const,
      label: "上下文安全",
      icon: TriangleAlert,
    },
    {
      key: "runtime" as const,
      label: "Runtime",
      icon: Activity,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div
        className="grid h-full min-h-0 flex-1"
        style={{ gridTemplateColumns: `${sidebarColumnWidth} minmax(0,1fr)` }}
      >
        <aside className="app-sidebar-panel relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div data-tauri-drag-region className="h-[52px] shrink-0 select-none" />

          <div className="border-b border-white/50 px-2 py-2 dark:border-white/10">
            <SidebarNavItem
              active={false}
              collapsed={false}
              icon={ArrowLeft}
              label="返回应用"
              onClick={onBackToApp}
            />
          </div>

          <div className="auto-fade-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2" onScroll={(event) => activateAutoScrollbar(event.currentTarget)}>
            <nav className="space-y-1">
              {settingsSections.map((section) => (
                <SidebarNavItem
                  key={section.key}
                  active={activeSection === section.key}
                  collapsed={false}
                  icon={section.icon}
                  label={section.label}
                  onClick={() => setActiveSection(section.key)}
                />
              ))}
            </nav>
          </div>
        </aside>

        <section className="app-shell-panel relative z-10 ml-[5px] flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-l-[20px] rounded-r-none">
          <div
            className="auto-fade-scrollbar min-h-0 flex-1 overflow-y-auto bg-white dark:bg-black"
            onScroll={(event) => activateAutoScrollbar(event.currentTarget)}
          >
            <div className="space-y-3">
            {activeSection === "providers" ? (
              <section className="glass-panel-strong rounded-[1rem] p-4">
                <SectionEyebrow label="Provider Catalog" />
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                      Provider 配置
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                      左边选要配置的 Provider，右边直接修改它的 API Key 与连接参数，不再拆成两个设置页面。
                    </p>
                  </div>
                </div>

                {providerCatalogError ? (
                  <div className="mt-3 rounded-[1rem] border border-rose-200/80 bg-rose-50/88 px-4 py-3 text-[12px] leading-6 text-rose-700 shadow-[0_8px_20px_rgba(225,29,72,0.08)] dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
                    {providerCatalogError}
                  </div>
                ) : null}

                {!providerCatalog ? (
                  <div className="mt-3">
                    <LoadingPanel
                      label="Provider Catalog"
                      title="正在同步模型目录"
                      description="正在读取当前 Pi runtime 的 provider 和模型列表，并对齐到这台机器的真实可用配置。"
                    />
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="glass-panel rounded-[1rem] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Provider 列表</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                            以宫格方式展示所有 Provider，选中后在下方直接编辑 API 配置。
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                        {providerOptions.map((entry) => {
                          const isActive = selectedProviderId === entry.provider;
                          const draft = providerDrafts[entry.provider];
                          return (
                            <button
                              key={entry.provider}
                              type="button"
                              className={cn(
                                "rounded-[1rem] border p-3 text-left shadow-[0_8px_20px_rgba(52,72,112,0.07)] backdrop-blur-xl transition",
                                isActive
                                  ? "theme-accent-surface ring-1 ring-[color:var(--app-accent-border)]"
                                  : "border-white/75 bg-white/58 hover:bg-white/72 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10",
                              )}
                              onClick={() => {
                                onSelectProvider(entry.provider);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <ProviderGlyph provider={entry.provider} size={18} />
                                    <p className="text-[13px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-100">
                                      {entry.label}
                                    </p>
                                  </div>
                                  <p className="mt-1 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                                    {entry.kind === "app-custom" ? "App Custom" : "PI Built-in"} ·{" "}
                                    {draft?.hasStoredCredential ? "已配置 API Key" : "未配置 API Key"}
                                  </p>
                                </div>
                                <MicroBadge
                                  tone={draft?.hasStoredCredential ? "connected" : "neutral"}
                                  text={draft?.hasStoredCredential ? "Ready" : "Needs Key"}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedProvider && selectedDraft ? (
                      <div className="glass-panel rounded-[1rem] p-4">
                        <SectionEyebrow label="API Configuration" />
                        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                              {selectedProvider.label} API 配置
                            </h4>
                            <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                              这里只会修改当前 Provider 自己的凭据和连接参数，不会影响其他模型提供商。
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                          <Field label="Provider">
                            <div className="flex h-10 items-center gap-2 rounded-[0.9rem] border border-white/75 bg-white/60 px-3 text-[13px] text-slate-700 shadow-[0_8px_20px_rgba(52,72,112,0.06)] dark:border-white/10 dark:bg-white/6 dark:text-slate-200">
                              <ProviderGlyph provider={selectedProvider.provider} size={16} />
                              <span className="font-medium text-slate-900 dark:text-slate-100">{selectedProvider.label}</span>
                            </div>
                          </Field>

                          <Field label="Provider Type">
                            <div className="flex h-10 items-center rounded-[0.9rem] border border-white/75 bg-white/60 px-3 text-[12px] text-slate-600 shadow-[0_8px_20px_rgba(52,72,112,0.06)] dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
                              {providerTypeLabel}
                            </div>
                          </Field>

                          <SummaryCard
                            label="Credential"
                            value={selectedDraft.hasStoredCredential ? "已存储" : "未存储"}
                          />
                          <SummaryCard
                            label="API Key Env"
                            value={selectedDraft.apiKeyEnvName || selectedProvider.apiKeyEnvName || "未设置"}
                            mono
                          />

                          <div className="md:col-span-2">
                            <Field label="API Key Env Name">
                              <input
                                className={fieldClassName}
                                value={selectedDraft.apiKeyEnvName}
                                onChange={(event) =>
                                  onProviderDraftChange(selectedProvider.provider, (current) => ({
                                    ...current,
                                    apiKeyEnvName: event.currentTarget.value,
                                  }))
                                }
                                placeholder={selectedProvider.apiKeyEnvName || "API_KEY"}
                              />
                            </Field>
                          </div>

                          <div className="md:col-span-2">
                            <Field label="API Key">
                              <div className="relative">
                                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                                <input
                                  type="password"
                                  className={cn(fieldClassName, "pl-10")}
                                  value={selectedDraft.apiKeyDraft}
                                  onChange={(event) =>
                                    onProviderDraftChange(selectedProvider.provider, (current) => ({
                                      ...current,
                                      apiKeyDraft: event.currentTarget.value,
                                      dirty: true,
                                    }))
                                  }
                                  placeholder={
                                    selectedDraft.hasStoredCredential
                                      ? "留空则保留当前已存储的 API Key"
                                      : "sk-..."
                                  }
                                />
                              </div>
                            </Field>
                          </div>

                          <div className="md:col-span-2">
                            <Field label="Base URL">
                              <input
                                className={fieldClassName}
                                value={selectedDraft.baseUrl}
                                onChange={(event) =>
                                  onProviderDraftChange(selectedProvider.provider, (current) => ({
                                    ...current,
                                    baseUrl: event.currentTarget.value,
                                  }))
                                }
                                placeholder="可选，自定义网关时填写"
                              />
                            </Field>
                          </div>
                        </div>

                        <p className="mt-4 text-[12px] leading-6 text-slate-500 dark:text-slate-400">
                          Provider Catalog 只负责配置 API Key。切换当前会话模型，请回到聊天页操作。
                        </p>

                        {providerSaveError ? (
                          <div className="mt-3 rounded-[1rem] border border-rose-200/80 bg-rose-50/88 px-4 py-3 text-[12px] leading-6 text-rose-700 shadow-[0_8px_20px_rgba(225,29,72,0.08)] dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
                            {providerSaveError}
                          </div>
                        ) : null}

                        {providerSaveMessage ? (
                          <div className="mt-3 rounded-[1rem] border border-emerald-200/80 bg-emerald-50/88 px-4 py-3 text-[12px] leading-6 text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.08)] dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-200">
                            {providerSaveMessage}
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={primaryButtonClassName}
                            disabled={providerSaveBusy}
                            onClick={() => void onSaveProvider(selectedProvider.provider)}
                          >
                            {providerSaveBusy ? (
                              <>
                                <LoaderCircle className="size-4 animate-spin" />
                                保存中
                              </>
                            ) : (
                              <>
                                <KeyRound className="size-4" />
                                保存 API 配置
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-panel rounded-[1rem] p-4">
                        <SectionEyebrow label="API Configuration" />
                        <div className="rounded-[0.95rem] border border-white/72 bg-white/60 px-4 py-4 text-[13px] leading-6 text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-400">
                          先从左侧列表选择一个 Provider，再配置它的 API Key 和连接参数。
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {activeSection === "appearance" ? (
              <section className="glass-panel-strong rounded-[1rem] p-4">
                <SectionEyebrow label="Appearance" />
                <div className="mt-2">
                  <h3 className="text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-50">
                    界面外观
                  </h3>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                    设置主题色与日夜间模式。这些只影响当前这台机器上的应用界面，不会写进
                    workspace 配置。
                  </p>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                  <div className="glass-panel rounded-[1rem] p-4">
                    <Field label="日夜间模式">
                      <div className="grid gap-2">
                        {[
                          { key: "light" as const, label: "浅色" },
                          { key: "dark" as const, label: "深色" },
                          { key: "system" as const, label: "跟随系统" },
                        ].map((option) => {
                          const active = appearanceMode === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              className={cn(
                                "flex items-center justify-between rounded-[0.95rem] border px-3 py-2.5 text-left text-[13px] font-medium transition",
                                active
                                  ? "border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[color:var(--app-accent-text-strong)] shadow-[0_10px_24px_var(--app-shadow-chrome)]"
                                  : "border-white/72 bg-white/60 text-slate-600 hover:bg-white/80 dark:border-white/10 dark:bg-white/6 dark:text-slate-300 dark:hover:bg-white/10",
                              )}
                              onClick={() => onAppearanceModeChange(option.key)}
                            >
                              <span>{option.label}</span>
                              {active ? <Check className="size-4" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>

                  <div className="glass-panel rounded-[1rem] p-4">
                    <Field label="主题色">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {themeAccentOptions.map((option) => {
                          const active = themeAccent === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={cn(
                                "rounded-[0.95rem] border px-3 py-3 text-left transition",
                                active
                                  ? "border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] shadow-[0_10px_24px_var(--app-shadow-chrome)]"
                                  : "border-white/72 bg-white/60 hover:bg-white/80 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10",
                              )}
                              onClick={() => onThemeAccentChange(option.id)}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="inline-flex size-8 rounded-full border border-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
                                    style={{
                                      background: `linear-gradient(135deg, ${option.preview}, rgba(255,255,255,0.96))`,
                                    }}
                                  />
                                  <div>
                                    <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                                      {option.label}
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                      {option.id}
                                    </p>
                                  </div>
                                </div>
                                {active ? (
                                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--app-accent-soft-strong)] text-[color:var(--app-accent-text)]">
                                    <Check className="size-3.5" />
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="glass-panel rounded-[1rem] p-4">
                    <Field label="预览">
                      <div className="rounded-[1rem] border border-white/70 bg-[var(--app-surface-tint)] px-4 py-4 shadow-[0_12px_28px_var(--app-shadow-soft)] backdrop-blur-xl dark:border-white/10">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className={primaryButtonClassName}>
                            主要按钮
                          </button>
                          <button type="button" className={secondaryButtonClassName}>
                            次要按钮
                          </button>
                          <MicroBadge tone="connected" text="已连接" />
                          <MicroBadge tone="busy" text="Context 49.6K / 128K" />
                        </div>
                        <div className="mt-4 rounded-[1rem] border border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] px-4 py-4 shadow-[0_10px_24px_var(--app-shadow-chrome)]">
                          <p className="text-[13px] font-semibold text-[color:var(--app-accent-text-strong)]">
                            当前预览
                          </p>
                          <p className="mt-2 text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                            {resolvedAppearanceMode === "dark" ? "深色" : "浅色"}模式 ·
                            {themeAccentOptions.find((option) => option.id === themeAccent)?.label}
                            主题
                          </p>
                        </div>
                      </div>
                    </Field>
                  </div>

                  <div className="glass-panel rounded-[1rem] p-4">
                    <Field label="说明">
                      <div className="rounded-[0.95rem] border border-white/72 bg-white/60 px-4 py-4 text-[13px] leading-6 text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
                        主应用、设置页和内置终端都会实时跟随这里的设置变化。启动页保持当前简洁方案，不跟随主题切换。
                      </div>
                    </Field>
                  </div>
                </div>
              </section>
            ) : null}

            {activeSection === "context" ? (
              <section className="glass-panel-strong rounded-[1rem] p-4">
                <SectionEyebrow label="Context Safety" />
                <div className="mt-2">
                  <h3 className="text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                    上下文压缩与安全边界
                  </h3>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                    当前使用安全优先的上下文压缩策略。上下文过长是高风险状态，压缩策略会保留最近内容并预留足够 token，尽量避免直接溢出。
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="上下文压缩" value={compaction?.enabled ? "已开启" : "已关闭"} />
                  <SummaryCard
                    label="Reserve Tokens"
                    value={compaction ? formatCompactTokens(compaction.reserveTokens) : "--"}
                  />
                  <SummaryCard
                    label="Keep Recent"
                    value={compaction ? formatCompactTokens(compaction.keepRecentTokens) : "--"}
                  />
                  <SummaryCard label="安全策略" value={compaction?.enabled ? "Safeguard" : "Disabled"} />
                </div>

                <div className="mt-4 rounded-[1rem] border border-amber-200/80 bg-amber-50/86 px-4 py-3 text-[12px] leading-6 text-amber-800 shadow-[0_8px_20px_rgba(251,191,36,0.08)] dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-200">
                  当上下文占用接近模型上限时，聊天页会进入警示或危险状态。超过上限后继续对话，可能直接导致任务失败、压缩失败或上下文污染。
                </div>
              </section>
            ) : null}

            {activeSection === "runtime" ? (
              <section className="glass-panel-strong rounded-[1rem] p-4">
                <SectionEyebrow label="Runtime" />
                <div className="mt-2">
                  <h3 className="text-[16px] font-semibold tracking-[-0.03em] text-slate-950 dark:text-slate-100">
                    连接状态与运行控制
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                    这里负责查看当前连接状态、错误信息，以及直接控制正在运行的 PI runtime。
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard label="状态" value={formatConnectionStatus(connectionStatus)} />
                  <SummaryCard label="连接中" value={connectionStatus === "connecting" ? "是" : "否"} />
                  <SummaryCard label="当前任务" value={isBusy ? "执行中" : "空闲"} />
                  <SummaryCard label="Runtime 已连接" value={isConnected ? "是" : "否"} />
                </div>

                {connectionError ? (
                  <div className="mt-3 rounded-[1rem] border border-rose-200/80 bg-rose-50/88 px-4 py-3 text-[12px] leading-6 text-rose-700 shadow-[0_8px_20px_rgba(225,29,72,0.08)] dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200">
                    {connectionError}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() => void onDisconnect()}
                    disabled={!isConnected}
                  >
                    断开连接
                  </button>

                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={() => void onAbort()}
                    disabled={!isBusy}
                  >
                    中止任务
                  </button>
                </div>
              </section>
            ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function LogFilterSelect({
  children,
  onValueChange,
  placeholder,
  value,
}: {
  children: ReactNode;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="min-w-[180px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="end">
        {children}
      </SelectContent>
    </Select>
  );
}

function MaybeTooltip({
  align = "center",
  children,
  content,
  disabled = false,
  wrapperClassName,
  side = "top",
}: {
  align?: "center" | "end" | "start";
  children: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
  wrapperClassName?: string;
  side?: "bottom" | "left" | "right" | "top";
}) {
  if (!content || disabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex max-w-full", wrapperClassName)}>{children}</span>
      </TooltipTrigger>
      <TooltipContent align={align} side={side}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarNavItem({
  active,
  collapsed,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <MaybeTooltip
      content={label}
      disabled={!collapsed}
      side="right"
      wrapperClassName={collapsed ? "block w-full" : undefined}
    >
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-[0.95rem] border border-transparent px-3 text-left text-[12px] font-semibold transition duration-150",
          active
            ? "theme-primary-button text-white shadow-[0_10px_24px_var(--app-shadow-chrome)]"
            : "text-slate-600 hover:border-[color:var(--app-accent-border)] hover:bg-[linear-gradient(145deg,var(--app-accent-soft),rgba(255,255,255,0.92))] hover:text-slate-900 hover:shadow-[0_8px_20px_var(--app-shadow-chrome)] dark:text-slate-300 dark:hover:bg-[linear-gradient(145deg,var(--app-accent-soft),rgba(255,255,255,0.08))] dark:hover:text-slate-100",
          collapsed && "h-9 justify-center px-0",
        )}
        onClick={onClick}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed ? <span>{label}</span> : null}
      </button>
    </MaybeTooltip>
  );
}

function ToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <MaybeTooltip content={label}>
      <button
        type="button"
        className={cn(
          chromeButtonClassName,
          active && "theme-chrome-button-active text-slate-900 dark:text-slate-50",
        )}
        onClick={onClick}
      >
        {children}
      </button>
    </MaybeTooltip>
  );
}

function StandaloneSettingsShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="relative flex h-[100dvh] overflow-hidden text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12%] top-[-18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--app-glow-left),transparent_72%)] blur-3xl" />
        <div className="absolute right-[-10%] top-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,var(--app-glow-right),transparent_72%)] blur-3xl" />
      </div>

      <section className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-black">
        <header
          data-tauri-drag-region
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[54px]"
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </section>
    </main>
  );
}

function SessionListItem({
  active,
  collapsed,
  onClick,
  onDelete,
  onRename,
  session,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: () => void;
  session: StoredSession;
}) {
  const cardClassName = cn(
    "w-full rounded-[0.95rem] border text-left transition",
    active
      ? "theme-accent-surface-soft"
      : "border-white/68 bg-white/50 hover:bg-white/72 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10",
    collapsed ? "px-0 py-2" : "px-3 py-2.5",
  );

  if (collapsed) {
    return (
      <MaybeTooltip content={session.title} side="right">
        <button
          type="button"
          className={cardClassName}
          onClick={onClick}
        >
          <div className="flex items-center justify-center">
            <span
              className={cn(
                "block size-2.5 rounded-full",
                active ? "bg-[var(--app-accent-solid)]" : "bg-slate-300 dark:bg-white/18",
              )}
            />
          </div>
        </button>
      </MaybeTooltip>
    );
  }

  return (
    <div className={cn(cardClassName, "group")}>
      <div className="flex items-start justify-between gap-2">
        <MaybeTooltip content={session.title} disabled={session.title.length <= 18}>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={onClick}
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ProviderGlyph provider={session.provider} size={16} />
                    <p className="line-clamp-1 text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                      {session.title}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                  {formatSessionTime(session.updatedAt)}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                {session.provider || "provider 未设置"}
                {session.model ? ` · ${session.model}` : ""}
              </p>
            </div>
          </button>
        </MaybeTooltip>

        <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <MaybeTooltip content="重命名会话">
            <button
              type="button"
              className={chromeButtonClassName}
              onClick={(event) => {
                event.stopPropagation();
                onRename();
              }}
            >
              <PencilLine className="size-3.5" />
            </button>
          </MaybeTooltip>
          <MaybeTooltip content="删除会话">
            <button
              type="button"
              className={chromeButtonClassName}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </MaybeTooltip>
        </div>
      </div>
    </div>
  );
}

function ProviderGlyph({
  provider,
  size = 16,
}: {
  provider: string;
  size?: number;
}) {
  const normalizedProvider = provider.trim().toLowerCase();
  const iconPack = resolveProviderIconPack(normalizedProvider);

  if (iconPack?.Avatar) {
    const Avatar = iconPack.Avatar;
    return <Avatar size={size} />;
  }

  const initials = providerInitials(normalizedProvider);
  const accent = providerAccentColor(normalizedProvider);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full border text-[9px] font-semibold uppercase tracking-[0.08em] shadow-[0_4px_12px_rgba(31,41,55,0.06)]"
      style={{
        width: size,
        height: size,
        borderColor: `${accent}55`,
        background: `linear-gradient(145deg, ${accent}22, rgba(255,255,255,0.92))`,
        color: accent,
      }}
    >
      {initials}
    </span>
  );
}

function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] font-medium tracking-[0.01em] text-slate-500 dark:text-slate-400">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
          {index > 0 ? <ChevronRight className="size-3 shrink-0 text-slate-300 dark:text-slate-500" /> : null}
          <span
            className={cn(
              "truncate",
              index === items.length - 1
                ? "font-semibold text-slate-800 dark:text-slate-100"
                : "text-slate-400 dark:text-slate-500",
            )}
          >
            {item}
          </span>
        </span>
      ))}
    </nav>
  );
}

function SectionEyebrow({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
      {label}
    </p>
  );
}

function LoadingPill({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[color:var(--app-accent-border)] bg-[linear-gradient(145deg,var(--app-accent-soft),rgba(255,255,255,0.9))] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--app-accent-text)] shadow-[0_8px_20px_var(--app-shadow-chrome)]",
        className,
      )}
    >
      <LoaderCircle className="size-3.5 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

function LoadingPanel({
  description,
  label,
  title,
}: {
  description: string;
  label: string;
  title: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/72 bg-[linear-gradient(145deg,var(--app-accent-soft),color-mix(in_srgb,var(--app-surface-tint-strong)_94%,white_6%))] px-4 py-4 shadow-[0_8px_20px_var(--app-shadow-soft)] dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionEyebrow label={label} />
          <p className="mt-1 text-[13px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
            {title}
          </p>
          <p className="mt-1 text-[12px] leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        </div>
        <LoadingPill className="shrink-0" label="加载中" />
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  loading = false,
  loadingLabel = "加载中",
  mono = false,
  value,
}: {
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  mono?: boolean;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[0.95rem] border border-white/72 bg-white/58 p-3 shadow-[0_8px_20px_rgba(52,72,112,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 break-all text-[12px] leading-6 text-slate-700 dark:text-slate-200",
          mono && "font-mono",
        )}
      >
        {loading ? <LoadingPill className="max-w-full" label={loadingLabel} /> : value}
      </p>
    </div>
  );
}

function MicroBadge({
  className,
  text,
  tone,
}: {
  className?: string;
  text: string;
  tone: ConnectionStatus | "neutral" | "busy";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.01em] shadow-[0_6px_16px_rgba(52,72,112,0.06)] backdrop-blur-xl",
        toneClassName(tone),
        className,
      )}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

function MessageBubble({ message }: { message: UiMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isAssistant = message.role === "assistant";

  return (
    <article className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0",
          isUser ? "max-w-[76%]" : "max-w-[min(100%,48rem)]",
        )}
      >
        {!isUser ? (
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            <span>{message.meta ?? message.role}</span>
            <span className="h-px w-4 bg-slate-200 dark:bg-white/12" />
            <span>{message.role}</span>
          </div>
        ) : null}

        <div
          className={cn(
            "min-w-0",
            isUser &&
              "rounded-[1.2rem] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--app-accent-text-strong)_72%,black_28%),var(--app-accent-solid))] px-4 py-3 text-white shadow-[0_12px_28px_var(--app-shadow-chrome)]",
            isAssistant &&
              "rounded-[1.15rem] border border-white/82 bg-white/86 px-4 py-3 text-slate-900 shadow-[0_12px_28px_rgba(52,72,112,0.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/8 dark:text-slate-100",
            isSystem &&
              (message.tone === "error"
                ? "rounded-[1rem] border border-rose-200/80 bg-rose-50/92 px-3.5 py-3 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200"
                : "rounded-[1rem] border border-white/75 bg-white/64 px-3.5 py-3 text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/6 dark:text-slate-300"),
          )}
        >
          <div className="space-y-3">
            {message.segments.length === 0 ? (
              <p className="text-[13px] leading-6 tracking-[-0.01em] opacity-60">…</p>
            ) : (
              message.segments.map((segment, index) => (
                <MessageSegmentRenderer
                  key={`${message.id}-${segment.type}-${index}`}
                  isUser={isUser}
                  segment={segment}
                />
              ))
            )}

            {message.usage ? (
              <div
                className={cn(
                  "flex flex-wrap gap-1.5 pt-1",
                  isUser ? "border-t border-white/15" : "border-t border-slate-200/70 dark:border-white/10",
                )}
              >
                <MicroBadge tone="neutral" text={`in ${formatUsageValue(message.usage.input)}`} />
                <MicroBadge tone="neutral" text={`out ${formatUsageValue(message.usage.output)}`} />
                <MicroBadge
                  tone="neutral"
                  text={`total ${formatUsageValue(message.usage.totalTokens)}`}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function MessageSegmentRenderer({
  isUser,
  segment,
}: {
  isUser: boolean;
  segment: ChatSegment;
}) {
  if (segment.type === "markdown_text") {
    if (isUser) {
      return (
        <p className="whitespace-pre-wrap text-[13px] leading-6 tracking-[-0.01em]">
          {segment.text}
        </p>
      );
    }

    return <MarkdownBlock content={segment.text} />;
  }

  if (segment.type === "thinking") {
    return <ThinkingBlock segment={segment} />;
  }

  return <ToolCard segment={segment} />;
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="markdown-content text-[13px] leading-6 tracking-[-0.01em] text-inherit">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-slate-950 dark:text-slate-50">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="text-[13px] leading-6">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="rounded-[0.95rem] border border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] px-4 py-3 text-slate-600 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              className="font-medium text-[color:var(--app-accent-text)] underline decoration-[color:var(--app-accent-border)] underline-offset-4"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-[0.95rem] border border-white/72 bg-white/58 dark:border-white/10 dark:bg-white/6">
              <table className="min-w-full text-left text-[12px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-white/70 px-3 py-2 font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-white/60 px-3 py-2 align-top text-slate-600 last:border-b-0 dark:border-white/10 dark:text-slate-300">{children}</td>
          ),
          code: ({ children, className }) => {
            const text = String(children).replace(/\n$/, "");
            const isBlock = Boolean(className);
            if (!isBlock) {
              return (
                <code className="rounded bg-slate-900/8 px-1.5 py-0.5 font-mono text-[12px] text-slate-700 dark:bg-white/10 dark:text-slate-200">
                  {text}
                </code>
              );
            }

            return (
              <div className="rounded-[0.95rem] border border-slate-200/80 bg-slate-950/92 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="mb-2 flex items-center justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/6 px-2 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-white/12"
                    onClick={() => void copyText(text)}
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-6">{text}</pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ThinkingBlock({ segment }: { segment: Extract<ChatSegment, { type: "thinking" }> }) {
  return (
    <details className="rounded-[0.95rem] border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 dark:border-white/10 dark:bg-white/6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        <span>Thinking</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.12em] text-slate-400 dark:text-slate-500">
          {segment.isStreaming ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          {segment.isStreaming ? "Streaming" : "Hidden"}
        </span>
      </summary>
      <div className="mt-3 border-t border-slate-200/80 pt-3 text-slate-600 dark:border-white/10 dark:text-slate-300">
        <MarkdownBlock content={segment.text} />
      </div>
    </details>
  );
}

function ToolCard({
  segment,
}: {
  segment: Extract<ChatSegment, { type: "tool_call" | "tool_result" }>;
}) {
  const isOutputCard = segment.type === "tool_result";
  const isRunning = segment.status === "running" || segment.status === "pending";
  const preview = isOutputCard ? summarizeToolOutput(segment) : summarizeToolCall(segment);
  const outputPayload = getToolOutputPayload(segment);

  return (
    <div
      className={cn(
        "rounded-[0.95rem] border p-3",
        isRunning
          ? "border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)]"
          : isOutputCard
          ? "border-[color:var(--app-accent-border)] bg-[color-mix(in_srgb,var(--app-accent-soft)_78%,white_22%)]"
          : "border-slate-200/80 bg-slate-50/88 dark:border-white/10 dark:bg-white/6",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/12 dark:bg-white/10 dark:text-slate-400">
          {isOutputCard ? "Tool output" : "Tool"}
        </span>
        <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">{segment.toolName}</span>
        {isRunning ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--app-accent-border)] bg-white/84 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--app-accent-text)] dark:bg-white/10">
            <LoaderCircle className="size-3 animate-spin" />
            Running
          </span>
        ) : null}
      </div>

      {preview ? (
        <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-slate-600 dark:text-slate-300">{preview}</p>
      ) : null}

      {outputPayload !== undefined ? (
        <details className="mt-2 rounded-[0.9rem] border border-white/80 bg-white/76 px-3 py-2 dark:border-white/10 dark:bg-white/8">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Tool output
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-600 dark:text-slate-300">
            {formatToolOutputPayload(outputPayload)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function toneClassName(tone: ConnectionStatus | "neutral" | "busy") {
  switch (tone) {
    case "connected":
      return "border-emerald-200/80 bg-emerald-50/72 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-200";
    case "connecting":
    case "busy":
      return "border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] text-[color:var(--app-accent-text)]";
    case "error":
      return "border-rose-200/80 bg-rose-50/84 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/12 dark:text-rose-200";
    case "idle":
      return "border-slate-200/80 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300";
    default:
      return "border-white/80 bg-white/66 text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-300";
  }
}

function getRouteFromHash(): AppRouteState {
  if (typeof window === "undefined") {
    return { kind: "new" };
  }

  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  if (!hash) {
    return { kind: "new" };
  }

  const [route, sessionId] = hash.split("/");
  const normalizedRoute = route.toLowerCase();

  if (normalizedRoute === "activity") {
    return { kind: "activity" };
  }

  if (normalizedRoute === "settings") {
    return { kind: "settings" };
  }

  if (normalizedRoute === "skills") {
    return { kind: "skills" };
  }

  if (normalizedRoute === "new") {
    return { kind: "new" };
  }

  if (normalizedRoute === "chat" && sessionId) {
    return { kind: "chat", sessionId };
  }

  return { kind: "new" };
}

function routeToHash(route: AppRouteState) {
  switch (route.kind) {
    case "activity":
      return "#/activity";
    case "settings":
      return "#/settings";
    case "skills":
      return "#/skills";
    case "new":
      return "#/new";
    default:
      return `#/chat/${route.sessionId}`;
  }
}

function isSameRouteState(left: AppRouteState, right: AppRouteState) {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "chat" && right.kind === "chat") {
    return left.sessionId === right.sessionId;
  }

  return true;
}

function getBreadcrumbs(route: AppRouteState) {
  if (route.kind === "activity") {
    return ["Agent", "Activity"];
  }

  if (route.kind === "settings") {
    return ["Agent", "Settings"];
  }

  if (route.kind === "skills") {
    return ["Agent", "Skills"];
  }

  if (route.kind === "new") {
    return ["Agent", "Chat"];
  }

  return ["Agent", "Chat"];
}

function createSession(config: SessionConfig): StoredSession {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New Session",
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    workspacePath: config.workspacePath,
    provider: config.provider,
    model: config.model,
    apiKeyEnvName: config.apiKeyEnvName,
    runtimeState: "idle",
    usage: createEmptyUsageSummary(),
    diagnostics: createEmptyDiagnosticsState(),
    toolExecutions: {},
  };
}

function updateSessionSnapshot(
  sessions: StoredSession[],
  sessionId: string,
  nextSnapshot: Partial<StoredSession>,
) {
  return sortSessions(
    sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            ...nextSnapshot,
          }
        : session,
    ),
  ).slice(0, MAX_STORED_SESSIONS);
}

function buildSessionTitle(messages: UiMessage[]) {
  const firstContent =
    messages.find(
      (message) => message.role === "user" && segmentsToPlainText(message.segments).trim(),
    ) ??
    messages.find(
      (message) => message.role === "assistant" && segmentsToPlainText(message.segments).trim(),
    );

  if (!firstContent) {
    return "New Session";
  }

  return truncateText(segmentsToPlainText(firstContent.segments).replace(/\s+/g, " ").trim(), 34);
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatSessionTime(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "刚刚";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  if (now.toDateString() === date.toDateString()) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function normalizeConfigValue(value: string | undefined, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function configKey(config: Partial<SessionConfig> & { sessionId?: string }) {
  return [
    config.workspacePath ?? "",
    config.provider ?? "",
    config.model ?? "",
    config.apiKeyEnvName ?? "",
    config.sessionId ?? "",
  ].join("::");
}

type StateUpdater<T> = T | ((current: T) => T);

function resolveUpdater<T>(updater: StateUpdater<T>, current: T) {
  return typeof updater === "function"
    ? (updater as (value: T) => T)(current)
    : updater;
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatModel(state: PiSessionState | null) {
  if (!state?.model?.provider || !state.model.id) {
    return "";
  }

  return `${state.model.provider}/${state.model.id}`;
}

function formatConnectionStatus(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return "已连接";
    case "connecting":
      return "连接中";
    case "error":
      return "异常";
    default:
      return "待连接";
  }
}

function resolveConfiguredApiKeyEnvName(
  provider: string,
  configSnapshot: PiConfigSnapshot | null,
  catalog: PiProviderCatalog | null,
) {
  const savedConfig = configSnapshot?.providers.find(
    (entry) => entry.provider === provider,
  );
  const providerEntry = findProviderEntry(catalog, provider);

  return (
    savedConfig?.apiKeyEnvName ||
    providerEntry?.apiKeyEnvName ||
    inferApiKeyEnv(provider)
  );
}

function buildProviderDraftMap(
  catalog: PiProviderCatalog | null,
  configSnapshot: PiConfigSnapshot | null,
) {
  const drafts: Record<string, ProviderDraft> = {};
  for (const entry of flattenProviderCatalog(catalog)) {
    const saved = configSnapshot?.providers.find((provider) => provider.provider === entry.provider);
    drafts[entry.provider] = {
      provider: entry.provider,
      kind: entry.kind,
      label: entry.label,
      enabled: saved?.enabled ?? true,
      defaultModel: saved?.defaultModel || entry.defaultModel,
      apiKeyEnvName:
        saved?.apiKeyEnvName || entry.apiKeyEnvName || inferApiKeyEnv(entry.provider),
      baseUrl: saved?.baseUrl || "",
      headers: saved?.headers || {},
      hasStoredCredential: Boolean(saved?.hasStoredCredential),
      apiKeyDraft: "",
      dirty: false,
    };
  }

  return drafts;
}

function formatComposerModelLabel(model: string) {
  const normalized = model.trim();
  if (!normalized) {
    return "未选择模型";
  }

  if (normalized.includes("/")) {
    return normalized.split("/").pop() || normalized;
  }

  return normalized;
}

function formatAttachmentLabel(path: string) {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized) {
    return "未命名文件";
  }

  return normalized.split("/").pop() || normalized;
}

function normalizeFileDialogSelection(selection: string | string[] | null) {
  if (!selection) {
    return [];
  }

  return Array.isArray(selection) ? selection.filter(Boolean) : [selection];
}

function mergeComposerAttachments(
  currentAttachments: ComposerAttachment[],
  nextPaths: string[],
) {
  const nextAttachmentMap = new Map(
    currentAttachments.map((attachment) => [attachment.path, attachment] as const),
  );

  nextPaths.forEach((path) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return;
    }

    nextAttachmentMap.set(normalizedPath, {
      path: normalizedPath,
      label: formatAttachmentLabel(normalizedPath),
    });
  });

  return [...nextAttachmentMap.values()];
}

function buildAttachmentMarkdownBlock(attachments: ComposerAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  return `参考文件：\n${attachments
    .map((attachment) => `- \`${attachment.label}\``)
    .join("\n")}`;
}

function buildUserFacingPrompt(text: string, attachments: ComposerAttachment[]) {
  const trimmedText = text.trim();
  const attachmentBlock = buildAttachmentMarkdownBlock(attachments);
  if (trimmedText && attachmentBlock) {
    return `${trimmedText}\n\n${attachmentBlock}`;
  }

  if (trimmedText) {
    return trimmedText;
  }

  return attachmentBlock || "请查看这些文件。";
}

function buildPromptForPi(text: string, attachments: ComposerAttachment[]) {
  const trimmedText = text.trim();
  if (attachments.length === 0) {
    return trimmedText;
  }

  const attachmentLines = attachments.map((attachment) => `- ${attachment.path}`).join("\n");
  const attachmentBlock = `附加文件路径：\n${attachmentLines}\n\n请把这些文件作为当前任务的上下文，需要时直接读取它们。`;

  if (trimmedText) {
    return `${trimmedText}\n\n${attachmentBlock}`;
  }

  return `${attachmentBlock}\n\n请先查看这些文件，再继续当前任务。`;
}

function buildModelMenuSearchText(
  providerEntry: PiProviderCatalogEntry,
  model?: PiProviderCatalogEntry["models"][number],
) {
  const parts = [
    providerEntry.label,
    providerEntry.provider,
    model?.id,
    model?.name,
    model ? formatModelCapabilityLabel(model) : null,
  ].filter(Boolean);

  return parts.join(" ").toLowerCase();
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    items.push("ellipsis");
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push("ellipsis");
  }

  items.push(totalPages);
  return items;
}

function formatModelCapabilityLabel(model: PiProviderCatalogEntry["models"][number]) {
  const capabilities = [
    model.reasoning ? "reasoning" : null,
    model.supportsImages ? "vision" : null,
    model.contextWindow > 0 ? formatContextWindow(model.contextWindow) : null,
  ].filter(Boolean);

  return capabilities.join(" · ") || "standard";
}

function flattenProviderCatalog(catalog: PiProviderCatalog | null) {
  if (!catalog) {
    return [];
  }

  return [...catalog.customProviders, ...catalog.builtinProviders];
}

function findProviderEntry(catalog: PiProviderCatalog | null, provider: string) {
  return flattenProviderCatalog(catalog).find((entry) => entry.provider === provider) ?? null;
}

function hasProviderCatalogEntry(catalog: PiProviderCatalog | null, provider: string) {
  return Boolean(findProviderEntry(catalog, provider));
}

function resolveProviderDefaultModel(
  providerEntry: PiProviderCatalogEntry,
  configuredProvider:
    | {
        defaultModel: string;
      }
    | null
    | undefined,
  configSnapshot: PiConfigSnapshot | null,
  bootstrapInfo: PiBootstrapInfo | null,
) {
  const configuredModel = configuredProvider?.defaultModel;
  if (configuredModel && providerEntry.models.some((entry) => entry.id === configuredModel)) {
    return configuredModel;
  }

  if (
    bootstrapInfo?.defaultProvider === providerEntry.provider &&
    bootstrapInfo.defaultModel &&
    providerEntry.models.some((entry) => entry.id === bootstrapInfo.defaultModel)
  ) {
    return bootstrapInfo.defaultModel;
  }

  if (
    configSnapshot?.defaults.provider === providerEntry.provider &&
    configSnapshot.defaults.model &&
    providerEntry.models.some((entry) => entry.id === configSnapshot.defaults.model)
  ) {
    return configSnapshot.defaults.model;
  }

  return providerEntry.defaultModel || providerEntry.models[0]?.id || "";
}

function toMarkdownSegments(text: string): ChatSegment[] {
  if (!text.trim()) {
    return [];
  }

  return [{ type: "markdown_text", text }];
}

function appendMarkdownDelta(segments: ChatSegment[], delta: string) {
  const nextSegments = [...segments];
  const lastSegment = nextSegments[nextSegments.length - 1];
  if (lastSegment?.type === "markdown_text") {
    lastSegment.text += delta;
    return nextSegments;
  }

  nextSegments.push({ type: "markdown_text", text: delta });
  return nextSegments;
}

function appendThinkingDelta(segments: ChatSegment[], delta: string) {
  const nextSegments = [...segments];
  const lastSegment = nextSegments[nextSegments.length - 1];
  if (lastSegment?.type === "thinking") {
    lastSegment.text += delta;
    lastSegment.isStreaming = true;
    return nextSegments;
  }

  nextSegments.push({ type: "thinking", text: delta, isStreaming: true });
  return nextSegments;
}

function parseAssistantMessage(message: Record<string, unknown>, fallbackId: string) {
  const content = Array.isArray(message.content) ? message.content : [];
  const segments: ChatSegment[] = [];

  for (const block of content) {
    const nextBlock = asRecord(block);
    if (!nextBlock) {
      continue;
    }

    if (nextBlock.type === "text") {
      const text = asString(nextBlock.text);
      if (text) {
        segments.push({ type: "markdown_text", text });
      }
      continue;
    }

    if (nextBlock.type === "thinking") {
      const text = asString(nextBlock.thinking);
      if (text) {
        segments.push({ type: "thinking", text, isStreaming: false });
      }
      continue;
    }

    if (nextBlock.type === "toolCall") {
      segments.push({
        type: "tool_call",
        toolCallId: asString(nextBlock.id) || `${asString(nextBlock.name)}-${segments.length}`,
        toolName: asString(nextBlock.name) || "unknown",
        args: nextBlock.arguments,
        status: "pending",
      });
    }
  }

  return {
    id: asString(message.id) || fallbackId,
    createdAt: normalizeMessageTimestamp(message.timestamp),
    role: "assistant" as const,
    segments: segments.map((segment) =>
      segment.type === "thinking"
        ? {
            ...segment,
            isStreaming: false,
          }
        : segment,
    ),
    meta: "PI",
    provider: asString(message.provider),
    model: asString(message.model),
    usage: parseUsageSummary(asRecord(message.usage)),
    stopReason: asString(message.stopReason),
  };
}

function parseUsageSummary(usage: Record<string, unknown> | null): PiUsageSummary | null {
  if (!usage) {
    return null;
  }

  return {
    input: numberOrNull(usage.input),
    output: numberOrNull(usage.output),
    cacheRead: numberOrNull(usage.cacheRead),
    cacheWrite: numberOrNull(usage.cacheWrite),
    totalTokens: numberOrNull(usage.totalTokens),
    costTotal: numberOrNull(asRecord(usage.cost)?.total),
    contextTokens: numberOrNull(usage.contextTokens) ?? numberOrNull(usage.totalTokens),
    turnCount: 1,
  };
}

function accumulateUsageSummary(current: PiUsageSummary, next: PiUsageSummary): PiUsageSummary {
  return {
    input: sumNullable(current.input, next.input),
    output: sumNullable(current.output, next.output),
    cacheRead: sumNullable(current.cacheRead, next.cacheRead),
    cacheWrite: sumNullable(current.cacheWrite, next.cacheWrite),
    totalTokens: sumNullable(current.totalTokens, next.totalTokens),
    costTotal: sumNullable(current.costTotal, next.costTotal),
    contextTokens: next.contextTokens ?? current.contextTokens,
    turnCount: current.turnCount + 1,
  };
}

function upsertToolCallSegment(segments: ChatSegment[], toolCall: Record<string, unknown>) {
  const toolCallId = asString(toolCall.id) || `${asString(toolCall.name)}-${segments.length}`;
  const nextSegments = [...segments];
  const existingIndex = nextSegments.findIndex(
    (segment) => segment.type === "tool_call" && segment.toolCallId === toolCallId,
  );
  const nextSegment: Extract<ChatSegment, { type: "tool_call" }> = {
    type: "tool_call",
    toolCallId,
    toolName: asString(toolCall.name) || "unknown",
    args: toolCall.arguments,
    status: "pending",
  };

  if (existingIndex >= 0) {
    nextSegments[existingIndex] = {
      ...(nextSegments[existingIndex] as Extract<ChatSegment, { type: "tool_call" }>),
      ...nextSegment,
    };
    return nextSegments;
  }

  nextSegments.push(nextSegment);
  return nextSegments;
}

function buildToolExecutionRecord(
  current: ToolExecutionRecord | undefined,
  rpcEvent: Record<string, unknown>,
  status: ToolExecutionRecord["status"],
): ToolExecutionRecord {
  const startedAt =
    current?.startedAt || new Date().toISOString();
  const finishedAt = status === "running" ? current?.finishedAt : new Date().toISOString();
  const durationMs =
    finishedAt
      ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
      : current?.durationMs;

  return {
    toolCallId: asString(rpcEvent.toolCallId),
    toolName: asString(rpcEvent.toolName) || current?.toolName || "unknown",
    args: rpcEvent.args ?? current?.args,
    status,
    startedAt,
    finishedAt,
    durationMs,
    partialResult: rpcEvent.partialResult ?? current?.partialResult,
    result: rpcEvent.result ?? current?.result,
    isError: Boolean(rpcEvent.isError),
  };
}

function markToolExecutionsStopped(
  executions: Record<string, ToolExecutionRecord>,
  finishedAt: string,
  reason: string,
): Record<string, ToolExecutionRecord> {
  let changed = false;
  const nextExecutions: Record<string, ToolExecutionRecord> = {};

  for (const [toolCallId, execution] of Object.entries(executions)) {
    if (execution.status === "running" || execution.status === "pending") {
      changed = true;
      nextExecutions[toolCallId] = {
        ...execution,
        status: "error" as const,
        finishedAt,
        durationMs: execution.startedAt
          ? Math.max(0, new Date(finishedAt).getTime() - new Date(execution.startedAt).getTime())
          : execution.durationMs,
        result: execution.result ?? { message: reason },
        partialResult: execution.partialResult ?? execution.result,
        isError: true,
      };
      continue;
    }

    nextExecutions[toolCallId] = execution;
  }

  return changed ? nextExecutions : executions;
}

function stopRunningToolSegments(
  segments: ChatSegment[],
  finishedAt: string,
  reason: string,
): ChatSegment[] {
  return segments.map((segment) => {
    if (segment.type !== "tool_call" && segment.type !== "tool_result") {
      return segment;
    }

    if (segment.status !== "running" && segment.status !== "pending") {
      return segment;
    }

    const durationMs = segment.startedAt
      ? Math.max(0, new Date(finishedAt).getTime() - new Date(segment.startedAt).getTime())
      : segment.durationMs;

    if (segment.type === "tool_call") {
      const nextSegment: Extract<ChatSegment, { type: "tool_call" }> = {
        ...segment,
        status: "error",
        finishedAt,
        durationMs,
        isError: true,
      };

      return nextSegment;
    }

    const nextSegment: Extract<ChatSegment, { type: "tool_result" }> = {
      ...segment,
      status: "error",
      finishedAt,
      durationMs,
      partialResult: segment.partialResult ?? segment.result,
      result: segment.result ?? { message: reason },
      isError: true,
    };

    return nextSegment;
  });
}

function updateToolExecutionSegments(
  segments: ChatSegment[],
  toolCallId: string,
  execution: ToolExecutionRecord,
  options?: {
    allowInsertIfMissing?: boolean;
  },
) {
  const nextSegments = segments.map((segment) => {
    if (segment.type !== "tool_call" && segment.type !== "tool_result") {
      return segment;
    }

    if (segment.toolCallId !== toolCallId) {
      return segment;
    }

    if (segment.type === "tool_call") {
      return {
        ...segment,
        status: execution.status,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
        durationMs: execution.durationMs,
        isError: execution.isError,
      };
    }

    return {
      ...segment,
      status: execution.status,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
      durationMs: execution.durationMs,
      partialResult: execution.partialResult,
      result: execution.result,
      isError: execution.isError,
    };
  });

  const hasOutput =
    execution.result !== undefined ||
    execution.partialResult !== undefined ||
    execution.isError;
  if (!hasOutput) {
    return nextSegments;
  }

  const outputSegment: Extract<ChatSegment, { type: "tool_result" }> = {
    type: "tool_result",
    toolCallId,
    toolName: execution.toolName,
    status: execution.status,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    partialResult: execution.partialResult,
    result: execution.result,
    isError: execution.isError,
  };

  const resultIndex = nextSegments.findIndex(
    (segment) => segment.type === "tool_result" && segment.toolCallId === toolCallId,
  );
  const callIndex = nextSegments.findIndex(
    (segment) => segment.type === "tool_call" && segment.toolCallId === toolCallId,
  );

  if (resultIndex < 0 && callIndex < 0 && !options?.allowInsertIfMissing) {
    return nextSegments;
  }

  if (resultIndex >= 0) {
    nextSegments[resultIndex] = outputSegment;
    return nextSegments;
  }

  if (callIndex >= 0) {
    nextSegments.splice(callIndex + 1, 0, outputSegment);
    return nextSegments;
  }

  nextSegments.push(outputSegment);
  return nextSegments;
}

function normalizeStoredSession(
  raw: Record<string, unknown>,
  fallbackConfig: SessionConfig,
): StoredSession | null {
  const id = asString(raw.id);
  if (!id) {
    return null;
  }

  const messages = Array.isArray(raw.messages)
    ? raw.messages.flatMap((message) => normalizeStoredMessage(asRecord(message)))
    : [];
  const repairedMessages = repairLoadedMessages(messages);
  const events = Array.isArray(raw.events)
    ? raw.events.flatMap((event) => normalizeEventRecord(asRecord(event)))
    : [];

  return {
    id,
    title: asString(raw.title) || "New Session",
    createdAt: asString(raw.createdAt) || new Date().toISOString(),
    updatedAt: asString(raw.updatedAt) || new Date().toISOString(),
    messages: repairedMessages,
    events,
    workspacePath: asString(raw.workspacePath) || fallbackConfig.workspacePath,
    provider: asString(raw.provider) || fallbackConfig.provider,
    model: asString(raw.model) || fallbackConfig.model,
    apiKeyEnvName: asString(raw.apiKeyEnvName) || fallbackConfig.apiKeyEnvName,
    runtimeState: isRuntimeStateValue(raw.runtimeState) ? raw.runtimeState : "idle",
    usage: normalizeUsageSummary(asRecord(raw.usage)),
    diagnostics: normalizeDiagnostics(asRecord(raw.diagnostics)),
    toolExecutions: normalizeToolExecutions(asRecord(raw.toolExecutions)),
  };
}

function serializeStoredSession(session: StoredSession) {
  return session as unknown as Record<string, unknown>;
}

function normalizeStoredMessage(message: Record<string, unknown> | null): UiMessage[] {
  if (!message) {
    return [];
  }

  const role = message.role;
  if (role !== "user" && role !== "assistant" && role !== "system") {
    return [];
  }

  const segments = Array.isArray(message.segments)
    ? message.segments.flatMap((segment) => normalizeSegment(asRecord(segment)))
    : [];

  return [
    {
      id: asString(message.id) || `message-${Date.now()}`,
      role,
      createdAt: asString(message.createdAt) || new Date().toISOString(),
      segments,
      meta: asString(message.meta),
      tone:
        message.tone === "error" || message.tone === "muted" || message.tone === "default"
          ? message.tone
          : undefined,
      provider: asString(message.provider),
      model: asString(message.model),
      usage: parseUsageSummary(asRecord(message.usage)),
      stopReason: asString(message.stopReason),
    },
  ];
}

function repairLoadedMessages(messages: UiMessage[]) {
  if (messages.length === 0) {
    return messages;
  }

  const toolCallOwners = new Map<string, number>();
  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const segment of message.segments) {
      if (segment.type !== "tool_call" || !segment.toolCallId) {
        continue;
      }

      if (!toolCallOwners.has(segment.toolCallId)) {
        toolCallOwners.set(segment.toolCallId, index);
      }
    }
  }

  const repaired = messages.map((message) => ({
    ...message,
    segments: [] as ChatSegment[],
  }));
  const queuedByAssistant = new Map<
    number,
    Array<Extract<ChatSegment, { type: "tool_call" | "tool_result" }>>
  >();

  for (const [index, message] of messages.entries()) {
    for (const segment of message.segments) {
      if (segment.type === "markdown_text") {
        repaired[index].segments.push(segment);
        continue;
      }

      if (segment.type === "thinking") {
        if (message.role === "assistant") {
          repaired[index].segments.push({
            ...segment,
            isStreaming: false,
          });
        }
        continue;
      }

      if (segment.type === "tool_call") {
        const ownerIndex = toolCallOwners.get(segment.toolCallId);
        if (message.role === "assistant" && ownerIndex === index) {
          repaired[index].segments = mergeToolSegmentIntoAssistantSegments(
            repaired[index].segments,
            segment,
          );
          continue;
        }

        if (ownerIndex !== undefined) {
          const queue = queuedByAssistant.get(ownerIndex) ?? [];
          queue.push(segment);
          queuedByAssistant.set(ownerIndex, queue);
        }
        continue;
      }

      if (segment.type === "tool_result") {
        const ownerIndex = toolCallOwners.get(segment.toolCallId);
        if (message.role === "assistant" && ownerIndex === index) {
          repaired[index].segments = mergeToolSegmentIntoAssistantSegments(
            repaired[index].segments,
            segment,
          );
          continue;
        }

        if (ownerIndex !== undefined) {
          const queue = queuedByAssistant.get(ownerIndex) ?? [];
          queue.push(segment);
          queuedByAssistant.set(ownerIndex, queue);
        }
      }
    }
  }

  for (const [ownerIndex, queuedSegments] of queuedByAssistant.entries()) {
    let nextSegments = repaired[ownerIndex].segments;
    for (const segment of queuedSegments) {
      nextSegments = mergeToolSegmentIntoAssistantSegments(nextSegments, segment);
    }
    repaired[ownerIndex].segments = nextSegments;
  }

  return repaired.filter((message) => message.segments.length > 0);
}

function mergeToolSegmentIntoAssistantSegments(
  segments: ChatSegment[],
  incoming:
    | Extract<ChatSegment, { type: "tool_call" }>
    | Extract<ChatSegment, { type: "tool_result" }>,
) {
  if (incoming.type === "tool_call") {
    if (
      segments.some(
        (segment) => segment.type === "tool_call" && segment.toolCallId === incoming.toolCallId,
      )
    ) {
      return segments;
    }

    return [...segments, incoming];
  }

  const resultIndex = segments.findIndex(
    (segment) => segment.type === "tool_result" && segment.toolCallId === incoming.toolCallId,
  );
  if (resultIndex >= 0) {
    const nextSegments = [...segments];
    nextSegments[resultIndex] = pickPreferredToolResultSegment(
      nextSegments[resultIndex] as Extract<ChatSegment, { type: "tool_result" }>,
      incoming,
    );
    return nextSegments;
  }

  const callIndex = segments.findIndex(
    (segment) => segment.type === "tool_call" && segment.toolCallId === incoming.toolCallId,
  );
  if (callIndex >= 0) {
    const nextSegments = [...segments];
    nextSegments.splice(callIndex + 1, 0, incoming);
    return nextSegments;
  }

  return [...segments, incoming];
}

function pickPreferredToolResultSegment(
  current: Extract<ChatSegment, { type: "tool_result" }>,
  incoming: Extract<ChatSegment, { type: "tool_result" }>,
) {
  return scoreToolResultSegment(incoming) >= scoreToolResultSegment(current) ? incoming : current;
}

function scoreToolResultSegment(segment: Extract<ChatSegment, { type: "tool_result" }>) {
  let score = 0;
  if (segment.result !== undefined) {
    score += 4;
  }
  if (segment.partialResult !== undefined) {
    score += 2;
  }
  if (segment.status === "success" || segment.status === "error") {
    score += 1;
  }
  if (segment.isError) {
    score += 1;
  }
  return score;
}

function normalizeSegment(segment: Record<string, unknown> | null): ChatSegment[] {
  if (!segment) {
    return [];
  }

  if (segment.type === "markdown_text") {
    return [{ type: "markdown_text", text: asString(segment.text) }];
  }

  if (segment.type === "thinking") {
    return [
      {
        type: "thinking",
        text: asString(segment.text),
        isStreaming: Boolean(segment.isStreaming),
      },
    ];
  }

  if (segment.type === "tool_call" || segment.type === "tool_result") {
    return [
      {
        type: segment.type,
        toolCallId: asString(segment.toolCallId),
        toolName: asString(segment.toolName) || "unknown",
        args: segment.args,
        status: isToolStatus(segment.status) ? segment.status : "pending",
        startedAt: asString(segment.startedAt) || undefined,
        finishedAt: asString(segment.finishedAt) || undefined,
        durationMs: numberOrNull(segment.durationMs) ?? undefined,
        result: segment.result,
        partialResult: segment.partialResult,
        isError: Boolean(segment.isError),
      },
    ];
  }

  return [];
}

function normalizeEventRecord(event: Record<string, unknown> | null): PiEventRecord[] {
  if (!event) {
    return [];
  }

  return [
    {
      id: asString(event.id) || `event-${Date.now()}`,
      sessionId: asString(event.sessionId),
      timestamp: asString(event.timestamp) || new Date().toISOString(),
      source: asString(event.source) || "runtime",
      kind: asString(event.kind) || "event",
      severity:
        event.severity === "warning" || event.severity === "error" || event.severity === "info"
          ? event.severity
          : "info",
      summary: asString(event.summary),
      toolCallId: asString(event.toolCallId) || undefined,
      payload: asRecord(event.payload),
    },
  ];
}

function normalizeUsageSummary(usage: Record<string, unknown> | null): PiUsageSummary {
  return (
    parseUsageSummary(usage) ?? {
      ...createEmptyUsageSummary(),
      turnCount: numberOrNull(usage?.turnCount) ?? 0,
      contextTokens: numberOrNull(usage?.contextTokens),
    }
  );
}

function normalizeDiagnostics(diagnostics: Record<string, unknown> | null): PiDiagnosticsState {
  return {
    stderrCount: numberOrNull(diagnostics?.stderrCount) ?? 0,
    errorCount: numberOrNull(diagnostics?.errorCount) ?? 0,
    lastError: asString(diagnostics?.lastError),
    lastEventAt: asString(diagnostics?.lastEventAt),
  };
}

function normalizeToolExecutions(
  toolExecutions: Record<string, unknown> | null,
): Record<string, ToolExecutionRecord> {
  if (!toolExecutions) {
    return {};
  }

  const nextRecords: Record<string, ToolExecutionRecord> = {};
  for (const [toolCallId, value] of Object.entries(toolExecutions)) {
    const record = asRecord(value);
    if (!record) {
      continue;
    }

    nextRecords[toolCallId] = {
      toolCallId,
      toolName: asString(record.toolName) || "unknown",
      args: record.args,
      status: isToolStatus(record.status) ? record.status : "pending",
      startedAt: asString(record.startedAt) || undefined,
      finishedAt: asString(record.finishedAt) || undefined,
      durationMs: numberOrNull(record.durationMs) ?? undefined,
      partialResult: record.partialResult,
      result: record.result,
      isError: Boolean(record.isError),
    };
  }

  return nextRecords;
}

function normalizeMessageTimestamp(value: unknown) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return new Date().toISOString();
}

function segmentsToPlainText(segments: ChatSegment[]) {
  return segments
    .map((segment) => {
      if (segment.type === "markdown_text") {
        return segment.text;
      }
      if (segment.type === "thinking") {
        return segment.text;
      }
      return segment.toolName;
    })
    .join("\n")
    .trim();
}

function formatUsageValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }

  return formatCompactTokens(value);
}

function formatContextWindow(value: number) {
  return formatCompactTokens(value);
}

function buildContextUsageMeta(usage: PiUsageSummary, contextLimit: number) {
  const used = usage.contextTokens ?? usage.totalTokens;
  const contextLabel = contextLimit > 0 ? formatCompactTokens(contextLimit) : "--";
  if (used === null || used === undefined) {
    return {
      label: `Context -- / ${contextLabel} · usage unavailable`,
      tone: "neutral" as const,
    };
  }

  if (contextLimit <= 0) {
    return {
      label: `Context ${formatCompactTokens(used)} / --`,
      tone: "neutral" as const,
    };
  }

  const ratio = used / contextLimit;
  if (ratio >= 0.95) {
    return {
      label: `Context ${formatCompactTokens(used)} / ${contextLabel} · 危险`,
      tone: "error" as const,
    };
  }
  if (ratio >= 0.85) {
    return {
      label: `Context ${formatCompactTokens(used)} / ${contextLabel} · 警示`,
      tone: "busy" as const,
    };
  }

  return {
    label: `Context ${formatCompactTokens(used)} / ${contextLabel}`,
    tone: "neutral" as const,
  };
}

function sumSessionUsageValue(
  sessions: StoredSession[],
  key: keyof Pick<PiUsageSummary, "input" | "output" | "totalTokens">,
) {
  let total = 0;
  let hasValue = false;
  for (const session of sessions) {
    const value = session.usage[key];
    if (value !== null && value !== undefined) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function formatCompactTokens(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return `${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function summarizeToolCall(
  segment: Extract<ChatSegment, { type: "tool_call" | "tool_result" }>,
) {
  if (segment.status === "error") {
    return "工具执行失败。展开下方输出可以查看返回内容。";
  }

  if (segment.status === "running") {
    return "工具正在处理当前步骤。";
  }

  if (segment.status === "success") {
    return "工具已完成，输出结果见下方。";
  }

  return "准备调用工具处理当前步骤。";
}

function summarizeToolOutput(
  segment: Extract<ChatSegment, { type: "tool_call" | "tool_result" }>,
) {
  const payload = getToolOutputPayload(segment);
  if (payload === undefined) {
    return segment.isError ? "工具返回了错误。" : "工具已返回输出。";
  }

  if (typeof payload === "string") {
    return truncateText(payload.trim() || "工具已返回输出。", 160);
  }

  if (Array.isArray(payload)) {
    return `工具返回了 ${payload.length} 条结果。`;
  }

  if (payload && typeof payload === "object") {
    const keys = Object.keys(payload as Record<string, unknown>).filter(Boolean);
    if (keys.length === 0) {
      return "工具已返回输出。";
    }
    return `工具已返回输出，包含 ${truncateText(keys.join(" / "), 80)}。`;
  }

  return `工具输出：${String(payload)}`;
}

function getToolOutputPayload(
  segment: Extract<ChatSegment, { type: "tool_call" | "tool_result" }>,
) {
  if (segment.result !== undefined) {
    return segment.result;
  }

  if (segment.partialResult !== undefined) {
    return segment.partialResult;
  }

  return undefined;
}

function formatToolOutputPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  return JSON.stringify(payload, null, 2);
}

async function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(text);
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNullable(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return null;
  }

  return (left ?? 0) + (right ?? 0);
}

function isRuntimeStateValue(value: unknown): value is RuntimeState {
  return (
    value === "idle" ||
    value === "connecting" ||
    value === "connected" ||
    value === "streaming" ||
    value === "stopped" ||
    value === "error"
  );
}

function isToolStatus(value: unknown): value is ToolExecutionRecord["status"] {
  return value === "pending" || value === "running" || value === "success" || value === "error";
}

function resolveRuntimeState(connectionStatus: ConnectionStatus, isBusy: boolean): RuntimeState {
  if (connectionStatus === "connecting") {
    return "connecting";
  }

  if (connectionStatus === "error") {
    return "error";
  }

  if (connectionStatus === "connected" && isBusy) {
    return "streaming";
  }

  if (connectionStatus === "connected") {
    return "connected";
  }

  return "idle";
}

function providerInitials(provider: string) {
  const segments = provider
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (segments.length === 0) {
    return "AI";
  }

  return segments
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function providerAccentColor(provider: string) {
  const palette = [
    "#0a84ff",
    "#06b6d4",
    "#2563eb",
    "#14b8a6",
    "#f97316",
    "#dc2626",
    "#7c3aed",
    "#0891b2",
  ];
  let hash = 0;
  for (let index = 0; index < provider.length; index += 1) {
    hash = (hash * 31 + provider.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

function normalizeProviderToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function resolveProviderIconPack(provider: string) {
  const alias = providerIconAliasMap[provider] ?? provider;
  return lobeProviderIconRegistry.get(normalizeProviderToken(alias)) ?? null;
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "发生了未知错误。";
}

export default App;
