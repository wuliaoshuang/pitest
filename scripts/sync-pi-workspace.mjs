import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const templateRoot = join(projectRoot, "src-tauri", "resources", "pi-workspace-template");
const workspaceRoot = resolve(process.env.PITEST_WORKSPACE || join(homedir(), ".pitest"));

const builtinEnvMap = {
  anthropic: "ANTHROPIC_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  google: "GEMINI_API_KEY",
  "google-antigravity": "GEMINI_API_KEY",
  "google-gemini-cli": "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
};

main();

function main() {
  ensureDir(workspaceRoot);
  ensureWorkspaceState();
  syncTemplates();

  const providerCatalog = getProviderCatalog();
  const configPath = join(workspaceRoot, ".pitest.json");
  const existingConfig = readJsonIfExists(configPath) || createDefaultConfig();
  const normalizedConfig = normalizeConfig(existingConfig, workspaceRoot, providerCatalog);
  writeJson(configPath, normalizedConfig);

  const agentRuntimeDir = join(workspaceRoot, ".pi", "agent-runtime");
  ensureDir(agentRuntimeDir);
  const authPath = join(agentRuntimeDir, "auth.json");
  if (!existsSync(authPath)) {
    writeJson(authPath, {});
  }

  const modelsPath = join(agentRuntimeDir, "models.json");
  writeJson(modelsPath, buildModelsJson(normalizedConfig, providerCatalog));
  const settingsPath = join(workspaceRoot, ".pi", "settings.json");
  ensureDir(dirname(settingsPath));
  writeJson(settingsPath, buildSettingsJson(normalizedConfig));

  console.log(JSON.stringify({
    workspacePath: workspaceRoot,
    configPath,
    authPath,
    modelsPath,
    settingsPath,
    defaultProvider: normalizedConfig.defaults.provider,
    defaultModel: normalizedConfig.defaults.model,
  }, null, 2));
}

function syncTemplates() {
  const overwriteFiles = new Set(["AGENTS.md", ".pi/APPEND_SYSTEM.md"]);
  const createIfMissingFiles = [
    "IDENTITY.md",
    "SOUL.md",
    "USER.md",
    "TOOLS.md",
    "HEARTBEAT.md",
    "MEMORY.md",
  ];

  for (const relativePath of overwriteFiles) {
    copyTemplateFile(relativePath, true);
  }

  for (const relativePath of createIfMissingFiles) {
    copyTemplateFile(relativePath, false);
  }

  const memoryDir = join(templateRoot, "memory");
  if (!existsSync(memoryDir)) {
    return;
  }

  for (const fileName of readdirSync(memoryDir)) {
    const sourcePath = join(memoryDir, fileName);
    if (!statSync(sourcePath).isFile()) {
      continue;
    }
    copyTemplateFile(join("memory", fileName), false);
  }

  syncBootstrapContract();
}

