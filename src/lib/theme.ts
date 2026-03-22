export type AppearanceMode = "light" | "dark" | "system";
export type ThemeAccentId = "blue" | "teal" | "indigo" | "emerald" | "amber" | "rose";
export type ResolvedAppearance = "light" | "dark";

export type AppTerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  selectionBackground: string;
};

type ThemeTokenSet = {
  primary: string;
  ring: string;
  sidebarPrimary: string;
  sidebarRing: string;
  accentSolid: string;
  accentSolidAlt: string;
  accentSoft: string;
  accentSoftStrong: string;
  accentBorder: string;
  accentText: string;
  accentTextStrong: string;
  glowLeft: string;
  glowRight: string;
  glowBottom: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  surfaceTint: string;
  surfaceTintStrong: string;
  shadowSoft: string;
  shadowStrong: string;
  shadowChrome: string;
  terminal: AppTerminalTheme;
};

export type ThemeAccentOption = {
  id: ThemeAccentId;
  label: string;
  preview: string;
};

type ThemeDefinition = ThemeAccentOption & {
  light: ThemeTokenSet;
  dark: ThemeTokenSet;
};

const terminalLightBase = {
  background: "#f8fbff",
  foreground: "#10233f",
  cursorAccent: "#f8fbff",
  black: "#1e293b",
  red: "#dc2626",
  green: "#059669",
  yellow: "#ca8a04",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#dbe7f5",
  brightBlack: "#64748b",
  brightRed: "#ef4444",
  brightGreen: "#10b981",
  brightYellow: "#eab308",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#f8fafc",
} satisfies Omit<AppTerminalTheme, "blue" | "brightBlue" | "cursor" | "selectionBackground">;

const terminalDarkBase = {
  background: "#08101d",
  foreground: "#dce8f8",
  cursorAccent: "#08101d",
  black: "#0f172a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#475569",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
} satisfies Omit<AppTerminalTheme, "blue" | "brightBlue" | "cursor" | "selectionBackground">;