function copyTemplateFile(relativePath, overwrite) {
  const sourcePath = join(templateRoot, relativePath);
  const targetPath = join(workspaceRoot, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing workspace template file: ${sourcePath}`);
  }

  if (existsSync(targetPath) && !overwrite) {
    return;
  }

  ensureDir(dirname(targetPath));
  writeFileSync(targetPath, readFileSync(sourcePath, "utf8"), "utf8");
}

function workspaceStatePath() {
  return join(workspaceRoot, ".pitest", "workspace-state.json");
}

function ensureWorkspaceState() {
  const targetPath = workspaceStatePath();
  ensureDir(dirname(targetPath));
  if (existsSync(targetPath)) {
    return readJsonIfExists(targetPath);
  }

  const state = {
    version: 1,
    bootstrapSeededAt: new Date().toISOString(),
  };
  writeJson(targetPath, state);
  return state;
}

function syncBootstrapContract() {
  const onboarding = inspectWorkspaceOnboarding();
  const bootstrapPath = join(workspaceRoot, "BOOTSTRAP.md");
  if (onboarding.required) {
    copyTemplateFile("BOOTSTRAP.md", true);
    return;
  }

  if (existsSync(bootstrapPath)) {
    unlinkSync(bootstrapPath);
  }
}

function inspectWorkspaceOnboarding() {
  const identityRaw = existsSync(join(workspaceRoot, "IDENTITY.md"))
    ? readFileSync(join(workspaceRoot, "IDENTITY.md"), "utf8")
    : "";
  const userRaw = existsSync(join(workspaceRoot, "USER.md"))
    ? readFileSync(join(workspaceRoot, "USER.md"), "utf8")
    : "";

  const assistantName = parseMarkdownField(identityRaw, "Name");
  const assistantCreature = parseMarkdownField(identityRaw, "Creature");
  const assistantVibe = parseMarkdownField(identityRaw, "Vibe");
  const userName = parseMarkdownField(userRaw, "Name");
  const userCallName = parseMarkdownField(userRaw, "What to call them");
  const userTimezone = parseMarkdownField(userRaw, "Timezone");

  const assistantIdentityKnown = [assistantName, assistantCreature, assistantVibe].every(
    (value) => isMeaningfulIdentityValue(value),
  );
  const userIdentityKnown = [userName, userCallName, userTimezone].every((value) =>
    isMeaningfulIdentityValue(value)
  );

  return {
    required: !(assistantIdentityKnown && userIdentityKnown),
  };
}

function parseMarkdownField(content, field) {
  const prefixes = [
    `- **${field}:**`,
    `**${field}:**`,
    `- ${field}:`,
    `${field}:`,
  ];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    for (const prefix of prefixes) {
      if (line.startsWith(prefix)) {
        const value = line.slice(prefix.length).trim().replace(/^`|`$/g, "").trim();
        return value || "";
      }
    }
  }

  return "";
}

function isMeaningfulIdentityValue(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^[([\"']+/, "")
    .replace(/[)\]\"']+$/, "")
    .trim()
    .toLowerCase();

  return ![
    "",
    "unknown",
    "unk",
    "tbd",
    "todo",
    "n/a",
    "none",
    "待定",
    "待填写",
    "未设置",
    "待补充",
    "to be decided",
    "to be filled",
    "placeholder",
    "your name",
    "assistant name",
    "user name",
    "unknown user",
    "unknown assistant",
    "to be learned",
  ].includes(normalized);
}

function createDefaultConfig() {
  return {
    meta: {
      schemaVersion: 1,
      source: "pi-test",
    },
    defaults: {
      provider: "",
      model: "",
    },
    providers: [],
    workspace: {
      path: "",
    },
    compat: defaultCompatConfig(),
  };
}

function normalizeConfig(config, workspacePath, providerCatalog) {
  const next = structuredClone(config);
  next.meta = {
    schemaVersion: 1,
    source: typeof next.meta?.source === "string" && next.meta.source.trim()
      ? next.meta.source.trim()
      : "pi-test",
  };
  next.workspace = {
    path: workspacePath,
  };
  next.compat = next.compat && typeof next.compat === "object"
    ? next.compat
    : defaultCompatConfig();
  next.providers = normalizeProviders(Array.isArray(next.providers) ? next.providers : [], providerCatalog);

  const fallbackProvider =
    findProvider(providerCatalog, "zai")?.provider ||
    providerCatalog.builtinProviders[0]?.provider ||
    providerCatalog.customProviders[0]?.provider ||
    "deepseek";

  if (!findProvider(providerCatalog, next.defaults?.provider || "")) {
    next.defaults = {
      ...next.defaults,
      provider: fallbackProvider,
    };
  }

  next.defaults = {
    provider: next.defaults.provider,
    model: resolveModelForProvider(
      providerCatalog,
      next.providers,
      next.defaults.provider,
      next.defaults?.model,
    ),
  };

  return next;
}

function normalizeProviders(providers, providerCatalog) {
  const deduped = new Map();

  for (const entry of providers) {
    const provider = typeof entry?.provider === "string" ? entry.provider.trim() : "";
    if (!provider) {
      continue;
    }

    deduped.set(provider, {
      provider,
      kind: provider === "deepseek" ? "app-custom" : "pi-builtin",
      enabled: entry?.enabled !== false,
      defaultModel: resolveModelForProvider(
        providerCatalog,
        [],
        provider,
        typeof entry?.defaultModel === "string" ? entry.defaultModel : "",
      ),
      apiKeyEnvName:
        typeof entry?.apiKeyEnvName === "string" && entry.apiKeyEnvName.trim()
          ? entry.apiKeyEnvName.trim()
          : builtinEnvMap[provider] || (provider === "deepseek" ? "DEEPSEEK_API_KEY" : undefined),
      baseUrl:
        typeof entry?.baseUrl === "string" && entry.baseUrl.trim() ? entry.baseUrl.trim() : undefined,
      headers:
        entry?.headers && typeof entry.headers === "object" && !Array.isArray(entry.headers)
          ? Object.fromEntries(
              Object.entries(entry.headers).filter(
                ([key, value]) => typeof key === "string" && typeof value === "string" && key.trim() && value.trim(),
              ),
            )
          : undefined,
    });
  }

  return [...deduped.values()];
}

function defaultCompatConfig() {
  return {
    openclaw: {
      auth: { profiles: {} },
      models: { mode: "merge", providers: {} },
      agents: {
        defaults: {
          compaction: {
            mode: "safeguard",
          },
        },
        list: [],
      },
      tools: {
        web: {
          search: { enabled: false },
          fetch: { enabled: false },
        },
      },
      messages: {
        ackReactionScope: "group-mentions",
      },
      commands: {
        native: "auto",
        nativeSkills: "auto",
      },
      hooks: {
        internal: {
          enabled: true,
          entries: {
            "boot-md": { enabled: true },
            "command-logger": { enabled: true },
            "session-memory": { enabled: true },
          },
        },
      },
      channels: {},
      gateway: {
        mode: "local",
        bind: "loopback",
      },
      skills: {
        install: {
          nodeManager: "npm",
        },
      },
      plugins: {
        entries: {},
        installs: {},
      },
      bindings: [],
    },
  };
}

function getProviderCatalog() {
  const registry = new ModelRegistry(
    AuthStorage.inMemory(),
    join(projectRoot, ".pitest-ignore-global-models.json"),
  );
  const grouped = new Map();

  for (const model of registry.getAll()) {
    if (!builtinEnvMap[model.provider]) {
      continue;
    }

    const current = grouped.get(model.provider) || [];
    current.push({
      id: model.id,
      name: model.name || model.id,
      reasoning: Boolean(model.reasoning),
      contextWindow: Number(model.contextWindow || 0),
      maxTokens: Number(model.maxTokens || 0),
      supportsImages: Array.isArray(model.input) && model.input.includes("image"),
    });
    grouped.set(model.provider, current);
  }

  const builtinProviders = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, unsortedModels]) => {
      const models = unsortedModels.sort((left, right) => left.id.localeCompare(right.id));
      return {
        provider,
        label: providerDisplayName(provider),
        kind: "pi-builtin",
        apiKeyEnvName: builtinEnvMap[provider],
        defaultModel: models[0]?.id || "",
        models,
      };
    });

  return {
    builtinProviders,
    customProviders: [
      {
        provider: "deepseek",
        label: "DeepSeek",
        kind: "app-custom",
        apiKeyEnvName: "DEEPSEEK_API_KEY",
        defaultModel: "deepseek-chat",
        models: [
          {
            id: "deepseek-chat",
            name: "DeepSeek Chat",
            reasoning: false,
            contextWindow: 128000,
            maxTokens: 8192,
            supportsImages: false,
          },
          {
            id: "deepseek-reasoner",
            name: "DeepSeek Reasoner",
            reasoning: true,
            contextWindow: 128000,
            maxTokens: 8192,
            supportsImages: false,
          },
        ],
      },
    ],
  };
}

function buildModelsJson(config, providerCatalog) {
  const providers = {};

  for (const entry of config.providers) {
    if (!entry.enabled) {
      continue;
    }

    if (entry.provider === "deepseek") {
      const deepseek = findProvider(providerCatalog, "deepseek");
      providers.deepseek = {
        baseUrl: "https://api.deepseek.com/v1",
        api: "openai-completions",
        apiKey: entry.apiKeyEnvName || "DEEPSEEK_API_KEY",
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
        models: (deepseek?.models || []).map((model) => ({
          id: model.id,
          name: model.name,
          reasoning: model.reasoning,
          input: model.supportsImages ? ["text", "image"] : ["text"],
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        })),
      };
      continue;
    }

    if (!findProvider(providerCatalog, entry.provider)) {
      continue;
    }

    const providerConfig = {};
    if (entry.baseUrl) {
      providerConfig.baseUrl = entry.baseUrl;
      if (entry.apiKeyEnvName) {
        providerConfig.apiKey = entry.apiKeyEnvName;
      }
      if (entry.headers && Object.keys(entry.headers).length > 0) {
        providerConfig.headers = entry.headers;
      }
    }
    if (Object.keys(providerConfig).length > 0) {
      providers[entry.provider] = providerConfig;
    }
  }

  return { providers };
}

function buildSettingsJson(config) {
  const compaction = resolveCompactionConfig(config);
  return {
    compaction: {
      enabled: compaction.enabled,
      reserveTokens: compaction.reserveTokens,
      keepRecentTokens: compaction.keepRecentTokens,
    },
  };
}

function resolveCompactionConfig(config) {
  const compaction =
    config?.compat?.openclaw?.agents?.defaults?.compaction &&
    typeof config.compat.openclaw.agents.defaults.compaction === "object"
      ? config.compat.openclaw.agents.defaults.compaction
      : {};
  const mode = typeof compaction.mode === "string" && compaction.mode.trim()
    ? compaction.mode.trim()
    : "safeguard";
  const enabled = typeof compaction.enabled === "boolean"
    ? compaction.enabled
    : !["off", "disabled"].includes(mode.toLowerCase());
  return {
    mode,
    enabled,
    reserveTokens:
      typeof compaction.reserveTokens === "number" && compaction.reserveTokens > 0
        ? compaction.reserveTokens
        : 24576,
    keepRecentTokens:
      typeof compaction.keepRecentTokens === "number" && compaction.keepRecentTokens > 0
        ? compaction.keepRecentTokens
        : 16000,
  };
}

function resolveModelForProvider(providerCatalog, configuredProviders, provider, requestedModel) {
  const providerEntry = findProvider(providerCatalog, provider);
  if (!providerEntry) {
    return requestedModel || "";
  }

  if (requestedModel && providerEntry.models.some((entry) => entry.id === requestedModel)) {
    return requestedModel;
  }

  const configuredProvider = configuredProviders.find((entry) => entry.provider === provider);
  if (
    configuredProvider?.defaultModel &&
    providerEntry.models.some((entry) => entry.id === configuredProvider.defaultModel)
  ) {
    return configuredProvider.defaultModel;
  }

  return providerEntry.defaultModel || providerEntry.models[0]?.id || "";
}

function findProvider(providerCatalog, provider) {
  return [...providerCatalog.customProviders, ...providerCatalog.builtinProviders]
    .find((entry) => entry.provider === provider);
}

function providerDisplayName(provider) {
  const labels = {
    openai: "OpenAI",
    "openai-codex": "OpenAI Codex",
    anthropic: "Anthropic",
    google: "Google",
    "google-antigravity": "Google Antigravity",
    "google-gemini-cli": "Google Gemini CLI",
    groq: "Groq",
    xai: "xAI",
    openrouter: "OpenRouter",
    mistral: "Mistral",
    cerebras: "Cerebras",
    huggingface: "Hugging Face",
    "kimi-coding": "Kimi Coding",
    minimax: "MiniMax",
    "minimax-cn": "MiniMax CN",
    zai: "ZAI",
    "vercel-ai-gateway": "Vercel AI Gateway",
  };

  return labels[provider] || provider;
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