const themeRegistry: Record<ThemeAccentId, ThemeDefinition> = {
  blue: {
    id: "blue",
    label: "蓝色",
    preview: "#0a84ff",
    light: {
      primary: "oklch(0.62 0.18 252)",
      ring: "oklch(0.76 0.12 248)",
      sidebarPrimary: "oklch(0.62 0.18 252)",
      sidebarRing: "oklch(0.76 0.12 248)",
      accentSolid: "#0a84ff",
      accentSolidAlt: "#5ac8fa",
      accentSoft: "rgba(10, 132, 255, 0.1)",
      accentSoftStrong: "rgba(10, 132, 255, 0.16)",
      accentBorder: "rgba(10, 132, 255, 0.26)",
      accentText: "#0a5ec7",
      accentTextStrong: "#0f3d91",
      glowLeft: "rgba(90, 200, 250, 0.24)",
      glowRight: "rgba(10, 132, 255, 0.18)",
      glowBottom: "rgba(255, 159, 10, 0.16)",
      bgStart: "#edf3ff",
      bgMid: "#f7f9fc",
      bgEnd: "#eef4f8",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(41, 62, 107, 0.08)",
      shadowStrong: "rgba(41, 62, 107, 0.14)",
      shadowChrome: "rgba(10, 132, 255, 0.12)",
      terminal: {
        ...terminalLightBase,
        cursor: "#0a84ff",
        blue: "#2563eb",
        brightBlue: "#60a5fa",
        selectionBackground: "rgba(10, 132, 255, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.8 0.1 248)",
      ring: "oklch(0.7 0.08 248)",
      sidebarPrimary: "oklch(0.8 0.1 248)",
      sidebarRing: "oklch(0.7 0.08 248)",
      accentSolid: "#6eb7ff",
      accentSolidAlt: "#38bdf8",
      accentSoft: "rgba(74, 163, 255, 0.14)",
      accentSoftStrong: "rgba(74, 163, 255, 0.22)",
      accentBorder: "rgba(116, 182, 255, 0.34)",
      accentText: "#b8dcff",
      accentTextStrong: "#deefff",
      glowLeft: "rgba(56, 189, 248, 0.12)",
      glowRight: "rgba(37, 99, 235, 0.16)",
      glowBottom: "rgba(14, 165, 233, 0.12)",
      bgStart: "#07111e",
      bgMid: "#0d1626",
      bgEnd: "#121f32",
      surfaceTint: "rgba(17, 24, 39, 0.68)",
      surfaceTintStrong: "rgba(17, 24, 39, 0.82)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(74, 163, 255, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#93c5fd",
        blue: "#60a5fa",
        brightBlue: "#93c5fd",
        selectionBackground: "rgba(96, 165, 250, 0.24)",
      },
    },
  },
  teal: {
    id: "teal",
    label: "青绿",
    preview: "#14b8a6",
    light: {
      primary: "oklch(0.67 0.14 196)",
      ring: "oklch(0.78 0.1 196)",
      sidebarPrimary: "oklch(0.67 0.14 196)",
      sidebarRing: "oklch(0.78 0.1 196)",
      accentSolid: "#0f9f8f",
      accentSolidAlt: "#22d3ee",
      accentSoft: "rgba(20, 184, 166, 0.1)",
      accentSoftStrong: "rgba(20, 184, 166, 0.16)",
      accentBorder: "rgba(20, 184, 166, 0.24)",
      accentText: "#0f766e",
      accentTextStrong: "#115e59",
      glowLeft: "rgba(34, 211, 238, 0.2)",
      glowRight: "rgba(20, 184, 166, 0.16)",
      glowBottom: "rgba(16, 185, 129, 0.14)",
      bgStart: "#eefaf8",
      bgMid: "#f7fbfb",
      bgEnd: "#eef7f6",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(24, 63, 82, 0.08)",
      shadowStrong: "rgba(24, 63, 82, 0.14)",
      shadowChrome: "rgba(20, 184, 166, 0.14)",
      terminal: {
        ...terminalLightBase,
        cursor: "#0f9f8f",
        blue: "#0f766e",
        brightBlue: "#14b8a6",
        selectionBackground: "rgba(20, 184, 166, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.8 0.08 196)",
      ring: "oklch(0.72 0.08 196)",
      sidebarPrimary: "oklch(0.8 0.08 196)",
      sidebarRing: "oklch(0.72 0.08 196)",
      accentSolid: "#42d8c8",
      accentSolidAlt: "#67e8f9",
      accentSoft: "rgba(45, 212, 191, 0.14)",
      accentSoftStrong: "rgba(45, 212, 191, 0.22)",
      accentBorder: "rgba(94, 234, 212, 0.32)",
      accentText: "#aaf5ee",
      accentTextStrong: "#d7fbf7",
      glowLeft: "rgba(45, 212, 191, 0.1)",
      glowRight: "rgba(34, 211, 238, 0.14)",
      glowBottom: "rgba(20, 184, 166, 0.12)",
      bgStart: "#071615",
      bgMid: "#0d1f20",
      bgEnd: "#102425",
      surfaceTint: "rgba(15, 23, 42, 0.7)",
      surfaceTintStrong: "rgba(15, 23, 42, 0.84)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(45, 212, 191, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#5eead4",
        blue: "#2dd4bf",
        brightBlue: "#99f6e4",
        selectionBackground: "rgba(45, 212, 191, 0.22)",
      },
    },
  },
  indigo: {
    id: "indigo",
    label: "靛蓝",
    preview: "#6366f1",
    light: {
      primary: "oklch(0.62 0.16 278)",
      ring: "oklch(0.74 0.11 278)",
      sidebarPrimary: "oklch(0.62 0.16 278)",
      sidebarRing: "oklch(0.74 0.11 278)",
      accentSolid: "#6366f1",
      accentSolidAlt: "#818cf8",
      accentSoft: "rgba(99, 102, 241, 0.1)",
      accentSoftStrong: "rgba(99, 102, 241, 0.16)",
      accentBorder: "rgba(99, 102, 241, 0.24)",
      accentText: "#4f46e5",
      accentTextStrong: "#4338ca",
      glowLeft: "rgba(129, 140, 248, 0.18)",
      glowRight: "rgba(99, 102, 241, 0.15)",
      glowBottom: "rgba(168, 85, 247, 0.12)",
      bgStart: "#f0f2ff",
      bgMid: "#f8f9ff",
      bgEnd: "#f3f4ff",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(50, 58, 108, 0.08)",
      shadowStrong: "rgba(50, 58, 108, 0.14)",
      shadowChrome: "rgba(99, 102, 241, 0.14)",
      terminal: {
        ...terminalLightBase,
        cursor: "#6366f1",
        blue: "#4f46e5",
        brightBlue: "#818cf8",
        selectionBackground: "rgba(99, 102, 241, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.82 0.07 278)",
      ring: "oklch(0.74 0.07 278)",
      sidebarPrimary: "oklch(0.82 0.07 278)",
      sidebarRing: "oklch(0.74 0.07 278)",
      accentSolid: "#a5b4fc",
      accentSolidAlt: "#c4b5fd",
      accentSoft: "rgba(129, 140, 248, 0.14)",
      accentSoftStrong: "rgba(129, 140, 248, 0.22)",
      accentBorder: "rgba(165, 180, 252, 0.32)",
      accentText: "#dbe4ff",
      accentTextStrong: "#eef2ff",
      glowLeft: "rgba(129, 140, 248, 0.1)",
      glowRight: "rgba(168, 85, 247, 0.14)",
      glowBottom: "rgba(99, 102, 241, 0.12)",
      bgStart: "#0d1022",
      bgMid: "#14182d",
      bgEnd: "#181b34",
      surfaceTint: "rgba(17, 24, 39, 0.7)",
      surfaceTintStrong: "rgba(17, 24, 39, 0.84)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(129, 140, 248, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#c7d2fe",
        blue: "#818cf8",
        brightBlue: "#c7d2fe",
        selectionBackground: "rgba(129, 140, 248, 0.24)",
      },
    },
  },
  emerald: {
    id: "emerald",
    label: "翠绿",
    preview: "#10b981",
    light: {
      primary: "oklch(0.69 0.15 160)",
      ring: "oklch(0.8 0.09 160)",
      sidebarPrimary: "oklch(0.69 0.15 160)",
      sidebarRing: "oklch(0.8 0.09 160)",
      accentSolid: "#10b981",
      accentSolidAlt: "#34d399",
      accentSoft: "rgba(16, 185, 129, 0.1)",
      accentSoftStrong: "rgba(16, 185, 129, 0.16)",
      accentBorder: "rgba(16, 185, 129, 0.24)",
      accentText: "#047857",
      accentTextStrong: "#065f46",
      glowLeft: "rgba(52, 211, 153, 0.18)",
      glowRight: "rgba(16, 185, 129, 0.15)",
      glowBottom: "rgba(110, 231, 183, 0.12)",
      bgStart: "#eefbf5",
      bgMid: "#f8fbf9",
      bgEnd: "#eef8f3",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(31, 76, 63, 0.08)",
      shadowStrong: "rgba(31, 76, 63, 0.14)",
      shadowChrome: "rgba(16, 185, 129, 0.14)",
      terminal: {
        ...terminalLightBase,
        cursor: "#10b981",
        blue: "#059669",
        brightBlue: "#34d399",
        selectionBackground: "rgba(16, 185, 129, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.82 0.08 160)",
      ring: "oklch(0.72 0.08 160)",
      sidebarPrimary: "oklch(0.82 0.08 160)",
      sidebarRing: "oklch(0.72 0.08 160)",
      accentSolid: "#6ee7b7",
      accentSolidAlt: "#86efac",
      accentSoft: "rgba(16, 185, 129, 0.14)",
      accentSoftStrong: "rgba(16, 185, 129, 0.22)",
      accentBorder: "rgba(52, 211, 153, 0.32)",
      accentText: "#bff7df",
      accentTextStrong: "#dcfce7",
      glowLeft: "rgba(16, 185, 129, 0.1)",
      glowRight: "rgba(52, 211, 153, 0.14)",
      glowBottom: "rgba(110, 231, 183, 0.12)",
      bgStart: "#0a1611",
      bgMid: "#102019",
      bgEnd: "#12261f",
      surfaceTint: "rgba(17, 24, 39, 0.7)",
      surfaceTintStrong: "rgba(17, 24, 39, 0.84)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(16, 185, 129, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#86efac",
        blue: "#34d399",
        brightBlue: "#bbf7d0",
        selectionBackground: "rgba(16, 185, 129, 0.24)",
      },
    },
  },
  amber: {
    id: "amber",
    label: "琥珀",
    preview: "#f59e0b",
    light: {
      primary: "oklch(0.75 0.15 78)",
      ring: "oklch(0.84 0.1 78)",
      sidebarPrimary: "oklch(0.75 0.15 78)",
      sidebarRing: "oklch(0.84 0.1 78)",
      accentSolid: "#f59e0b",
      accentSolidAlt: "#fbbf24",
      accentSoft: "rgba(245, 158, 11, 0.1)",
      accentSoftStrong: "rgba(245, 158, 11, 0.16)",
      accentBorder: "rgba(245, 158, 11, 0.24)",
      accentText: "#b45309",
      accentTextStrong: "#92400e",
      glowLeft: "rgba(251, 191, 36, 0.2)",
      glowRight: "rgba(245, 158, 11, 0.14)",
      glowBottom: "rgba(251, 146, 60, 0.14)",
      bgStart: "#fff8ec",
      bgMid: "#fdfaf4",
      bgEnd: "#fff5e8",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(88, 63, 24, 0.08)",
      shadowStrong: "rgba(88, 63, 24, 0.14)",
      shadowChrome: "rgba(245, 158, 11, 0.14)",
      terminal: {
        ...terminalLightBase,
        cursor: "#f59e0b",
        blue: "#d97706",
        brightBlue: "#fbbf24",
        selectionBackground: "rgba(245, 158, 11, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.84 0.08 78)",
      ring: "oklch(0.76 0.08 78)",
      sidebarPrimary: "oklch(0.84 0.08 78)",
      sidebarRing: "oklch(0.76 0.08 78)",
      accentSolid: "#fcd34d",
      accentSolidAlt: "#fdba74",
      accentSoft: "rgba(245, 158, 11, 0.14)",
      accentSoftStrong: "rgba(245, 158, 11, 0.22)",
      accentBorder: "rgba(251, 191, 36, 0.32)",
      accentText: "#fde68a",
      accentTextStrong: "#fef3c7",
      glowLeft: "rgba(251, 191, 36, 0.1)",
      glowRight: "rgba(249, 115, 22, 0.14)",
      glowBottom: "rgba(245, 158, 11, 0.12)",
      bgStart: "#161108",
      bgMid: "#1f180c",
      bgEnd: "#241b0d",
      surfaceTint: "rgba(17, 24, 39, 0.7)",
      surfaceTintStrong: "rgba(17, 24, 39, 0.84)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(245, 158, 11, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#fcd34d",
        blue: "#f59e0b",
        brightBlue: "#fde68a",
        selectionBackground: "rgba(245, 158, 11, 0.24)",
      },
    },
  },
  rose: {
    id: "rose",
    label: "玫瑰",
    preview: "#f43f5e",
    light: {
      primary: "oklch(0.67 0.17 12)",
      ring: "oklch(0.78 0.1 12)",
      sidebarPrimary: "oklch(0.67 0.17 12)",
      sidebarRing: "oklch(0.78 0.1 12)",
      accentSolid: "#f43f5e",
      accentSolidAlt: "#fb7185",
      accentSoft: "rgba(244, 63, 94, 0.1)",
      accentSoftStrong: "rgba(244, 63, 94, 0.16)",
      accentBorder: "rgba(244, 63, 94, 0.24)",
      accentText: "#e11d48",
      accentTextStrong: "#be123c",
      glowLeft: "rgba(251, 113, 133, 0.2)",
      glowRight: "rgba(244, 63, 94, 0.15)",
      glowBottom: "rgba(251, 146, 60, 0.1)",
      bgStart: "#fff1f4",
      bgMid: "#fdf8fa",
      bgEnd: "#fff4f6",
      surfaceTint: "rgba(255, 255, 255, 0.58)",
      surfaceTintStrong: "rgba(255, 255, 255, 0.66)",
      shadowSoft: "rgba(98, 37, 57, 0.08)",
      shadowStrong: "rgba(98, 37, 57, 0.14)",
      shadowChrome: "rgba(244, 63, 94, 0.14)",
      terminal: {
        ...terminalLightBase,
        cursor: "#f43f5e",
        blue: "#e11d48",
        brightBlue: "#fb7185",
        selectionBackground: "rgba(244, 63, 94, 0.18)",
      },
    },
    dark: {
      primary: "oklch(0.82 0.08 12)",
      ring: "oklch(0.72 0.08 12)",
      sidebarPrimary: "oklch(0.82 0.08 12)",
      sidebarRing: "oklch(0.72 0.08 12)",
      accentSolid: "#fda4af",
      accentSolidAlt: "#fb7185",
      accentSoft: "rgba(244, 63, 94, 0.14)",
      accentSoftStrong: "rgba(244, 63, 94, 0.22)",
      accentBorder: "rgba(251, 113, 133, 0.32)",
      accentText: "#fecdd3",
      accentTextStrong: "#ffe4e6",
      glowLeft: "rgba(251, 113, 133, 0.1)",
      glowRight: "rgba(244, 63, 94, 0.14)",
      glowBottom: "rgba(225, 29, 72, 0.12)",
      bgStart: "#170c12",
      bgMid: "#21111a",
      bgEnd: "#28141f",
      surfaceTint: "rgba(17, 24, 39, 0.7)",
      surfaceTintStrong: "rgba(17, 24, 39, 0.84)",
      shadowSoft: "rgba(2, 6, 23, 0.28)",
      shadowStrong: "rgba(2, 6, 23, 0.42)",
      shadowChrome: "rgba(244, 63, 94, 0.16)",
      terminal: {
        ...terminalDarkBase,
        cursor: "#fda4af",
        blue: "#fb7185",
        brightBlue: "#fecdd3",
        selectionBackground: "rgba(244, 63, 94, 0.24)",
      },
    },
  },
};

export const themeAccentOptions: ThemeAccentOption[] = Object.values(themeRegistry).map(
  ({ id, label, preview }) => ({ id, label, preview }),
);

export function resolveSystemDarkPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveAppearanceMode(
  appearanceMode: AppearanceMode,
  prefersDark: boolean,
): ResolvedAppearance {
  if (appearanceMode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return appearanceMode;
}

export function getThemeDefinition(accent: ThemeAccentId) {
  return themeRegistry[accent] ?? themeRegistry.blue;
}

export function getAppTerminalTheme(
  accent: ThemeAccentId,
  appearanceMode: AppearanceMode,
  prefersDark: boolean,
) {
  const theme = getThemeDefinition(accent);
  return resolveAppearanceMode(appearanceMode, prefersDark) === "dark"
    ? theme.dark.terminal
    : theme.light.terminal;
}

export function applyAppTheme(input: {
  appearanceMode: AppearanceMode;
  themeAccent: ThemeAccentId;
  prefersDark: boolean;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const definition = getThemeDefinition(input.themeAccent);
  const resolvedAppearance = resolveAppearanceMode(input.appearanceMode, input.prefersDark);
  const tokens = resolvedAppearance === "dark" ? definition.dark : definition.light;

  root.classList.toggle("dark", resolvedAppearance === "dark");
  root.style.colorScheme = resolvedAppearance;
  root.dataset.themeAccent = input.themeAccent;
  root.dataset.appearanceMode = resolvedAppearance;

  root.style.setProperty("--primary", tokens.primary);
  root.style.setProperty("--ring", tokens.ring);
  root.style.setProperty("--sidebar-primary", tokens.sidebarPrimary);
  root.style.setProperty("--sidebar-ring", tokens.sidebarRing);
  root.style.setProperty("--app-accent-solid", tokens.accentSolid);
  root.style.setProperty("--app-accent-solid-alt", tokens.accentSolidAlt);
  root.style.setProperty("--app-accent-soft", tokens.accentSoft);
  root.style.setProperty("--app-accent-soft-strong", tokens.accentSoftStrong);
  root.style.setProperty("--app-accent-border", tokens.accentBorder);
  root.style.setProperty("--app-accent-text", tokens.accentText);
  root.style.setProperty("--app-accent-text-strong", tokens.accentTextStrong);
  root.style.setProperty("--app-glow-left", tokens.glowLeft);
  root.style.setProperty("--app-glow-right", tokens.glowRight);
  root.style.setProperty("--app-glow-bottom", tokens.glowBottom);
  root.style.setProperty("--app-bg-start", tokens.bgStart);
  root.style.setProperty("--app-bg-mid", tokens.bgMid);
  root.style.setProperty("--app-bg-end", tokens.bgEnd);
  root.style.setProperty("--app-surface-tint", tokens.surfaceTint);
  root.style.setProperty("--app-surface-tint-strong", tokens.surfaceTintStrong);
  root.style.setProperty("--app-shadow-soft", tokens.shadowSoft);
  root.style.setProperty("--app-shadow-strong", tokens.shadowStrong);
  root.style.setProperty("--app-shadow-chrome", tokens.shadowChrome);
}
